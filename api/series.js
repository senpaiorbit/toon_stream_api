// api/series.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { normalizeImage, json, guardMethod } from '../lib/helper.js';

const clean   = (s) => s?.replace(/\s+/g, ' ').trim() ?? null;
const fixImg  = (src) => normalizeImage(src?.startsWith('//') ? 'https:' + src : src);
const first   = (html, re) => clean(html.match(re)?.[1]);
const allText = (html, re) => {
  const m = html.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/>([^<]+)</g)].map(x => clean(x[1])).filter(Boolean);
};

function parseSeries(html, slug) {
  return {
    seriesSlug:    slug,
    title:         first(html, /<h1 class="entry-title">(.*?)<\/h1>/),
    image:         fixImg(html.match(/<figure><img[^>]+src="([^"]+)"/)?.[1]),
    rating:        first(html, /TMDB<\/span>\s*([\d.]+)/),
    year:          first(html, /class="year[^"]*">(\d{4})<\/span>/),
    totalSeasons:  Number(first(html, /<span>(\d+)<\/span>\s*Seasons/) ?? 0),
    totalEpisodes: Number(first(html, /<span>(\d+)<\/span>\s*Episodes/) ?? 0),
    categories:    allText(html, /class="genres">([\s\S]*?)<\/span>/),
    tags:          allText(html, /class="tag fa-tag">([\s\S]*?)<\/span>/),
    cast:          allText(html, /class="loadactor">([\s\S]*?)<\/p>/),
    availableSeasons: [...new Set(
      [...html.matchAll(/data-season="(\d+)"/g)].map(m => Number(m[1]))
    )].sort((a, b) => a - b).map(n => ({ seasonNumber: n, name: `Season ${n}` })),
  };
}

function parseEpisodes(html) {
  const episodes = [];
  for (const b of html.split('<article class="post dfx fcl episodes').slice(1)) {
    const ep  = first(b, /<span class="num-epi">(.*?)<\/span>/);
    const url = b.match(/<a href="([^"]+\/episode\/[^"]+)"/)?.[1];
    if (!ep || !url) continue;
    episodes.push({
      seasonNumber:  Number(ep.split('x')[0]),
      episodeNumber: ep,
      title:         first(b, /<h2 class="entry-title">(.*?)<\/h2>/),
      image:         fixImg(b.match(/<img[^>]+src="([^"]+)"/)?.[1]),
      time:          first(b, /class="time">(.*?)<\/span>/),
      url,
      servers: [{ serverNumber: 0, displayNumber: 1, name: 'X', src: null }],
    });
  }
  return episodes;
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug) return json({ success: false, error: 'Parameter "slug" is required.' }, 400);

    const { html } = await fetchPage(`/series/${slug}/`);

    const series      = parseSeries(html, slug);
    const episodesRaw = parseEpisodes(html);

    const seasonsMap = {};
    for (const ep of episodesRaw) {
      if (!seasonsMap[ep.seasonNumber]) {
        seasonsMap[ep.seasonNumber] = {
          seasonNumber: ep.seasonNumber,
          year:         series.year,
          rating:       series.rating,
          episodes:     [],
        };
      }
      seasonsMap[ep.seasonNumber].episodes.push(ep);
    }
    const seasons = Object.values(seasonsMap);

    return json({
      success: true,
      data: {
        ...series,
        requestedSeasons: seasons.map(s => s.seasonNumber),
        seasons,
      },
      stats: {
        totalSeasons:         series.totalSeasons,
        requestedSeasons:     seasons.length,
        fetchedEpisodes:      episodesRaw.length,
        includesServerSources: true,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
