// api/home.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { normalizeImage, extractMetadata, scrapePostList, scrapePagination, json, guardMethod } from '../lib/helper.js';

/* ── Featured shows (logo strip) ─────────────────────────────────── */
function scrapeFeaturedShows(html) {
  const featured = [];
  for (const m of html.matchAll(
    /<div[^>]*class="[^"]*gs_logo_single--wrapper[^"]*"[^>]*>(.*?)<\/div>\s*(?=<div[^>]*class="[^"]*gs_logo_single--wrapper|<\/div>)/gs
  )) {
    const c = m[1];
    const img  = c.match(/<img[^>]+src="([^"]+)"[^>]*(?:title|alt)="([^"]+)"/);
    const link = c.match(/<a[^>]+href="([^"]+)"/);
    const src  = c.match(/srcset="([^"]+)"/);
    if (img || link) {
      featured.push({
        title:     img?.[2] ?? '',
        image:     normalizeImage(img?.[1]),
        searchUrl: link?.[1] ?? '',
        srcset:    src?.[1] ?? null,
      });
    }
  }
  return featured;
}

/* ── Latest episodes (widget_list_episodes-8) ─────────────────────── */
function scrapeLatestEpisodes(html) {
  const episodes = [];
  const section = html.match(
    /<section[^>]*id="widget_list_episodes-8"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/
  )?.[1];
  if (!section) return episodes;

  for (const item of section.matchAll(
    /<li[^>]*>\s*<article[^>]*class="[^"]*episodes[^"]*"[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g
  )) {
    const c = item[1];
    const numEpi = c.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/)?.[1]?.trim() ?? '';
    const epNum  = numEpi.match(/(\d+)x(\d+)/);
    episodes.push({
      title:         c.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
      episodeNumber: epNum ? { season: +epNum[1], episode: +epNum[2], full: numEpi } : { full: numEpi },
      image:         normalizeImage(c.match(/<img[^>]+src="([^"]+)"/)?.[1]),
      imageAlt:      c.match(/<img[^>]+alt="([^"]+)"/)?.[1] ?? '',
      url:           c.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/)?.[1] ?? '',
      timeAgo:       c.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/)?.[1]?.trim() ?? '',
    });
  }
  return episodes;
}

/* ── Weekly schedule ───────────────────────────────────────────────── */
function scrapeSchedule(html) {
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const schedule = {};
  for (const day of days) {
    const dayRe = new RegExp(
      `<div[^>]*class="[^"]*custom-tab-pane[^"]*"[^>]*id="${day}"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div[^>]*class="[^"]*custom-tab-pane|<\\/div>\\s*<\\/div>)`, 's'
    );
    const block = html.match(dayRe)?.[1] ?? '';
    const items = [];
    for (const m of block.matchAll(
      /<li[^>]*class="[^"]*custom-schedule-item[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*schedule-time[^"]*"[^>]*>(.*?)<\/span>[\s\S]*?<p[^>]*class="[^"]*schedule-description[^"]*"[^>]*>(.*?)<\/p>/g
    )) {
      items.push({ time: m[1].trim(), show: m[2].trim() });
    }
    schedule[day] = items;
  }
  return schedule;
}

/* ── Alphabet nav ──────────────────────────────────────────────────── */
function scrapeAlphabetNav(html) {
  const block = html.match(/<ul[^>]*class="[^"]*az-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  if (!block) return [];
  return [...block.matchAll(/<a[^>]*class="[^"]*btn([^"]*)"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
    .map(m => ({ letter: m[3].trim(), url: m[2], active: m[1].includes('on') }));
}

/* ── Handler ───────────────────────────────────────────────────────── */
export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    // Changed from '/' → '/home'
    const { html, baseUrl } = await fetchPage('/home');

    const data = {
      baseUrl,
      scrapedAt:      new Date().toISOString(),
      featured:       scrapeFeaturedShows(html),
      latestEpisodes: scrapeLatestEpisodes(html),
      latestSeries:   scrapePostList(html, 'widget_list_movies_series-2'),
      latestMovies:   scrapePostList(html, 'widget_list_movies_series-3'),
      schedule:       scrapeSchedule(html),
      alphabetNav:    scrapeAlphabetNav(html),
    };

    return json({
      success: true,
      data,
      stats: {
        featuredCount:       data.featured.length,
        latestEpisodesCount: data.latestEpisodes.length,
        latestSeriesCount:   data.latestSeries.length,
        latestMoviesCount:   data.latestMovies.length,
        scheduleCount:       Object.keys(data.schedule).length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
