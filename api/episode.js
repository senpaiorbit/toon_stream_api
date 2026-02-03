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

// Parse server query
function parseServers(serverParam, totalServers) {
  if (!serverParam) return null;
  
  if (serverParam.toLowerCase() === 'all') {
    return Array.from({length: totalServers}, (_, i) => i);
  }
  
  const servers = [];
  const parts = serverParam.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Range: 0-4
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!servers.includes(i)) servers.push(i);
        }
      }
    }
    // Single number: 3
    else {
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
  
  if (serverParam.toLowerCase() === 'all') {
    return 'all';
  }
  
  // Split by comma and trim
  return serverParam.split(',').map(s => s.trim().toLowerCase());
}

// Extract iframe from HTML (embedded logic)
async function extractIframeFromUrl(originalUrl) {
  try {
    console.log(`Extracting iframe from: ${originalUrl}`);
    
    // Parse URL to rebuild it properly
    const urlObj = new URL(originalUrl);
    const fullUrl = urlObj.toString();
    
    // Fetch the page
    const response = await axios.get(fullUrl, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
      },
      timeout: 15000
    });
    
    if (response.status !== 200) {
      console.error('Failed to fetch page:', response.status);
      return originalUrl;
    }
    
    const html = response.data;
    
    // Extract iframe src using regex
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    
    if (iframeMatch && iframeMatch[1]) {
      const iframeSrc = iframeMatch[1];
      console.log(`Extracted iframe: ${iframeSrc}`);
      return iframeSrc;
    } else {
      console.log('No iframe found, using original URL');
      return originalUrl;
    }
    
  } catch (error) {
    console.error('Error extracting iframe:', error.message);
    // Fallback to original URL on error
    return originalUrl;
  }
}

// Scrape episode metadata
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

// Extract categories
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

// Extract cast
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

// Extract navigation buttons
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

// Extract servers/iframes
async function scrapeServers($) {
  const servers = [];
  let serverIndex = 0;
  
  // Extract from video player iframes
  $('.video-player .video').each((i, el) => {
    const $el = $(el);
    const $iframe = $el.find('iframe');
    const src = $iframe.attr('src') || $iframe.attr('data-src');
    
    if (src) {
      servers.push({
        serverNumber: serverIndex,
        originalSrc: src,
        src: src,
        isActive: $el.hasClass('on')
      });
      serverIndex++;
    }
  });
  
  // Extract server names from buttons
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
  
  // Process all servers - extract real iframe URLs
  console.log(`Processing ${servers.length} servers...`);
  for (let i = 0; i < servers.length; i++) {
    if (servers[i].originalSrc) {
      const extractedUrl = await extractIframeFromUrl(servers[i].originalSrc);
      servers[i].src = extractedUrl;
    }
  }
  
  return servers;
}

// Filter servers by query
function filterServers(servers, serverQuery) {
  if (!serverQuery) return servers;
  
  // Try parsing as numbers first
  const requestedNumbers = parseServers(serverQuery, servers.length);
  if (requestedNumbers && requestedNumbers.length > 0) {
    return servers.filter(s => requestedNumbers.includes(s.serverNumber));
  }
  
  // Try parsing as names
  const requestedNames = parseServerNames(serverQuery);
  if (requestedNames === 'all') {
    return servers;
  }
  
  if (requestedNames && requestedNames.length > 0) {
    return servers.filter(s => 
      requestedNames.some(name => s.name.toLowerCase().includes(name))
    );
  }
  
  return servers;
}

// Main scraper
async function scrapeEpisodePage(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;
    console.log(`Scraping: ${episodeUrl}`);
    
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    const metadata = scrapeEpisodeMetadata($);
    const allServers = await scrapeServers($);
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
