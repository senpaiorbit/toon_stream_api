export const config = {
  runtime: 'edge',
};

/* =======================
   In-memory caches
======================= */
let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

/* =======================
   Helpers
======================= */
function now() {
  return Date.now();
}

function extractImageUrl(src) {
  if (!src) return null;
  return src.startsWith('//') ? 'https:' + src : src;
}

function createAbortSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/* =======================
   Base URL
======================= */
async function getBaseUrl() {
  const t = now();
  if (baseUrlCache.url && t - baseUrlCache.timestamp < CACHE_DURATION) {
    return baseUrlCache.url;
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt',
      { headers: { 'User-Agent': chromeUA } }
    );

    if (res.ok) {
      const url = (await res.text()).trim().replace(/\/+$/, '');
      baseUrlCache = { url, timestamp: t };
      return url;
    }
  } catch {}

  const fallback = 'https://toonstream.dad';
  baseUrlCache = { url: fallback, timestamp: t };
  return fallback;
}

/* =======================
   Proxy URL
======================= */
async function getProxyUrl() {
  const t = now();
  if (proxyUrlCache.url && t - proxyUrlCache.timestamp < CACHE_DURATION) {
    return proxyUrlCache.url;
  }

  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt',
      { headers: { 'User-Agent': chromeUA } }
    );

    if (res.ok) {
      const url = (await res.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url, timestamp: t };
      return url;
    }
  } catch {}

  proxyUrlCache = { url: null, timestamp: t };
  return null;
}

/* =======================
   Headers
======================= */
const chromeUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function buildHeaders(referer) {
  return {
    'User-Agent': chromeUA,
    Accept: 'text/plain,text/html,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: referer,
  };
}

