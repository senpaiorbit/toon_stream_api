// api/s_movies.js
export const config = { runtime: 'edge' };

import { BROWSER_HEADERS } from '../lib/scrape.js';
import { normalizeImage, scrapePagination, json, guardMethod } from '../lib/helper.js';

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    if (!url) return json({ success: false, error: 'Parameter "url" is required.' }, 400);

    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return json({ success: false, error: `Failed to fetch page: ${res.status}` }, res.status);

    const html = await res.text();

    // Derive category name from URL
    const parts    = url.split('/').filter(Boolean);
    const category = parts[parts.length - 1] || 'movies';
    const categoryName = category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    const results = [];
    for (const m of html.matchAll(/<li[^>]*class="[^"]*post-\d+[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
      const item    = m[1];
      const title   = item.match(/<h2[^>]*class="entry-title"[^>]*>([^<]+)<\/h2>/)?.[1]?.trim() ?? '';
      const itemUrl = item.match(/<a[^>]*href="([^"]+)"[^>]*class="lnk-blk"/)?.[1] ?? '';
      const poster  = normalizeImage(item.match(/<img[^>]*src="([^"]+)"/)?.[1] ?? '');
      const id      = itemUrl.split('/').filter(Boolean).pop() ?? '';
      if (title && itemUrl && id) results.push({ id, title, url: itemUrl, poster });
    }

    const pagination = scrapePagination(html);

    return json({
      success: true,
      category,
      categoryName,
      results,
      pagination: {
        currentPage: pagination.currentPage,
        totalPages:  pagination.totalPages,
        hasNextPage: pagination.hasNextPage,
        hasPrevPage: pagination.hasPrevPage,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
