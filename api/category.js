// api/category.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { normalizeImage, scrapePagination, json, guardMethod } from '../lib/helper.js';

function extractItems(html) {
  const items = [];
  for (const block of html.split('<li id="post-').slice(1)) {
    const id     = block.split('"')[0];
    const title  = block.match(/<h2 class="entry-title">(.*?)<\/h2>/)?.[1] ?? null;
    const image  = block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    const link   = block.match(/<a href="([^"]+)"[^>]*class="lnk-blk"/)?.[1] ?? null;
    const rating = block.match(/TMDB<\/span>\s*([\d.]+)/)?.[1] ?? null;
    if (!title || !link) continue;
    items.push({ id, title, image: normalizeImage(image), rating: rating ? Number(rating) : null, url: link });
  }
  return items;
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const page = searchParams.get('page');

    if (!path) return json({ error: 'category path required' }, 400);

    const sitePath = page ? `/category/${path}/page/${page}/` : `/category/${path}/`;
    const { html } = await fetchPage(sitePath);

    const items      = extractItems(html);
    const pagination = scrapePagination(html);

    return json({
      success:     true,
      category:    path,
      page:        page ? Number(page) : 1,
      total_items: items.length,
      items,
      pagination,
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
