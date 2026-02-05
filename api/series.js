export const config = {
  runtime: "edge"
};

let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

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
  
  const fallbackUrl = 'https://toonstream.dad';
  baseUrlCache = { url: fallbackUrl, timestamp: now };
  return fallbackUrl;
}

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

async function fetchWithProxy(targetUrl, refererUrl = null) {
  const proxyUrl = await getProxyUrl();
  const baseUrl = await getBaseUrl();
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/plain,text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
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
  
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const proxyResponse = await fetch(proxyFetchUrl, {
        headers,
        redirect: 'follow',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
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
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const directResponse = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
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

function parseHTML(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  return imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
}

function parseSeasons(seasonsParam) {
  if (!seasonsParam) return [1];
  
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
    
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!seasons.includes(i)) seasons.push(i);
        }
      }
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && !seasons.includes(num)) {
        seasons.push(num);
      }
    }
  }
  
  return seasons.sort((a, b) => a - b);
}

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

async function scrapeSeriesMetadata(baseUrl, seriesSlug) {
  const seriesUrl = `${baseUrl}/series/${seriesSlug}/`;
  
  try {
    const html = await fetchWithProxy(seriesUrl, baseUrl);
    const doc = parseHTML(html);
    const article = doc.querySelector('article.post.single');
    
    const availableSeasons = [];
    const seasonLinks = doc.querySelectorAll('.choose-season .sel-temp a');
    seasonLinks.forEach(el => {
      const seasonNum = parseInt(el.getAttribute('data-season'));
      if (!isNaN(seasonNum)) {
        availableSeasons.push({
          seasonNumber: seasonNum,
          name: el.textContent.trim()
        });
      }
    });
    
    const descEl = article?.querySelector('.description');
    
    return {
      title: article?.querySelector('.entry-title')?.textContent.trim() || '',
      image: extractImageUrl(article?.querySelector('.post-thumbnail img')?.getAttribute('src')),
      duration: article?.querySelector('.duration')?.textContent.replace('min.', '').trim() || '',
      year: article?.querySelector('.year')?.textContent.trim() || '',
      views: article?.querySelector('.views span')?.textContent.trim() || '',
      totalSeasons: parseInt(article?.querySelector('.seasons span')?.textContent) || 0,
      totalEpisodes: parseInt(article?.querySelector('.episodes span')?.textContent) || 0,
      rating: article?.querySelector('.vote .num')?.textContent.trim() || '',
      description: descEl?.innerHTML?.trim() || '',
      availableSeasons: availableSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber)
    };
  } catch (error) {
    throw new Error(`Failed to fetch series metadata: ${error.message}`);
  }
}

