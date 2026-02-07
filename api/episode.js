// api/episode.js
export const config = {
  runtime: 'edge',
};

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

// Simple HTML parser without Cheerio
class SimpleHTMLParser {
  constructor(html) {
    this.html = html;
  }

  find(selector) {
    const results = [];
    
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      const regex = new RegExp(`class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'gi');
      const matches = this.html.matchAll(regex);
      
      for (const match of matches) {
        const startIndex = match.index;
        const tagMatch = this.html.slice(0, startIndex).match(/<(\w+)[^>]*$/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          const element = this.extractElement(tagName, startIndex - tagMatch[0].length);
          if (element) results.push(element);
        }
      }
    }
    
    return results;
  }

  extractElement(tagName, startIndex) {
    const closeTag = `</${tagName}>`;
    let depth = 1;
    let i = startIndex;
    const openTag = new RegExp(`<${tagName}[^>]*>`, 'i');
    
    i = this.html.indexOf('>', i) + 1;
    
    while (depth > 0 && i < this.html.length) {
      const nextOpen = this.html.indexOf(`<${tagName}`, i);
      const nextClose = this.html.indexOf(closeTag, i);
      
      if (nextClose === -1) break;
      
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        i = nextOpen + 1;
      } else {
        depth--;
        if (depth === 0) {
          return this.html.slice(startIndex, nextClose + closeTag.length);
        }
        i = nextClose + closeTag.length;
      }
    }
    
    return null;
  }

  getText(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const match = html.match(regex);
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  getAttr(html, attr) {
    const regex = new RegExp(`${attr}=["']([^"']*)["']`, 'i');
    const match = html.match(regex);
    return match ? match[1] : null;
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
  
  if (serverParam.toLowerCase() === 'all') {
    return 'all';
  }
  
  return serverParam.split(',').map(s => s.trim().toLowerCase());
}

// Extract iframe from HTML
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
function scrapeEpisodeMetadata(html) {
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  const imgMatch = html.match(/<img[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*src=["']([^"']+)["']/i);
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)<\/div>/i);
  const durationMatch = html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>([^<]+)<\/span>/i);
  const yearMatch = html.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>([^<]+)<\/span>/i);
  const ratingMatch = html.match(/<span[^>]*class="[^"]*num[^"]*"[^>]*>([^<]+)<\/span>/i);
  
  return {
    title: titleMatch ? titleMatch[1].trim() : '',
    image: imgMatch ? extractImageUrl(imgMatch[1]) : null,
    description: descMatch ? descMatch[1].trim() : '',
    duration: durationMatch ? durationMatch[1].replace('min', '').trim() : '',
    year: yearMatch ? yearMatch[1].trim() : '',
    rating: ratingMatch ? ratingMatch[1].trim() : ''
  };
}

// Extract categories
function scrapeCategories(html) {
  const categories = [];
  const genresMatch = html.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  if (genresMatch) {
    const links = genresMatch[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    for (const link of links) {
      categories.push({
        name: link[2].trim(),
        url: link[1]
      });
    }
  }
  
  return categories;
}

// Extract cast
function scrapeCast(html) {
  const cast = [];
  const castMatch = html.match(/<div[^>]*class="[^"]*cast-lst[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  if (castMatch) {
    const links = castMatch[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    for (const link of links) {
      cast.push({
        name: link[2].trim(),
        url: link[1]
      });
    }
  }
  
  return cast;
}

// Extract navigation buttons
function scrapeNavigation(html) {
  const nav = {
    previousEpisode: null,
    nextEpisode: null,
    seriesPage: null
  };
  
  const navMatch = html.match(/<div[^>]*class="[^"]*epsdsnv[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  
  if (navMatch) {
    const links = navMatch[1].matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi);
    for (const link of links) {
      const text = link[2].toLowerCase();
      if (text.includes('previous')) {
        nav.previousEpisode = link[1];
      } else if (text.includes('next')) {
        nav.nextEpisode = link[1];
      } else if (text.includes('season')) {
        nav.seriesPage = link[1];
      }
    }
  }
  
  return nav;
}

// Extract seasons
function scrapeSeasons(html) {
  const seasons = [];
  const seasonMatches = html.matchAll(/<li[^>]*class="[^"]*sel-temp[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);
  
  for (const seasonMatch of seasonMatches) {
    const linkMatch = seasonMatch[1].match(/<a[^>]*data-post=["']([^"']*)["'][^>]*data-season=["']([^"']*)["'][^>]*>([^<]+)<\/a>/i);
    if (linkMatch) {
      seasons.push({
        name: linkMatch[3].trim(),
        seasonNumber: parseInt(linkMatch[2]) || 0,
        dataPost: linkMatch[1] || null,
        dataSeason: linkMatch[2] || null
      });
    }
  }
  
  return seasons;
}

// Extract episodes list
function scrapeEpisodesList(html) {
  const episodes = [];
  const episodeMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<article[^>]*class="[^"]*episodes[^"]*"[^>]*>([\s\S]*?)<\/article>[\s\S]*?<\/li>/gi);
  
  for (const epMatch of episodeMatches) {
    const content = epMatch[2];
    const numMatch = content.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>([^<]+)<\/span>/i);
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h2>/i);
    const imgMatch = content.match(/<img[^>]*src=["']([^"']+)["']/i);
    const timeMatch = content.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>([^<]+)<\/span>/i);
    const urlMatch = content.match(/<a[^>]*class="[^"]*lnk-blk[^"]*"[^>]*href=["']([^"']+)["']/i);
    
    if (numMatch && titleMatch && urlMatch) {
      episodes.push({
        episodeNumber: numMatch[1].trim(),
        title: titleMatch[1].trim(),
        image: imgMatch ? extractImageUrl(imgMatch[1]) : null,
        time: timeMatch ? timeMatch[1].trim() : '',
        url: urlMatch[1]
      });
    }
  }
  
  return episodes;
}

// Extract servers/iframes
async function scrapeServers(html) {
  const servers = [];
  let serverIndex = 0;
  
  // Extract iframes
  const iframeMatches = html.matchAll(/<div[^>]*class="[^"]*video[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
  
  for (const match of iframeMatches) {
    const content = match[1];
    const srcMatch = content.match(/<iframe[^>]*(?:src|data-src)=["']([^"']+)["']/i);
    const isActive = match[0].includes('class="video on"');
    
    if (srcMatch) {
      servers.push({
        serverNumber: serverIndex,
        originalSrc: srcMatch[1],
        src: srcMatch[1],
        isActive: isActive
      });
      serverIndex++;
    }
  }
  
  // Extract server names
  const btnMatches = html.matchAll(/<li[^>]*>([\s\S]*?)<div[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/li>/gi);
  
  let btnIndex = 0;
  for (const btnMatch of btnMatches) {
    const content = btnMatch[2];
    const numMatch = content.match(/<span[^>]*>(\d+)<\/span>/i);
    const nameMatch = content.match(/<span[^>]*class="[^"]*server[^"]*"[^>]*>([^<]+)<\/span>/i);
    const isActive = btnMatch[0].includes('class="btn on"');
    
    if (numMatch) {
      const serverNum = parseInt(numMatch[1]) - 1;
      if (servers[serverNum]) {
        servers[serverNum].name = nameMatch ? nameMatch[1].replace('-Multi Audio', '').replace('Multi Audio', '').trim() : '';
        servers[serverNum].displayNumber = serverNum + 1;
        servers[serverNum].isActive = isActive;
      }
    }
    btnIndex++;
  }
  
  // Process servers - extract real iframe URLs
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
  
  const requestedNumbers = parseServers(serverQuery, servers.length);
  if (requestedNumbers && requestedNumbers.length > 0) {
    return servers.filter(s => requestedNumbers.includes(s.serverNumber));
  }
  
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
    
    const metadata = scrapeEpisodeMetadata(html);
    const allServers = await scrapeServers(html);
    const filteredServers = filterServers(allServers, serverQuery);
    const seasons = scrapeSeasons(html);
    const episodesList = scrapeEpisodesList(html);
    
    const data = {
      baseUrl,
      episodeUrl,
      episodeSlug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...metadata,
      categories: scrapeCategories(html),
      cast: scrapeCast(html),
      navigation: scrapeNavigation(html),
      seasons: seasons,
      episodes: episodesList,
      servers: filteredServers
    };
    
    return {
      success: true,
      data,
      stats: {
        totalServersAvailable: allServers.length,
        serversReturned: filteredServers.length,
        castCount: data.cast.length,
        categoriesCount: data.categories.length,
        seasonsCount: seasons.length,
        episodesCount: episodesList.length
      }
    };
    
  } catch (error) {
    if (error.message.includes('404')) {
      return { success: false, error: 'Episode not found', statusCode: 404 };
    }
    return { success: false, error: error.message };
  }
}

// Vercel Edge handler
export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    'Content-Type': 'application/json'
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed. Use GET request.' }),
      { status: 405, headers: corsHeaders }
    );
  }
  
  try {
    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Base URL not found.' }),
        { status: 500, headers: corsHeaders }
      );
    }
    
    const url = new URL(req.url);
    const episodeSlug = url.searchParams.get('slug') || url.searchParams.get('episode');
    
    if (!episodeSlug) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Episode slug required. Examples: ?slug=attack-on-titan-2x1 or ?slug=attack-on-titan-2x1&server=0,1,2'
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    const serverQuery = url.searchParams.get('server') || url.searchParams.get('servers');
    
    const result = await scrapeEpisodePage(baseUrl, episodeSlug, serverQuery);
    
    if (!result.success && result.statusCode === 404) {
      return new Response(
        JSON.stringify(result),
        { status: 404, headers: corsHeaders }
      );
    }
    
    return new Response(
      JSON.stringify(result),
      { status: result.success ? 200 : 500, headers: corsHeaders }
    );
    
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error', 
        message: error.message 
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}
