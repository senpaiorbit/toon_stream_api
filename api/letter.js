// api/letter.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { parseMediaItem, scrapePagination, json, guardMethod } from '../lib/helper.js';

function scrapeAlphabetNav(html) {
  const block = html.match(/<ul[^>]*class="[^"]*az-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/)?.[1];
  if (!block) return [];
  return [...block.matchAll(/<a[^>]*class="[^"]*btn([^"]*)"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
    .map(m => ({ letter: m[3].trim(), url: m[2], active: m[1].includes('on') }));
}

function scrapeContent(html) {
  const block = html.match(
    /<div[^>]*id="movies-a"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/
  )?.[1];
  if (!block) return [];
  const results = [];
  for (const item of block.matchAll(
    /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g
  )) {
    results.push(parseMediaItem(item[1], item[2], item[3]));
  }
  return results;
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const letter = searchParams.get('letter');
    const page   = parseInt(searchParams.get('page') || '1');

    if (!letter) return json({ success: false, error: 'Parameter "letter" is required.' }, 400);

    // Removed /home prefix — site serves /letter/ at root
    const path = page > 1
      ? `/letter/${letter}/page/${page}/`
      : `/letter/${letter}/`;

    const { html, baseUrl } = await fetchPage(path);

    const alphabetNav = scrapeAlphabetNav(html);
    const results     = scrapeContent(html);
    const pagination  = scrapePagination(html);

    return json({
      success: true,
      data: {
        baseUrl,
        letter:      letter.toUpperCase(),
        currentPage: pagination.currentPage,
        totalPages:  pagination.totalPages,
        alphabetNav,
        results,
        pagination: {
          hasNextPage: pagination.hasNextPage,
          hasPrevPage: pagination.hasPrevPage,
          nextPageUrl: pagination.nextPageUrl,
          prevPageUrl: pagination.prevPageUrl,
          currentPage: pagination.currentPage,
          totalPages:  pagination.totalPages,
          pages:       pagination.pages,
        },
      },
      stats: {
        resultsCount:     results.length,
        seriesCount:      results.filter(r => r.contentType === 'series').length,
        moviesCount:      results.filter(r => r.contentType === 'movie').length,
        alphabetNavCount: alphabetNav.length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
