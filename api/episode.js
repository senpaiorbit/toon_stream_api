// api/episode.js
export const config = { runtime: 'edge' };

import { fetchPage, getBaseUrl } from '../lib/scrape.js';
import { normalizeImage, json, guardMethod } from '../lib/helper.js';

function scrapeEpisodeInfo(html) {
  const catBlock  = html.match(/<span[^>]*class="[^"]*genres[^"]*"[^>]*>(.*?)<\/span>/s)?.[1] ?? '';
  const castBlock = html.match(/<ul[^>]*class="[^"]*cast-lst[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/s)?.[1] ?? '';
  return {
    title:       html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/)?.[1]?.trim() ?? '',
    image:       normalizeImage(html.match(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1]),
    description: html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/s)?.[1]?.trim() ?? '',
    duration:    html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(\d+)\s*min<\/span>/)?.[1] ?? '',
    year:        html.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/)?.[1] ?? '',
    rating:      html.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*num[^"]*"[^>]*>([\d.]+)<\/span>/)?.[1] ?? '',
    categories:  [...catBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(m => ({ name: m[2].trim(), url: m[1] })),
    cast:        [...castBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(m => ({ name: m[2].trim(), url: m[1] })),
  };
}

function scrapeNavigation(html) {
  const block = html.match(/<div[^>]*class="[^"]*epsdsnv[^"]*"[^>]*>(.*?)<\/div>/s)?.[1] ?? '';
  return {
    previousEpisode: block.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Previous/)?.[1] ?? null,
    nextEpisode:     block.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Next/)?.[1] ?? null,
    seriesPage:      block.match(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Seasons/)?.[1] ?? null,
  };
}

function scrapeSeasons(html) {
  return [...html.matchAll(
    /<li[^>]*class="[^"]*sel-temp[^"]*"[^>]*><a[^>]+data-post="([^"]+)"[^>]+data-season="([^"]+)"[^>]*>(.*?)<\/a>/g
  )].map(m => ({ name: m[3].trim(), seasonNumber: parseInt(m[2]), dataPost: m[1], dataSeason: m[2] }));
}

function scrapeEpisodes(html) {
  const block = html.match(/<ul[^>]*id="episode_by_temp"[^>]*>(.*?)<\/ul>/s)?.[1];
  if (!block) return [];
  return [...block.matchAll(/<li[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g)].map(item => {
    const c = item[1];
    return {
      episodeNumber: c.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/)?.[1]?.trim() ?? '',
      title:         c.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/)?.[1]?.trim() ?? '',
      image:         normalizeImage(c.match(/<img[^>]+src="([^"]+)"/)?.[1]),
      time:          c.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/)?.[1]?.trim() ?? '',
      url:           c.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/)?.[1] ?? '',
    };
  });
}

async function fetchEmbedUrl(originalUrl) {
  try {
    const base = await getBaseUrl();
    const r = await fetch(
      `${new URL(base).origin}/api/embed?url=${encodeURIComponent(originalUrl)}&json=1`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    return d.result?.iframe_src || d.result?.redirect_target || null;
  } catch { return null; }
}

async function scrapeServers(html) {
  const iframeMap = {};
  for (const m of html.matchAll(/<div[^>]*id="options-(\d+)"[^>]*>[\s\S]*?<iframe[^>]+(?:src|data-src)="([^"]+)"/g))
    iframeMap[m[1]] = m[2];

  const serverBlock = html.match(/<ul[^>]*class="[^"]*aa-tbs aa-tbs-video[^"]*"[^>]*>(.*?)<\/ul>/s)?.[1] ?? '';
  const serverData = [...serverBlock.matchAll(
    /<a[^>]+class="[^"]*btn([^"]*)"[^>]+href="#(options-\d+)"[^>]*>[\s\S]*?Sever\s*<span>(\d+)<\/span>[\s\S]*?<span[^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/span>/g
  )].map(s => {
    const n = s[2].match(/options-(\d+)/);
    return {
      serverNumber:  n ? parseInt(n[1]) : 0,
      displayNumber: parseInt(s[3]),
      name:          s[4].replace(/-Multi Audio|-Hindi-Eng-Jap|-Hindi-Eng/g, '').trim(),
      targetId:      s[2],
      isActive:      s[1].includes('on'),
      originalSrc:   iframeMap[n?.[1]] ?? '',
    };
  });

  const srcs = await Promise.all(serverData.map(s => s.originalSrc ? fetchEmbedUrl(s.originalSrc) : Promise.resolve(null)));
  return serverData.map((s, i) => ({ ...s, src: srcs[i] || s.originalSrc }));
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug) return json({ success: false, error: 'Parameter "slug" is required.' }, 400);

    const { html, baseUrl } = await fetchPage(`/episode/${slug}/`);

    const episodeInfo = scrapeEpisodeInfo(html);
    const navigation  = scrapeNavigation(html);
    const seasons     = scrapeSeasons(html);
    const episodes    = scrapeEpisodes(html);
    const servers     = await scrapeServers(html);

    const langKeywords = ['English','Hindi','Japanese','Spanish','French','German','Korean','Tamil','Portuguese','Chinese'];
    const languages = episodeInfo.categories
      .filter(c => langKeywords.some(l => c.name.toLowerCase() === l.toLowerCase()))
      .map(c => c.name);

    return json({
      success: true,
      data: {
        baseUrl, episodeUrl: `${baseUrl}/episode/${slug}/`,
        episodeSlug: slug, pageType: 'episode',
        scrapedAt: new Date().toISOString(),
        ...episodeInfo, languages, navigation, seasons, episodes, servers,
      },
      stats: {
        totalServersAvailable: servers.length,
        serversReturned:       servers.length,
        castCount:             episodeInfo.cast.length,
        categoriesCount:       episodeInfo.categories.length,
        languagesCount:        languages.length,
        seasonsCount:          seasons.length,
        episodesCount:         episodes.length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
