// api/cast.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { parseMediaItem, scrapePostList, scrapePagination, json, guardMethod } from '../lib/helper.js';

function scrapeContent(html) {
  const block = html.match(
    /<div[^>]*class="[^"]*section movies[^"]*"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/
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
    const castName = searchParams.get('cast');
    const page     = parseInt(searchParams.get('page') || '1');

    if (!castName) return json({ success: false, error: 'Parameter "cast" is required.' }, 400);
    if (page < 1)  return json({ success: false, error: 'Page must be 1 or greater.' }, 400);

    const castSlug = castName.toLowerCase().replace(/\s+/g, '-');

    // Removed /home prefix — cast pages are at /cast_tv/ on the site root
    const path = page > 1
      ? `/cast_tv/${castSlug}/page/${page}/`
      : `/cast_tv/${castSlug}/`;

    const { html, baseUrl } = await fetchPage(path);

    const pageTitle = html.match(/<[^>]*class="[^"]*section-title[^"]*"[^>]*>(.*?)<\/[^>]+>/)?.[1]?.trim() ?? castName;
    const content    = scrapeContent(html);
    const pagination = scrapePagination(html);
    const randomSeries = scrapePostList(html, 'widget_list_movies_series-4');
    const randomMovies = scrapePostList(html, 'widget_list_movies_series-5');

    return json({
      success: true,
      data: {
        baseUrl,
        pageUrl:     baseUrl + path,
        pageType:    'cast',
        castName:    pageTitle,
        castSlug,
        pageNumber:  page,
        scrapedAt:   new Date().toISOString(),
        content,
        pagination,
        randomSeries,
        randomMovies,
      },
      stats: {
        contentCount:      content.length,
        seriesCount:       content.filter(c => c.contentType === 'series').length,
        moviesCount:       content.filter(c => c.contentType === 'movie').length,
        randomSeriesCount: randomSeries.length,
        randomMoviesCount: randomMovies.length,
        currentPage:       pagination.currentPage,
        totalPages:        pagination.totalPages,
      },
    });
  } catch (err) {
    const is404 = err.message.includes('HTTP 404');
    return json({ success: false, error: is404 ? 'Cast page not found.' : err.message }, is404 ? 404 : 500);
  }
}
