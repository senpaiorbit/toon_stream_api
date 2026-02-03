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

// Parse server query (numbers: 0,1-3,all)
function parseServers(serverParam, totalServers) {
  if (!serverParam) return null;
  
  if (serverParam.toLowerCase() === 'all') {
    return Array.from({length: totalServers}, (_, i) => i);
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

// Parse server name query
function parseServerNames(serverParam) {
  if (!serverParam) return null;
  if (serverParam.toLowerCase() === 'all') return 'all';
  return serverParam.split(',').map(s => s.trim().toLowerCase());
}

// Scrape episode metadata (unchanged)
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
    const $el = $(el);
    const text = $el.text().toLowerCase();
    const href = $el.attr('href');
    
    if (text.includes('previous') && href) {
      nav.previousEpisode = href;
    } else if (text.includes('next') && href) {
      nav.nextEpisode = href;
    } else if (text.includes('season') && href) {
      nav.seriesPage = href;
    }
  });
  
  return nav;
}

// NEW: Try to get real iframe src from the toon-stream-api
async function getRealIframeSrc(trembed, trid, trtype) {
  try {
    const apiUrl = `https://toon-stream-api.vercel.app/api/embed.js?url=https://toonstream.one/home/?trembed=\( {trembed}&trid= \){trid}&trtype=${trtype}`;
    
    const res = await axios.get(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 10000
    });
    
    // Assuming the API returns JSON like: { iframe: "https://..." } or similar
    // Adjust this parsing depending on actual API response structure
    if (res.data && typeof res.data === 'object') {
      if (res.data.iframe) return res.data.iframe;
      if (res.data.src) return res.data.src;
      if (res.data.url) return res.data.url;
    }
    
    // If it's plain text or different format → you may need to adjust parsing
    return null;
  } catch (err) {
    console.error('embed API error:', err.message);
    return null;
  }
}

// Extract servers/iframes + special handling for server 0
async function scrapeServers($) {
  const servers = [];
  let serverIndex = 0;
  
  // 1. Get original iframes from page
  $('.video-player .video').each((i, el) => {
    const $el = $(el);
    const $iframe = $el.find('iframe');
    let src = $iframe.attr('src') || $iframe.attr('data-src') || null;
    
    if (src) {
      servers.push({
        serverNumber: serverIndex,
        src: src,
        isActive: $el.hasClass('on'),
        name: null,           // will be filled later
        displayNumber: null
      });
      serverIndex++;
    }
  });
  
  // 2. Get server names from buttons
  $('.aa-tbs-video li').each((i, el) => {
    const $el = $(el);
    const $btn = $el.find('.btn');
    const serverNum = parseInt($btn.find('span').first().text()) - 1;
    const serverName = $btn.find('.server').text()
      .replace('-Multi Audio', '')
      .replace('Multi Audio', '')
      .trim();
    
    if (servers[serverNum]) {
      servers[serverNum].name = serverName;
      servers[serverNum].displayNumber = serverNum + 1;
      servers[serverNum].isActive = $btn.hasClass('on');
    }
  });
  
  // 3. Special handling: replace FIRST server src with real iframe if possible
  if (servers.length > 0) {
    // Try to find trembed/trid/trtype from the FIRST original src
    const firstSrc = servers[0].src || '';
    const urlObj = new URL(firstSrc, 'https://example.com'); // dummy base
    
    const trembed = urlObj.searchParams.get('trembed') || '5';
    const trid     = urlObj.searchParams.get('trid')     || null;
    const trtype   = urlObj.searchParams.get('trtype')   || '1';
    
    if (trid) {
      const realIframe = await getRealIframeSrc(trembed, trid, trtype);
      
      const fullUrl = `https://toonstream.one/home/?trembed=\( {trembed}&trid= \){trid}&trtype=${trtype}`;
      
      servers[0].originalSrc = servers[0].src; // keep original for reference
      servers[0].src = realIframe || fullUrl;  // real iframe or fallback
      
      // Add extra info only on first server
      servers[0].extra = {
        parsed: {
          base_url: `https://toonstream.one/home/?trembed=${trembed}`,
          trid: trid,
          trtype: trtype
        },
        full_url: fullUrl,
        scraped: {
          iframe_src: realIframe || null
        }
      };
    }
  }
  
  return servers;
}

// Filter servers by query (unchanged)
function filterServers(servers, serverQuery) {
  if (!serverQuery) return servers;
  
  const requestedNumbers = parseServers(serverQuery, servers.length);
  if (requestedNumbers && requestedNumbers.length > 0) {
    return servers.filter(s => requestedNumbers.includes(s.serverNumber));
  }
  
  const requestedNames = parseServerNames(serverQuery);
  if (requestedNames === 'all') return servers;
  
  if (requestedNames && requestedNames.length > 0) {
    return servers.filter(s => 
      s.name && requestedNames.some(name => s.name.toLowerCase().includes(name))
    );
  }
  
  return servers;
}

// Main scraper
async function scrapeEpisodePage(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `\( {baseUrl}/episode/ \){episodeSlug}/`;
    console.log(`Scraping: ${episodeUrl}`);
    
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    const metadata = scrapeEpisodeMetadata($);
    const allServers = await scrapeServers($);           // now async
    const filteredServers = filterServers(allServers, serverQuery);
    
    const data = {
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
    };
    
    return {
      success: true,
      data,
      stats: {
        totalServersAvailable: allServers.length,
        serversReturned: filteredServers.length,
        castCount: data.cast.length,
        categoriesCount: data.categories.length
      }
    };
    
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Episode not found', statusCode: 404 };
    }
    return { success: false, error: error.message };
  }
}

// Vercel handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET request.' });
  }
  
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({ success: false, error: 'Base URL not found. Please check src/baseurl.txt file.' });
    }
    
    const episodeSlug = req.query.slug || req.query.episode;
    if (!episodeSlug) {
      return res.status(400).json({ 
        success: false, 
        error: 'Episode slug required. Examples: ?slug=attack-on-titan-2x1 or ?slug=attack-on-titan-2x1&server=0,1,2'
      });
    }
    
    const serverQuery = req.query.server || req.query.servers;
    
    const result = await scrapeEpisodePage(baseUrl, episodeSlug, serverQuery);
    
    if (!result.success && result.statusCode === 404) {
      return res.status(404).json(result);
    }
    
    res.status(result.success ? 200 : 500).json(result);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      message: error.message 
    });
  }
};