async function scrapeEpisodeServers(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;
    const html = await fetchWithProxy(episodeUrl, baseUrl);
    const doc = parseHTML(html);
    const servers = [];
    let serverIndex = 0;
    
    const videoEls = doc.querySelectorAll('.video-player .video');
    videoEls.forEach(el => {
      const iframe = el.querySelector('iframe');
      const src = iframe?.getAttribute('src') || iframe?.getAttribute('data-src');
      
      if (src) {
        servers.push({
          serverNumber: serverIndex,
          src: src
        });
        serverIndex++;
      }
    });
    
    const serverBtns = doc.querySelectorAll('.aa-tbs-video li');
    serverBtns.forEach(el => {
      const btn = el.querySelector('.btn');
      const spanText = btn?.querySelector('span')?.textContent || '';
      const serverNum = parseInt(spanText) - 1;
      const serverName = btn?.querySelector('.server')?.textContent
        .replace('-Multi Audio', '')
        .replace('Multi Audio', '')
        .trim() || '';
      
      if (servers[serverNum]) {
        servers[serverNum].name = serverName;
        servers[serverNum].displayNumber = serverNum + 1;
      }
    });
    
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

async function scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNumber, includeSrc, serverQuery) {
  const episodeUrl = `${baseUrl}/episode/${seriesSlug}-${seasonNumber}x1/`;
  
  try {
    const html = await fetchWithProxy(episodeUrl, baseUrl);
    const doc = parseHTML(html);
    
    const seasonData = {
      seasonNumber: seasonNumber,
      episodes: [],
      categories: [],
      tags: [],
      cast: [],
      year: doc.querySelector('article.post.single .year')?.textContent.trim() || '',
      rating: doc.querySelector('article.post.single .vote .num')?.textContent.trim() || ''
    };
    
    const genreLinks = doc.querySelectorAll('article.post.single .genres a');
    genreLinks.forEach(el => {
      seasonData.categories.push({
        name: el.textContent.trim(),
        url: el.getAttribute('href')
      });
    });
    
    const tagLinks = doc.querySelectorAll('article.post.single .tag a');
    tagLinks.forEach(el => {
      seasonData.tags.push({
        name: el.textContent.trim(),
        url: el.getAttribute('href')
      });
    });
    
    const castLinks = doc.querySelectorAll('article.post.single .cast-lst a');
    castLinks.forEach(el => {
      seasonData.cast.push({
        name: el.textContent.trim(),
        url: el.getAttribute('href')
      });
    });
    
    const episodeItems = doc.querySelectorAll('#episode_by_temp li');
    episodeItems.forEach(el => {
      const article = el.querySelector('article');
      const episodeNum = article?.querySelector('.num-epi')?.textContent.trim() || '';
      const url = article?.querySelector('.lnk-blk')?.getAttribute('href') || '';
      
      const episode = {
        episodeNumber: episodeNum,
        title: article?.querySelector('.entry-title')?.textContent.trim() || '',
        image: extractImageUrl(article?.querySelector('img')?.getAttribute('src')),
        time: article?.querySelector('.time')?.textContent.trim() || '',
        url: url
      };
      
      seasonData.episodes.push(episode);
    });
    
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

async function scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery) {
  try {
    const metadata = await scrapeSeriesMetadata(baseUrl, seriesSlug);
    
    let requestedSeasons = parseSeasons(seasonsQuery);
    
    if (requestedSeasons === 'all') {
      requestedSeasons = metadata.availableSeasons.map(s => s.seasonNumber);
    } else if (requestedSeasons === 'latest') {
      const latestSeason = Math.max(...metadata.availableSeasons.map(s => s.seasonNumber));
      requestedSeasons = [latestSeason];
    }
    
    const validSeasons = requestedSeasons.filter(season => 
      metadata.availableSeasons.some(s => s.seasonNumber === season)
    );
    
    if (validSeasons.length === 0 && requestedSeasons.length > 0) {
      return {
        success: false,
        error: `None of the requested seasons (${requestedSeasons.join(', ')}) are available. Available seasons: ${metadata.availableSeasons.map(s => s.seasonNumber).join(', ')}`
      };
    }
    
    const seasonsData = [];
    
    for (const seasonNum of validSeasons) {
      console.log(`Fetching season ${seasonNum}...`);
      const seasonData = await scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNum, includeSrc, serverQuery);
      seasonsData.push(seasonData);
    }
    
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

export default async function handler(req) {
  const url = new URL(req.url);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
      }
    });
  }
  
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed. Use GET request.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  try {
    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Base URL not found.' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const seriesSlug = url.searchParams.get('slug') || url.searchParams.get('series');
    if (!seriesSlug) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Series slug required. Use ?slug=attack-on-titan&seasons=1,2 or ?slug=attack-on-titan&seasons=all or ?slug=attack-on-titan&seasons=latest&src=true&server=0,1,2' 
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const seasonsQuery = url.searchParams.get('seasons') || url.searchParams.get('season');
    const includeSrc = url.searchParams.get('src') === 'true';
    const serverQuery = url.searchParams.get('server') || url.searchParams.get('servers');
    
    const result = await scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery);
    
    const status = !result.success && result.statusCode === 404 ? 404 : (result.success ? 200 : 500);
    
    return new Response(JSON.stringify(result), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    });
    
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error', 
      message: error.message 
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
