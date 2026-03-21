// api/index.js — site root info
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { json, guardMethod } from '../lib/helper.js';

const RE_TITLE   = /<title>([^<]+)<\/title>/i;
const RE_DESC    = /<meta name="description" content="([^"]+)"/i;
const RE_ARTICLE = /<div id="home-article">([\s\S]*?)<\/div>\s*<\/div>/i;
const RE_SUGGEST = /<a class="item" href="([^"]+)">([^<]+)<\/a>/gi;

function clean(str) {
  return str
    ? str.replace(/&nbsp;|&#x27;|â€™|â€"|PokÃ©/g, "'").replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
    : null;
}

function extractMeta(html) {
  return {
    title:       clean(html.match(RE_TITLE)?.[1]),
    description: clean(html.match(RE_DESC)?.[1]),
  };
}

function extractHomepageArticle(html) {
  const art = html.match(RE_ARTICLE)?.[1];
  if (!art) return null;
  const intro = [];
  for (const m of art.matchAll(/<p[^>]*>(.*?)<\/p>/gi)) {
    const t = clean(m[1]);
    if (t && intro.length < 3) intro.push(t);
  }
  const sections = [];
  for (const m of art.matchAll(/<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>(.*?)<\/p>/gi))
    sections.push({ heading: clean(m[1]), content: clean(m[2]) });
  return { intro, sections };
}

function extractSuggestions(html) {
  const results = [];
  let m;
  RE_SUGGEST.lastIndex = 0;
  while ((m = RE_SUGGEST.exec(html)) !== null)
    results.push({ title: clean(m[2]), url: m[1] });
  return results;
}

export default async function handler(req) {
  const guard = guardMethod(req);
  if (guard) return guard;

  try {
    const { html } = await fetchPage('/');
    return json({
      success:     true,
      site:        extractMeta(html),
      homepage:    extractHomepageArticle(html),
      suggestions: extractSuggestions(html),
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
