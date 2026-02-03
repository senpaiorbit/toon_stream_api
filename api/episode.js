// api/episode.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

/* =========================
   BASE URL
========================= */

function getBaseUrl() {
  try {
    return fs
      .readFileSync(path.join(__dirname, '../src/baseurl.txt'), 'utf-8')
      .trim();
  } catch {
    return null;
  }
}

function extractImageUrl(src) {
  if (!src) return null;
  return src.startsWith('//') ? 'https:' + src : src;
}

/* =========================
   EMBED LOGIC (INLINE NODE)
========================= */

async function resolveEmbedIframe(originalUrl) {
  try {
    const urlObj = new URL(originalUrl);

    const baseUrl = urlObj.origin + urlObj.pathname;
    const trid = urlObj.searchParams.get('trid');
    const trtype = urlObj.searchParams.get('trtype');

    const finalUrl = new URL(baseUrl);
    if (trid) finalUrl.searchParams.set('trid', trid);
    if (trtype) finalUrl.searchParams.set('trtype', trtype);

    const fullUrl = finalUrl.toString();

    const res = await axios.get(fullUrl, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (NodeEmbed/1.0)'
      }
    });

    const html = res.data;
    const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);

    return match?.[1] || fullUrl;
  } catch {
    return originalUrl;
  }
}

/* =========================
   METADATA SCRAPERS
========================= */

function scrapeEpisodeMetadata($) {
  const $a = $('article.post.single');
  return {
    title: $a.find('.entry-title').text().trim(),
    image: extractImageUrl($a.find('.post-thumbnail img').attr('src')),
    description: $a.find('.description').text().trim(),
    duration: $a.find('.duration').text().replace('min', '').trim(),
    year: $a.find('.year').text().trim(),
    rating: $('.vote .num').text().trim()
  };
}

function scrapeCategories($) {
  return $('.genres a')
    .map((_, el) => ({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    }))
    .get();
}

function scrapeCast($) {
  return $('.cast-lst a')
    .map((_, el) => ({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    }))
    .get();
}

function scrapeNavigation($) {
  const nav = { previousEpisode: null, nextEpisode: null, seriesPage: null };

  $('.epsdsnv a, .epsdsnv span').each((_, el) => {
    const t = $(el).text().toLowerCase();
    const h = $(el).attr('href');
    if (t.includes('previous')) nav.previousEpisode = h;
    if (t.includes('next')) nav.nextEpisode = h;
    if (t.includes('season')) nav.seriesPage = h;
  });

  return nav;
}

/* =========================
   SERVER SCRAPER (ALL SERVERS)
========================= */

async function scrapeServers($) {
  const servers = [];

  $('.video-player .video iframe').each((i, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src) {
      servers.push({
        serverNumber: i,
        src,
        isActive: $(el).parent().hasClass('on')
      });
    }
  });

  $('.aa-tbs-video li').each((_, el) => {
    const idx = parseInt($(el).find('span').first().text()) - 1;
    if (!servers[idx]) return;

    servers[idx].name = $(el)
      .find('.server')
      .text()
      .replace(/multi audio/gi, '')
      .trim();

    servers[idx].displayNumber = idx + 1;
  });

  // 🔥 RESOLVE ALL SERVERS (PARALLEL)
  await Promise.all(
    servers.map(async s => {
      s.src = await resolveEmbedIframe(s.src);
    })
  );

  return servers;
}

/* =========================
   MAIN SCRAPER
========================= */

async function scrapeEpisodePage(baseUrl, slug) {
  const episodeUrl = `${baseUrl}/episode/${slug}/`;

  const res = await axios.get(episodeUrl, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const $ = cheerio.load(res.data);

  const servers = await scrapeServers($);

  return {
    success: true,
    data: {
      baseUrl,
      episodeUrl,
      episodeSlug: slug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...scrapeEpisodeMetadata($),
      categories: scrapeCategories($),
      cast: scrapeCast($),
      navigation: scrapeNavigation($),
      servers
    }
  };
}

/* =========================
   VERCEL HANDLER
========================= */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return res.status(500).json({ error: 'Base URL missing' });
  }

  const slug = req.query.slug || req.query.episode;
  if (!slug) {
    return res.status(400).json({ error: 'Episode slug required' });
  }

  try {
    const result = await scrapeEpisodePage(baseUrl, slug);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
