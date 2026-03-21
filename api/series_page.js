// api/series_page.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { parseMediaItem, scrapePostList, scrapePagination, json, guardMethod } from '../lib/helper.js';

function scrapeSeries(html) {
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
    const page = parseInt(new URL(request.url).searchParams.get('page') || '1');
    if (page < 1) return json({ success: false, error: 'Page must be 1 or greater.' }, 400);

    const path = page > 1 ? `/series/page/${page}/` : `/series/`;
    const { html, baseUrl } = await fetchPage(path);

    const series       = scrapeSeries(html);
    const pagination   = scrapePagination(html);
    const randomSeries = scrapePostList(html, 'widget_list_movies_series-4');
    const pageTitle    = html.match(/<[^>]*class="[^"]*section-title[^"]*"[^>]*>(.*?)<\/[^>]+>/)?.[1]?.trim() ?? '';

    return json({
      success: true,
      data: {
        baseUrl,
        pageUrl:   baseUrl + path,
        pageType:  'series',
        pageNumber: page,
        pageTitle,
        scrapedAt: new Date().toISOString(),
        series,
        pagination,
        randomSeries,
      },
      stats: {
        seriesCount:      series.length,
        randomSeriesCount: randomSeries.length,
        currentPage:      pagination.currentPage,
        totalPages:       pagination.totalPages,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
