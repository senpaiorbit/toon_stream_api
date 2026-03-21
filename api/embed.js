// api/embed.js
export const config = { runtime: 'edge' };

import { BROWSER_HEADERS } from '../lib/scrape.js';

function normalizeUrl(input) {
  return input.replace(/&#038;|&amp;/gi, '&').replace(/&#x3D;|&#61;/gi, '=');
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl  = searchParams.get('url');
    const wantJson = searchParams.get('json') === '1';

    if (!rawUrl)
      return new Response(JSON.stringify({ error: 'url parameter is required' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });

    const decodedUrl = normalizeUrl(decodeURIComponent(rawUrl));
    const urlObj     = new URL(decodedUrl);

    const trid   = searchParams.get('trid')   || urlObj.searchParams.get('trid');
    const trtype = searchParams.get('trtype') || urlObj.searchParams.get('trtype');
    if (trid)   urlObj.searchParams.set('trid',   trid);
    if (trtype) urlObj.searchParams.set('trtype', trtype);

    const fullUrl = urlObj.toString();
    const res = await fetch(fullUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return Response.redirect(fullUrl, 302);

    const html      = await res.text();
    const iframeSrc = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] ?? null;

    if (wantJson) {
      return new Response(
        JSON.stringify({
          parsed:       { original_url: rawUrl, cleaned_url: decodedUrl, trid, trtype },
          resolved_url: fullUrl,
          result:       { iframe_src: iframeSrc, redirect_target: iframeSrc || fullUrl },
        }, null, 2),
        { headers: { 'content-type': 'application/json' } }
      );
    }

    return iframeSrc ? Response.redirect(iframeSrc, 302) : Response.redirect(fullUrl, 302);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Edge function crashed', message: err.message }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
