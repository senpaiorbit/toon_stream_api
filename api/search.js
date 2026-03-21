// api/search.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { parseMediaItem, scrapePagination, json, guardMethod } from '../lib/helper.js';

function scrapeSearchResults(html) {
  const block = html.match(
    /<div[^>]*id="movies-a"[^>]*class="[^"]*aa-tb[^"]*"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/
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
    const query = searchParams.get('q');
    const page  = parseInt(searchParams.get('page') || '1');

    if (!query) return json({ success: false, error: 'Search query "q" is required.' }, 400);

    // Site search is served from the root path — not /home
    const path = page > 1
      ? `/page/${page}/?s=${encodeURIComponent(query)}`
      : `/?s=${encodeURIComponent(query)}`;

    const { html } = await fetchPage(path);
    const results    = scrapeSearchResults(html);
    const pagination = scrapePagination(html);

    return json({
      success: true,
      data: {
        searchQuery:  query,
        currentPage:  pagination.currentPage,
        totalPages:   pagination.totalPages,
        hasResults:   results.length > 0,
        results,
        pagination: {
          hasNextPage:  pagination.hasNextPage,
          hasPrevPage:  pagination.hasPrevPage,
          nextPageUrl:  pagination.nextPageUrl,
          currentPage:  pagination.currentPage,
          totalPages:   pagination.totalPages,
        },
      },
      stats: {
        resultsCount: results.length,
        seriesCount:  results.filter(r => r.contentType === 'series').length,
        moviesCount:  results.filter(r => r.contentType === 'movie').length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
