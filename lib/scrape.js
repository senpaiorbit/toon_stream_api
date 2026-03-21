/**
 * lib/scrape.js — Universal Edge Scraper
 *
 * Single source of truth for:
 *   - Base URL resolution  (GitHub config, no hardcoded fallback)
 *   - CF Proxy resolution  (GitHub config, null if unavailable)
 *   - Proxy-aware page fetching (proxy → direct, with timeout)
 */

const GH_RAW =
  'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/';
const CACHE_TTL = 5 * 60 * 1000;

let _baseUrl = null,  _baseTs  = 0;
let _proxyUrl = null, _proxyTs = 0;

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function getBaseUrl() {
  const now = Date.now();
  if (_baseUrl && now - _baseTs < CACHE_TTL) return _baseUrl;
  const r = await fetch(GH_RAW + 'baseurl.txt');
  if (!r.ok) throw new Error('Could not load baseurl.txt from GitHub config');
  const text = (await r.text()).trim().replace(/\/+$/, '');
  if (!text.startsWith('http')) throw new Error(`Invalid base URL: "${text}"`);
  _baseUrl = text;
  _baseTs  = now;
  return _baseUrl;
}

export async function getProxyUrl() {
  const now = Date.now();
  if (now - _proxyTs < CACHE_TTL) return _proxyUrl;
  try {
    const r = await fetch(GH_RAW + 'cf_proxy.txt');
    if (!r.ok) { _proxyUrl = null; _proxyTs = now; return null; }
    const text = (await r.text()).trim().replace(/\/+$/, '');
    _proxyUrl = text.startsWith('http') ? text : null;
  } catch {
    _proxyUrl = null;
  }
  _proxyTs = now;
  return _proxyUrl;
}

export async function fetchPage(path) {
  const [baseUrl, proxyUrl] = await Promise.all([getBaseUrl(), getProxyUrl()]);
  const targetUrl = baseUrl + (path.startsWith('/') ? path : '/' + path);
  if (proxyUrl) {
    try {
      const r = await fetch(`${proxyUrl}?url=${encodeURIComponent(targetUrl)}`, {
        headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) return { html: await r.text(), baseUrl };
    } catch { /* fall through */ }
  }
  const r = await fetch(targetUrl, {
    headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} — ${targetUrl}`);
  return { html: await r.text(), baseUrl };
}
