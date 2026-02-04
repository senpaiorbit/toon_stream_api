// api/series.js
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
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
    'Upgrade-Insecure-Requests': '1'
  };
  
  if (refererUrl) {
    headers['Referer'] = refererUrl;
  }
  
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
        console.log('✓ Proxy fetch successful');
        return await proxyResponse.text();
      } else {
        console.log(`✗ Proxy returned ${proxyResponse.status}, falling back to direct fetch`);
      }
    } catch (proxyError) {
      console.log('✗ Proxy fetch failed:', proxyError.message);
    }
  }
  
  // Fallback to direct fetch
  try {
    const baseUrl = await getBaseUrl();
    if (!refererUrl) {
      headers['Referer'] = baseUrl;
    }
    
    const directResponse = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!directResponse.ok) {
      throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
    }
    
    console.log('✓ Direct fetch successful');
    return await directResponse.text();
  } catch (directError) {
    throw new Error(`Both proxy and direct fetch failed: ${directError.message}`);
  }
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  return imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
}

// Parse seasons query parameter
function parseSeasons(seasonsParam) {
  if (!seasonsParam) return [1]; // Default to season 1
  
  if (seasonsParam.toLowerCase() === 'all') {
    return 'all';
  }
  
  if (seasonsParam.toLowerCase() === 'latest') {
    return 'latest';
  }
  
  const seasons = [];
  const parts = seasonsParam.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Range: 2-4
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!seasons.includes(i)) seasons.push(i);
        }
      }
    }
    // Single number: 3
    else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && !seasons.includes(num)) {
        seasons.push(num);
      }
    }
  }
  
  return seasons.sort((a, b) => a - b);
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

// Scrape series metadata from main series page
async function scrapeSeriesMetadata(baseUrl, seriesSlug) {
  const seriesUrl = `${baseUrl}/series/${seriesSlug}/`;
  
  try {
    const html = await fetchWithProxy(seriesUrl, baseUrl);
    const $ = cheerio.load(html);
    const $article = $('article.post.single');
    
    // Extract available seasons
    const availableSeasons = [];
    $('.choose-season .sel-temp a').each((i, el) => {
      const seasonNum = parseInt($(el).attr('data-season'));
      if (!isNaN(seasonNum)) {
        availableSeasons.push({
          seasonNumber: seasonNum,
          name: $(el).text().trim()
        });
      }
    });
    
    return {
      title: $article.find('.entry-title').text().trim(),
      image: extractImageUrl($article.find('.post-thumbnail img').attr('src')),
      duration: $article.find('.duration').text().replace('min.', '').trim(),
      year: $article.find('.year').text().trim(),
      views: $article.find('.views span').first().text().trim(),
      totalSeasons: parseInt($article.find('.seasons span').text()) || 0,
      totalEpisodes: parseInt($article.find('.episodes span').text()) || 0,
      rating: $article.find('.vote .num').text().trim(),
      description: $article.find('.description').html()?.trim() || '',
      availableSeasons: availableSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber)
    };
  } catch (error) {
    throw new Error(`Failed to fetch series metadata: ${error.message}`);
  }
}

// Scrape episode servers
async function scrapeEpisodeServers(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;
    const html = await fetchWithProxy(episodeUrl, baseUrl);
    const $ = cheerio.load(html);
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
          src: src
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
      }
    });
    
    // Filter servers
    const requestedServers = parseServers(serverQuery, servers.length);
    if (requestedServers && requestedServers.length > 0) {
      return servers.filter(s => requestedServers.includes(s.serverNumber));
    }
    
    return servers;
  } catch (error) {
    console.error(`Failed to fetch servers for ${episodeSlug}:`, error.message);
    return [];
  }
}