/* =======================
   Fetch with proxy
======================= */
async function fetchWithProxy(url, referer) {
  const proxy = await getProxyUrl();
  const base = await getBaseUrl();
  const headers = buildHeaders(referer || base);

  if (proxy) {
    try {
      const res = await fetch(
        `${proxy}?url=${encodeURIComponent(url)}`,
        {
          headers,
          redirect: 'follow',
          signal: createAbortSignal(30000),
        }
      );

      if (res.ok) return await res.text();
    } catch {}
  }

  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: createAbortSignal(30000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/* =======================
   DOM utils
======================= */
function parseHTML(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

function text(el) {
  return el?.textContent?.trim() || '';
}

/* =======================
   Parsing helpers
======================= */
function parseSeasons(param) {
  if (!param) return [1];
  if (param === 'all' || param === 'latest') return param;

  const out = [];
  for (const part of param.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      const n = Number(part);
      if (!isNaN(n)) out.push(n);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function parseServers(param, total) {
  if (!param) return null;
  if (param === 'all') return [...Array(total).keys()];

  const out = [];
  for (const part of param.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      const n = Number(part);
      if (!isNaN(n)) out.push(n);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/* =======================
   Scrapers
======================= */
async function scrapeSeriesMetadata(baseUrl, slug) {
  const html = await fetchWithProxy(`${baseUrl}/series/${slug}/`, baseUrl);
  const doc = parseHTML(html);
  const article = doc.querySelector('article.post.single');

  const seasons = [...doc.querySelectorAll('.choose-season .sel-temp a')]
    .map(a => ({
      seasonNumber: Number(a.getAttribute('data-season')),
      name: text(a),
    }))
    .filter(s => !isNaN(s.seasonNumber))
    .sort((a, b) => a.seasonNumber - b.seasonNumber);

  return {
    title: text(article?.querySelector('.entry-title')),
    image: extractImageUrl(article?.querySelector('.post-thumbnail img')?.getAttribute('src')),
    duration: text(article?.querySelector('.duration')).replace('min.', ''),
    year: text(article?.querySelector('.year')),
    views: text(article?.querySelector('.views span')),
    totalSeasons: Number(text(article?.querySelector('.seasons span'))) || 0,
    totalEpisodes: Number(text(article?.querySelector('.episodes span'))) || 0,
    rating: text(article?.querySelector('.vote .num')),
    description: article?.querySelector('.description')?.innerHTML?.trim() || '',
    availableSeasons: seasons,
  };
}

async function scrapeEpisodeServers(baseUrl, slug, serverQuery) {
  const html = await fetchWithProxy(`${baseUrl}/episode/${slug}/`, baseUrl);
  const doc = parseHTML(html);

  const servers = [...doc.querySelectorAll('.video-player .video iframe')]
    .map((i, idx) => ({
      serverNumber: idx,
      src: i.getAttribute('src') || i.getAttribute('data-src'),
    }))
    .filter(s => s.src);

  const names = doc.querySelectorAll('.aa-tbs-video li .btn');
  names.forEach(btn => {
    const num = Number(btn.querySelector('span')?.textContent) - 1;
    if (servers[num]) {
      servers[num].name = text(btn.querySelector('.server')).replace('Multi Audio', '').trim();
      servers[num].displayNumber = num + 1;
    }
  });

  const filter = parseServers(serverQuery, servers.length);
  return filter ? servers.filter(s => filter.includes(s.serverNumber)) : servers;
}

async function scrapeSeasonEpisodes(baseUrl, slug, season, includeSrc, serverQuery) {
  const html = await fetchWithProxy(`${baseUrl}/episode/${slug}-${season}x1/`, baseUrl);
  const doc = parseHTML(html);

  const seasonData = {
    seasonNumber: season,
    episodes: [],
    categories: [],
    tags: [],
    cast: [],
    year: text(doc.querySelector('.year')),
    rating: text(doc.querySelector('.vote .num')),
  };

  doc.querySelectorAll('.genres a').forEach(a =>
    seasonData.categories.push({ name: text(a), url: a.href })
  );
  doc.querySelectorAll('.tag a').forEach(a =>
    seasonData.tags.push({ name: text(a), url: a.href })
  );
  doc.querySelectorAll('.cast-lst a').forEach(a =>
    seasonData.cast.push({ name: text(a), url: a.href })
  );

  doc.querySelectorAll('#episode_by_temp li article').forEach(a => {
    seasonData.episodes.push({
      episodeNumber: text(a.querySelector('.num-epi')),
      title: text(a.querySelector('.entry-title')),
      image: extractImageUrl(a.querySelector('img')?.getAttribute('src')),
      time: text(a.querySelector('.time')),
      url: a.querySelector('.lnk-blk')?.href,
    });
  });

  if (includeSrc) {
    for (const ep of seasonData.episodes) {
      const slug = ep.url?.split('/episode/')[1]?.replace('/', '');
      if (slug) ep.servers = await scrapeEpisodeServers(baseUrl, slug, serverQuery);
    }
  }

  return seasonData;
}

/* =======================
   Main handler
======================= */
export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = await getBaseUrl();

    const slug = searchParams.get('slug') || searchParams.get('series');
    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'Series slug required' }),
        { status: 400, headers }
      );
    }

    const seasons = searchParams.get('seasons') || searchParams.get('season');
    const includeSrc = searchParams.get('src') === 'true';
    const server = searchParams.get('server') || searchParams.get('servers');

    const meta = await scrapeSeriesMetadata(baseUrl, slug);
    let reqSeasons = parseSeasons(seasons);

    if (reqSeasons === 'all') reqSeasons = meta.availableSeasons.map(s => s.seasonNumber);
    if (reqSeasons === 'latest') reqSeasons = [Math.max(...meta.availableSeasons.map(s => s.seasonNumber))];

    const seasonsData = [];
    for (const s of reqSeasons) {
      seasonsData.push(await scrapeSeasonEpisodes(baseUrl, slug, s, includeSrc, server));
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          baseUrl,
          seriesSlug: slug,
          pageType: 'series',
          scrapedAt: new Date().toISOString(),
          includeServerSources: includeSrc,
          ...meta,
          seasons: seasonsData,
        },
      }),
      { status: 200, headers }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500, headers }
    );
  }
}
