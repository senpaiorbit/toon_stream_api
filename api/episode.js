// api/episode.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

function getBaseUrl() {
  try {
    const baseUrlPath = path.join(__dirname, '../src/baseurl.txt');
    return fs.readFileSync(baseUrlPath, 'utf-8').trim();
  } catch (error) {
    console.error('Error reading baseurl.txt:', error);
    return null;
  }
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  return imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
}

/* =========================
   SERVER QUERY PARSERS
========================= */

function parseServers(serverParam, totalServers) {
  if (!serverParam) return null;

  if (serverParam.toLowerCase() === 'all') {
    return Array.from({ length: totalServers }, (_, i) => i);
  }

  const servers = [];
  const parts = serverParam.split(',');

  for (const part of parts) {
    const trimmed = part.trim();

    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!servers.includes(i)) servers.push(i);
        }
      }
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && !servers.includes(num)) {
        servers.push(num);
      }
    }
  }

  return servers.sort((a, b) => a - b);
}

function parseServerNames(serverParam) {
  if (!serverParam) return null;
  if (serverParam.toLowerCase() === 'all') return 'all';
  return serverParam.split(',').map(s => s.trim().toLowerCase());
}

/* =========================
   METADATA SCRAPERS
========================= */

function scrapeEpisodeMetadata($) {
  const $article = $('article.post.single');

  return {
    title: $article.find('.entry-title').text().trim(),
    image: extractImageUrl($article.find('.post-thumbnail img').attr('src')),
    description: $article.find('.description').text().trim(),
    duration: $article.find('.duration').text().replace('min', '').trim(),
    year: $article.find('.year').text().trim(),
    rating: $('.vote .num').text().trim()
  };
}

function scrapeCategories($) {
  const categories = [];
  $('.genres a').each((i, el) => {
    categories.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return categories;
}

function scrapeCast($) {
  const cast = [];
  $('.cast-lst a').each((i, el) => {
    cast.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return cast;
}

function scrapeNavigation($) {
  const nav = {
    previousEpisode: null,
    nextEpisode: null,
    seriesPage: null
  };

  $('.epsdsnv a, .epsdsnv span').each((i, el) => {
    const text = $(el).text().toLowerCase();
    const href = $(el).attr('href');

    if (text.includes('previous') && href) nav.previousEpisode = href;
    else if (text.includes('next') && href) nav.nextEpisode = href;
    else if (text.includes('season') && href) nav.seriesPage = href;
  });

  return nav;
}

/* =========================
   EMBED RESOLVER (NEW)
========================= */

async function resolveEmbedIframe(originalUrl) {
  try {
    const apiUrl =
      'https://toon-stream-api.vercel.app/api/embed.js?url=' +
      encodeURIComponent(originalUrl);

    const res = await axios.get(apiUrl, { timeout: 20000 });

    const iframeSrc = res?.data?.scraped?.iframe_src;
    const fallback = res?.data?.full_url || originalUrl;

    return iframeSrc || fallback;
  } catch (err) {
    return originalUrl;
  }
}

/* =========================
   SERVER SCRAPER
========================= */

async function scrapeServers($) {
  const servers = [];
  let serverIndex = 0;

  $('.video-player .video').each((i, el) => {
    const $iframe = $(el).find('iframe');
    const src = $iframe.attr('src') || $iframe.attr('data-src');

    if (src) {
      servers.push({
        serverNumber: serverIndex,
        src,
        isActive: $(el).hasClass('on')
      });
      serverIndex++;
    }
  });

  $('.aa-tbs-video li').each((i, el) => {
    const $btn = $(el).find('.btn');
    const serverNum = parseInt($btn.find('span').first().text()) - 1;
    const name = $btn.find('.server')
      .text()
      .replace('-Multi Audio', '')
      .replace('Multi Audio', '')
      .trim();

    if (servers[serverNum]) {
      servers[serverNum].name = name;
      servers[serverNum].displayNumber = serverNum + 1;
      servers[serverNum].isActive = $btn.hasClass('on');
    }
  });

  // 🔥 RESOLVE FIRST SERVER IFRAME ONLY
  if (servers.length > 0 && servers[0].src) {
    servers[0].src = await resolveEmbedIframe(servers[0].src);
  }

  return servers;
}

/* =========================
   FILTER SERVERS
========================= */

function filterServers(servers, serverQuery) {
  if (!serverQuery) return servers;

  const requestedNumbers = parseServers(serverQuery, servers.length);
  if (requestedNumbers?.length) {
    return servers.filter(s => requestedNumbers.includes(s.serverNumber));
  }

  const requestedNames = parseServerNames(serverQuery);
  if (requestedNames === 'all') return servers;

  if (requestedNames?.length) {
    return servers.filter(s =>
      s.name?.toLowerCase().includes(requestedNames[0])
    );
  }

  return servers;
}

/* =========================
   MAIN SCRAPER
========================= */

async function scrapeEpisodePage(baseUrl, episodeSlug, serverQuery) {
  const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;

  const response = await axios.get(episodeUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 30000
  });

  const $ = cheerio.load(response.data);

  const metadata = scrapeEpisodeMetadata($);
  const allServers = await scrapeServers($);
  const filteredServers = filterServers(allServers, serverQuery);

  return {
    success: true,
    data: {
      baseUrl,
      episodeUrl,
      episodeSlug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...metadata,
      categories: scrapeCategories($),
      cast: scrapeCast($),
      navigation: scrapeNavigation($),
      servers: filteredServers
    },
    stats: {
      totalServersAvailable: allServers.length,
      serversReturned: filteredServers.length
    }
  };
}

/* =========================
   VERCEL HANDLER
========================= */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'GET only' });
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return res.status(500).json({ success: false, error: 'Base URL missing' });
  }

  const episodeSlug = req.query.slug || req.query.episode;
  if (!episodeSlug) {
    return res.status(400).json({ success: false, error: 'Episode slug required' });
  }

  try {
    const result = await scrapeEpisodePage(
      baseUrl,
      episodeSlug,
      req.query.server
    );
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
