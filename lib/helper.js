/**
 * lib/helper.js — Shared Parsing Helpers
 *
 * Exports: normalizeImage, extractMetadata, parseMediaItem,
 *          scrapePostList, scrapePagination, json, guardMethod
 */

/** Protocol-relative fix + TMDB width normalisation */
export function normalizeImage(url) {
  if (!url) return null;
  const u = url.startsWith('//') ? 'https:' + url : url;
  return u.replace(/\/w\d+\//g, '/w500/');
}

/** Extract structured metadata from a WordPress post class string */
export function extractMetadata(classList) {
  if (!classList) {
    return { categories: [], tags: [], cast: [], directors: [], countries: [], year: null, contentType: null };
  }
  const pick = (re) => [...classList.matchAll(re)].map(m => m[1].replace(/-/g, ' '));
  const contentType =
    classList.includes('type-series') ? 'series' :
    classList.includes('type-movies') ? 'movie'  :
    classList.includes('type-post')   ? 'post'   : null;
  const yearM = classList.match(/annee-(\d+)/);
  return {
    categories: pick(/category-([\w-]+)/g),
    tags:       pick(/tag-([\w-]+)/g),
    cast:       pick(/cast(?:_tv)?-([\w-]+)/g).slice(0, 10),
    directors:  pick(/directors?(?:_tv)?-([\w-]+)/g),
    countries:  pick(/country-([\w-]+)/g),
    year:       yearM ? yearM[1] : null,
    contentType,
  };
}

/** Parse a single media list item from its post ID, classList and inner HTML */
export function parseMediaItem(postId, classList, content) {
  const m = (re) => (content.match(re) || [])[1];
  return {
    id:       `post-${postId}`,
    title:    m(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/)?.replace(/<[^>]+>/g, '').trim() ?? '',
    image:    normalizeImage(m(/<img[^>]+src="([^"]+)"/)),
    imageAlt: m(/<img[^>]+alt="([^"]+)"/) ?? '',
    rating:   m(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/) ?? null,
    url:      m(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/) ?? '',
    ...extractMetadata(classList),
  };
}

/**
 * Scrape a standard .post-lst inside any container by its id attribute value.
 * Works for both <section id="..."> and <div id="...">.
 */
export function scrapePostList(html, containerId) {
  const re = new RegExp(
    `id="${containerId}"[\\s\\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\\s\\S]*?)<\\/ul>`, 's'
  );
  const block = html.match(re)?.[1];
  if (!block) return [];
  const results = [];
  for (const item of block.matchAll(
    /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g
  )) {
    results.push(parseMediaItem(item[1], item[2], item[3]));
  }
  return results;
}

/** Scrape the standard WordPress pagination block */
export function scrapePagination(html) {
  const out = {
    currentPage: 1, totalPages: 1,
    hasNextPage: false, hasPrevPage: false,
    nextPageUrl: null, prevPageUrl: null,
    pages: [],
  };
  const block = html.match(/<div[^>]*class="[^"]*nav-links[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  if (!block) return out;

  const cur = block.match(/<a[^>]*class="[^"]*page-link current[^"]*"[^>]*href="([^"]+)"[^>]*>(\d+)<\/a>/);
  if (cur) out.currentPage = parseInt(cur[2]);

  const prev = block.match(/<a[^>]+href="([^"]+)"[^>]*>PREV<\/a>/);
  if (prev) { out.hasPrevPage = true; out.prevPageUrl = prev[1]; }

  const next = block.match(/<a[^>]+href="([^"]+)"[^>]*>NEXT<\/a>/);
  if (next) { out.hasNextPage = true; out.nextPageUrl = next[1]; }

  for (const m of block.matchAll(
    /<a[^>]*class="[^"]*page-link[^"]*"[^>]*href="([^"]+)"[^>]*>(\d+)<\/a>/g
  )) {
    const n = parseInt(m[2]);
    if (!out.pages.find(p => p.page === n))
      out.pages.push({ page: n, url: m[1], current: m[0].includes('current') });
  }
  if (out.pages.length) out.totalPages = Math.max(...out.pages.map(p => p.page));
  return out;
}

/** Standard JSON response with CORS + Cache headers */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': status === 200
        ? 'public, s-maxage=300, stale-while-revalidate=600'
        : 'no-store',
    },
  });
}

/** Handle OPTIONS pre-flight + non-GET guard. Returns a Response or null. */
export function guardMethod(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'GET') {
    return json({ success: false, error: 'Method not allowed. Use GET.' }, 405);
  }
  return null;
}