// Scrape episodes for a specific season
async function scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNumber, includeSrc, serverQuery) {
  const episodeUrl = `${baseUrl}/episode/${seriesSlug}-${seasonNumber}x1/`;
  
  try {
    const html = await fetchWithProxy(episodeUrl, baseUrl);
    const $ = cheerio.load(html);
    
    const seasonData = {
      seasonNumber: seasonNumber,
      episodes: [],
      categories: [],
      tags: [],
      cast: [],
      year: $('article.post.single .year').text().trim(),
      rating: $('article.post.single .vote .num').text().trim()
    };
    
    // Extract categories
    $('article.post.single .genres a').each((i, el) => {
      seasonData.categories.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract tags
    $('article.post.single .tag a').each((i, el) => {
      seasonData.tags.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract cast
    $('article.post.single .cast-lst a').each((i, el) => {
      seasonData.cast.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract all episodes from episode list
    $('#episode_by_temp li').each((i, el) => {
      const $el = $(el);
      const $article = $el.find('article');
      const episodeNum = $article.find('.num-epi').text().trim();
      const url = $article.find('.lnk-blk').attr('href');
      
      const episode = {
        episodeNumber: episodeNum,
        title: $article.find('.entry-title').text().trim(),
        image: extractImageUrl($article.find('img').attr('src')),
        time: $article.find('.time').text().trim(),
        url: url
      };
      
      seasonData.episodes.push(episode);
    });
    
    // Fetch servers if requested
    if (includeSrc && seasonData.episodes.length > 0) {
      console.log(`Fetching servers for season ${seasonNumber}...`);
      for (const episode of seasonData.episodes) {
        const episodeSlug = episode.url.split('/episode/')[1]?.replace('/', '');
        if (episodeSlug) {
          episode.servers = await scrapeEpisodeServers(baseUrl, episodeSlug, serverQuery);
        }
      }
    }
    
    return seasonData;
  } catch (error) {
    console.error(`Failed to fetch season ${seasonNumber}:`, error.message);
    return {
      seasonNumber: seasonNumber,
      episodes: [],
      error: error.message
    };
  }
}

// Main scraper function
async function scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery) {
  try {
    // Get series metadata
    const metadata = await scrapeSeriesMetadata(baseUrl, seriesSlug);
    
    // Determine which seasons to fetch
    let requestedSeasons = parseSeasons(seasonsQuery);
    
    if (requestedSeasons === 'all') {
      requestedSeasons = metadata.availableSeasons.map(s => s.seasonNumber);
    } else if (requestedSeasons === 'latest') {
      // Get the highest season number (latest season)
      const latestSeason = Math.max(...metadata.availableSeasons.map(s => s.seasonNumber));
      requestedSeasons = [latestSeason];
    }
    
    // Validate requested seasons
    const validSeasons = requestedSeasons.filter(season => 
      metadata.availableSeasons.some(s => s.seasonNumber === season)
    );
    
    if (validSeasons.length === 0 && requestedSeasons.length > 0) {
      return {
        success: false,
        error: `None of the requested seasons (${requestedSeasons.join(', ')}) are available. Available seasons: ${metadata.availableSeasons.map(s => s.seasonNumber).join(', ')}`
      };
    }
    
    // Fetch episodes for each requested season
    const seasonsData = [];
    
    for (const seasonNum of validSeasons) {
      console.log(`Fetching season ${seasonNum}...`);
      const seasonData = await scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNum, includeSrc, serverQuery);
      seasonsData.push(seasonData);
    }
    
    // Combine categories, tags, and cast from all seasons (deduplicate)
    const allCategories = new Map();
    const allTags = new Map();
    const allCast = new Map();
    
    seasonsData.forEach(season => {
      season.categories.forEach(cat => allCategories.set(cat.name, cat));
      season.tags.forEach(tag => allTags.set(tag.name, tag));
      season.cast.forEach(member => allCast.set(member.name, member));
    });
    
    const data = {
      baseUrl,
      seriesUrl: `${baseUrl}/series/${seriesSlug}/`,
      seriesSlug,
      pageType: 'series',
      scrapedAt: new Date().toISOString(),
      requestedSeasons: validSeasons,
      includeServerSources: includeSrc || false,
      ...metadata,
      categories: Array.from(allCategories.values()),
      tags: Array.from(allTags.values()),
      cast: Array.from(allCast.values()),
      seasons: seasonsData
    };
    
    // Calculate total episodes from fetched seasons
    const totalFetchedEpisodes = seasonsData.reduce((sum, s) => sum + s.episodes.length, 0);
    
    return {
      success: true,
      data,
      stats: {
        totalSeasons: metadata.availableSeasons.length,
        requestedSeasons: validSeasons.length,
        fetchedEpisodes: totalFetchedEpisodes,
        castCount: data.cast.length,
        categoriesCount: data.categories.length,
        includesServerSources: includeSrc || false
      }
    };
    
  } catch (error) {
    if (error.message.includes('404')) {
      return { success: false, error: 'Series not found', statusCode: 404 };
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
    
    const seriesSlug = req.query.slug || req.query.series;
    if (!seriesSlug) {
      return res.status(400).json({ 
        success: false, 
        error: 'Series slug required. Use ?slug=attack-on-titan&seasons=1,2 or ?slug=attack-on-titan&seasons=all or ?slug=attack-on-titan&seasons=latest&src=true&server=0,1,2' 
      });
    }
    
    const seasonsQuery = req.query.seasons || req.query.season;
    const includeSrc = req.query.src === 'true';
    const serverQuery = req.query.server || req.query.servers;
    
    const result = await scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery);
    
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
