// api/catalog.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { parseMediaItem, scrapePagination, json, guardMethod } from '../lib/helper.js';

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
    const type = searchParams.get('type') || 'series';
    const page = parseInt(searchParams.get('page') || '1');

    if (!['series', 'movies'].includes(type))
      return json({ success: false, error: 'Invalid type. Must be "series" or "movies".' }, 400);

    const path = page > 1 ? `/${type}/page/${page}/` : `/${type}/`;
    const { html, baseUrl } = await fetchPage(path);

    const results    = scrapeContent(html);
    const pagination = scrapePagination(html);

    return json({
      success: true,
      data: {
        baseUrl,
        catalogUrl:   baseUrl + path,
        catalogType:  type,
        currentPage:  pagination.currentPage,
        totalPages:   pagination.totalPages,
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
        resultsCount: results.length,
        seriesCount:  results.filter(r => r.contentType === 'series').length,
        moviesCount:  results.filter(r => r.contentType === 'movie').length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
