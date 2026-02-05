// api/episode.js
const cheerio = require('cheerio');

// Cache for base URL and proxy URL (5 minutes)
let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch base URL from GitHub with caching
async function getBaseUrl() {
  const now = Date.now();
  
  if (baseUrlCache.url && (now - baseUrlCache.timestamp) < CACHE_DURATION) {
    return baseUrlCache.url;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const baseUrl = (await response.text()).trim().replace(/\/+$/, '');
      baseUrlCache = { url: baseUrl, timestamp: now };
      return baseUrl;
    }
  } catch (error) {
    console.error('Error fetching base URL from GitHub:', error.message);
  }
  
  // Fallback
  const fallbackUrl = 'https://toonstream.dad';
  baseUrlCache = { url: fallbackUrl, timestamp: now };
  return fallbackUrl;
}

// Fetch proxy URL from GitHub with caching
async function getProxyUrl() {
  const now = Date.now();
  
  if (proxyUrlCache.url && (now - proxyUrlCache.timestamp) < CACHE_DURATION) {
    return proxyUrlCache.url;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url: proxyUrl, timestamp: now };
      return proxyUrl;
    }
  } catch (error) {
    console.error('Error fetching proxy URL from GitHub:', error.message);
  }
  
  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

// Fetch with proxy fallback
async function fetchWithProxy(targetUrl, refererUrl = null) {
  const proxyUrl = await getProxyUrl();
  const baseUrl = await getBaseUrl();
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/plain,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'Referer': refererUrl || baseUrl
  };
  
  // Try proxy first
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await fetch(proxyFetchUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        const html = await proxyResponse.text();
        console.log('✓ Proxy fetch successful (HTML as text/plain)');
        return html;
      } else {
        console.log(`✗ Proxy returned ${proxyResponse.status}, falling back to direct fetch`);
      }
    } catch (proxyError) {
      console.log('✗ Proxy fetch failed:', proxyError.message);
    }
  }
  
  // Fallback to direct fetch
  try {
    const directResponse = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!directResponse.ok) {
      throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
    }
    
    const html = await directResponse.text();
    console.log('✓ Direct fetch successful');
    return html;
  } catch (directError) {
    throw new Error(`Both proxy and direct fetch failed: ${directError.message}`);
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
    
    const urlObj = new URL(originalUrl);
    const fullUrl = urlObj.toString();
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/plain,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };
    
    const proxyUrl = await getProxyUrl();
    let html = null;
    
    // Try proxy first for iframe extraction
    if (proxyUrl) {
      try {
        const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(fullUrl)}`;
        const proxyResponse = await fetch(proxyFetchUrl, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000)
        });
        
        if (proxyResponse.ok) {
          html = await proxyResponse.text();
        }
      } catch (proxyError) {
        console.log('Proxy failed for iframe extraction:', proxyError.message);
      }
    }
    
    // Fallback to direct fetch
    if (!html) {
      try {
        const directResponse = await fetch(fullUrl, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000)
        });
        
        if (directResponse.status !== 200) {
          console.error('Failed to fetch page:', directResponse.status);
          return originalUrl;
        }
        
        html = await directResponse.text();
      } catch (directError) {
        console.error('Error extracting iframe:', directError.message);
        return originalUrl;
      }
    }
    
    if (!html) {
      return originalUrl;
    }
    
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
    
    const html = await fetchWithProxy(episodeUrl, baseUrl);
    const $ = cheerio.load(html);
    
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
    if (error.message.includes('404')) {
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
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET request.' });
  }
  
  try {
    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({ success: false, error: 'Base URL not found.' });
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
