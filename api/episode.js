// /api/episode.js

export const config = { runtime: "edge" };

let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

async function getBaseUrl() {
  const now = Date.now();
  
  if (baseUrlCache.url && (now - baseUrlCache.timestamp) < CACHE_DURATION) {
    return baseUrlCache.url;
  }
  
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt'
    );
    
    if (response.ok) {
      const baseUrl = (await response.text()).trim().replace(/\/+$/, '');
      baseUrlCache = { url: baseUrl, timestamp: now };
      return baseUrl;
    }
  } catch (error) {
    console.error('Error fetching base URL:', error.message);
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
    const response = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt'
    );
    
    if (response.ok) {
      const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url: proxyUrl, timestamp: now };
      return proxyUrl;
    }
  } catch (error) {
    console.error('Error fetching proxy URL:', error.message);
  }
  
  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

async function fetchWithProxy(targetUrl) {
  const proxyUrl = await getProxyUrl();
  
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await fetch(proxyFetchUrl, {
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        return await proxyResponse.text();
      }
    } catch (proxyError) {
      console.log('Proxy fetch failed:', proxyError.message);
    }
  }
  
  const directResponse = await fetch(targetUrl, {
    signal: AbortSignal.timeout(30000)
  });
  
  if (!directResponse.ok) {
    throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
  }
  
  return await directResponse.text();
}

function normalizeImage(url) {
  if (!url) return null;
  let normalized = url.startsWith('//') ? 'https:' + url : url;
  normalized = normalized.replace(/\/w\d+\//g, '/w500/');
  return normalized;
}

function scrapeEpisodeInfo(html) {
  const info = {
    title: '',
    image: null,
    description: '',
    duration: '',
    year: '',
    rating: '',
    categories: [],
    cast: []
  };
  
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/);
  if (titleMatch) {
    info.title = titleMatch[1].trim();
  }
  
  const imageMatch = html.match(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (imageMatch) {
    info.image = normalizeImage(imageMatch[1]);
  }
  
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/s);
  if (descMatch) {
    info.description = descMatch[1].trim();
  }
  
  const durationMatch = html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(\d+)\s*min<\/span>/);
  if (durationMatch) {
    info.duration = durationMatch[1];
  }
  
  const yearMatch = html.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/);
  if (yearMatch) {
    info.year = yearMatch[1];
  }
  
  const ratingMatch = html.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*num[^"]*"[^>]*>([\d.]+)<\/span>/);
  if (ratingMatch) {
    info.rating = ratingMatch[1];
  }
  
  const categoriesPattern = /<span[^>]*class="[^"]*genres[^"]*"[^>]*>(.*?)<\/span>/s;
  const categoriesMatch = html.match(categoriesPattern);
  if (categoriesMatch) {
    const catLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const catLinks = [...categoriesMatch[1].matchAll(catLinkPattern)];
    catLinks.forEach(link => {
      info.categories.push({
        name: link[2].trim(),
        url: link[1]
      });
    });
  }
  
  const castPattern = /<ul[^>]*class="[^"]*cast-lst[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/s;
  const castMatch = html.match(castPattern);
  if (castMatch) {
    const castLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const castLinks = [...castMatch[1].matchAll(castLinkPattern)];
    castLinks.forEach(link => {
      info.cast.push({
        name: link[2].trim(),
        url: link[1]
      });
    });
  }
  
  return info;
}

function scrapeNavigation(html) {
  const navigation = {
    previousEpisode: null,
    nextEpisode: null,
    seriesPage: null
  };
  
  const navPattern = /<div[^>]*class="[^"]*epsdsnv[^"]*"[^>]*>(.*?)<\/div>/s;
  const navMatch = html.match(navPattern);
  
  if (navMatch) {
    const content = navMatch[1];
    
    const prevPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Previous/;
    const prevMatch = content.match(prevPattern);
    if (prevMatch) {
      navigation.previousEpisode = prevMatch[1];
    }
    
    const nextPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Next/;
    const nextMatch = content.match(nextPattern);
    if (nextMatch) {
      navigation.nextEpisode = nextMatch[1];
    }
    
    const seriesPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Seasons/;
    const seriesMatch = content.match(seriesPattern);
    if (seriesMatch) {
      navigation.seriesPage = seriesMatch[1];
    }
  }
  
  return navigation;
}

function scrapeSeasons(html) {
  const seasons = [];
  const seasonPattern = /<li[^>]*class="[^"]*sel-temp[^"]*"[^>]*><a[^>]+data-post="([^"]+)"[^>]+data-season="([^"]+)"[^>]*>(.*?)<\/a>/g;
  const matches = [...html.matchAll(seasonPattern)];
  
  for (const match of matches) {
    seasons.push({
      name: match[3].trim(),
      seasonNumber: parseInt(match[2]),
      dataPost: match[1],
      dataSeason: match[2]
    });
  }
  
  return seasons;
}

function scrapeEpisodes(html) {
  const episodes = [];
  const episodePattern = /<ul[^>]*id="episode_by_temp"[^>]*>(.*?)<\/ul>/s;
  const episodeMatch = html.match(episodePattern);
  
  if (!episodeMatch) return episodes;
  
  const episodesSection = episodeMatch[1];
  const liPattern = /<li[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...episodesSection.matchAll(liPattern)];
  
  for (const item of items) {
    const content = item[1];
    
    const numEpiMatch = content.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/);
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"/);
    const timeMatch = content.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/);
    const urlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    
    episodes.push({
      episodeNumber: numEpiMatch ? numEpiMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      time: timeMatch ? timeMatch[1].trim() : '',
      url: urlMatch ? urlMatch[1] : ''
    });
  }
  
  return episodes;
}

function scrapeServers(html, apiUrl) {
  const servers = [];
  
  // First, extract all iframes to create a mapping
  const iframePattern = /<div[^>]*id="options-(\d+)"[^>]*>[\s\S]*?<iframe[^>]+(?:src|data-src)="([^"]+)"/g;
  const iframes = [...html.matchAll(iframePattern)];
  const iframeMap = {};
  iframes.forEach(iframe => {
    iframeMap[iframe[1]] = iframe[2];
  });
  
  // Extract server list section
  const serverPattern = /<ul[^>]*class="[^"]*aa-tbs aa-tbs-video[^"]*"[^>]*>(.*?)<\/ul>/s;
  const serverMatch = html.match(serverPattern);
  
  if (!serverMatch) return servers;
  
  const serversSection = serverMatch[1];
  
  // Fixed regex pattern to match the actual HTML structure
  // Pattern breakdown:
  // - Finds <a> tags with class containing "btn"
  // - Extracts href="#options-X"
  // - Captures server number from "Sever <span>X</span>"
  // - Captures server name from <span class="server">
  const liPattern = /<li[^>]*>\s*<a[^>]+class="[^"]*btn([^"]*)"[^>]+href="#(options-\d+)"[^>]*>[\s\S]*?Sever\s*<span>(\d+)<\/span>[\s\S]*?<span[^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  const items = [...serversSection.matchAll(liPattern)];
  
  for (const item of items) {
    const isActive = item[1].includes('on');
    const targetId = item[2]; // e.g., "options-0"
    const displayNumber = parseInt(item[3]); // The number shown to user (1, 2, 3...)
    const serverText = item[4].trim(); // Full server text with language suffix
    
    // Extract server number from targetId (options-0 -> 0)
    const serverNumberMatch = targetId.match(/options-(\d+)/);
    const serverNumber = serverNumberMatch ? parseInt(serverNumberMatch[1]) : 0;
    
    // Clean server name by removing language suffixes
    const serverName = serverText
      .replace(/-Multi Audio/g, '')
      .replace(/-Hindi-Eng-Jap/g, '')
      .replace(/-Hindi-Eng/g, '')
      .trim();
    
    // Get the iframe source from the mapping
    const originalSrc = iframeMap[serverNumber.toString()] || '';
    
    servers.push({
      serverNumber: serverNumber,
      displayNumber: displayNumber,
      name: serverName,
      targetId: targetId,
      isActive: isActive,
      originalSrc: originalSrc,
      src: `${apiUrl}/api/embed?url=${encodeURIComponent(originalSrc)}`
    });
  }
  
  return servers;
}

async function scrapeEpisodePage(baseUrl, slug, apiUrl) {
  const episodeUrl = `${baseUrl}/episode/${slug}/`;
  const html = await fetchWithProxy(episodeUrl);
  
  const episodeInfo = scrapeEpisodeInfo(html);
  const navigation = scrapeNavigation(html);
  const seasons = scrapeSeasons(html);
  const episodes = scrapeEpisodes(html);
  const servers = scrapeServers(html, apiUrl);
  
  return {
    success: true,
    data: {
      baseUrl: baseUrl,
      episodeUrl: episodeUrl,
      episodeSlug: slug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...episodeInfo,
      navigation: navigation,
      seasons: seasons,
      episodes: episodes,
      servers: servers
    },
    stats: {
      totalServersAvailable: servers.length,
      serversReturned: servers.length,
      castCount: episodeInfo.cast.length,
      categoriesCount: episodeInfo.categories.length,
      seasonsCount: seasons.length,
      episodesCount: episodes.length
    }
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed. Use GET request.' }),
      { 
        status: 405, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
  
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    
    if (!slug) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Episode slug parameter "slug" is required.' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Base URL not found.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const apiUrl = `${url.protocol}//${url.host}`;
    const result = await scrapeEpisodePage(baseUrl, slug, apiUrl);
    
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
    
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error', 
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}  
  if (proxyUrlCache.url && (now - proxyUrlCache.timestamp) < CACHE_DURATION) {
    return proxyUrlCache.url;
  }
  
  try {
    const response = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt'
    );
    
    if (response.ok) {
      const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url: proxyUrl, timestamp: now };
      return proxyUrl;
    }
  } catch (error) {
    console.error('Error fetching proxy URL:', error.message);
  }
  
  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

async function fetchWithProxy(targetUrl) {
  const proxyUrl = await getProxyUrl();
  
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await fetch(proxyFetchUrl, {
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        return await proxyResponse.text();
      }
    } catch (proxyError) {
      console.log('Proxy fetch failed:', proxyError.message);
    }
  }
  
  const directResponse = await fetch(targetUrl, {
    signal: AbortSignal.timeout(30000)
  });
  
  if (!directResponse.ok) {
    throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
  }
  
  return await directResponse.text();
}

function normalizeImage(url) {
  if (!url) return null;
  let normalized = url.startsWith('//') ? 'https:' + url : url;
  normalized = normalized.replace(/\/w\d+\//g, '/w500/');
  return normalized;
}

function extractLanguages(categories) {
  const languages = [];
  const languageKeywords = [
    'English',
    'Hindi',
    'Japaneses',
    'Japanese',
    'Spanish',
    'French',
    'German',
    'Italian',
    'Portuguese',
    'Chinese',
    'Korean',
    'Tamil',
    'Telugu',
    'Malayalam',
    'Bengali',
    'Marathi',
    'Gujarati',
    'Kannada',
    'Punjabi',
    'Urdu',
    'Arabic',
    'Russian',
    'Thai',
    'Vietnamese',
    'Indonesian',
    'Malay',
    'Turkish',
    'Polish',
    'Dutch',
    'Swedish',
    'Norwegian',
    'Danish',
    'Finnish',
    'Greek',
    'Hebrew',
    'Czech',
    'Hungarian',
    'Romanian',
    'Ukrainian',
    'Persian',
    'Farsi'
  ];
  
  categories.forEach(category => {
    const categoryName = category.name;
    const categoryUrl = category.url.toLowerCase();
    
    // Check if category URL contains '/language/' path
    if (categoryUrl.includes('/language/') || categoryUrl.includes('/lang/')) {
      // Extract language from category name
      languageKeywords.forEach(lang => {
        if (categoryName.toLowerCase().includes(lang.toLowerCase())) {
          if (!languages.includes(lang)) {
            languages.push(lang);
          }
        }
      });
    }
    
    // Also check direct language names in categories
    languageKeywords.forEach(lang => {
      if (categoryName.toLowerCase() === lang.toLowerCase()) {
        if (!languages.includes(lang)) {
          languages.push(lang);
        }
      }
    });
  });
  
  return languages;
}

function scrapeEpisodeInfo(html) {
  const info = {
    title: '',
    image: null,
    description: '',
    duration: '',
    year: '',
    rating: '',
    categories: [],
    cast: []
  };
  
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/);
  if (titleMatch) {
    info.title = titleMatch[1].trim();
  }
  
  const imageMatch = html.match(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (imageMatch) {
    info.image = normalizeImage(imageMatch[1]);
  }
  
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>(.*?)<\/div>/s);
  if (descMatch) {
    info.description = descMatch[1].trim();
  }
  
  const durationMatch = html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(\d+)\s*min<\/span>/);
  if (durationMatch) {
    info.duration = durationMatch[1];
  }
  
  const yearMatch = html.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/);
  if (yearMatch) {
    info.year = yearMatch[1];
  }
  
  const ratingMatch = html.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*num[^"]*"[^>]*>([\d.]+)<\/span>/);
  if (ratingMatch) {
    info.rating = ratingMatch[1];
  }
  
  const categoriesPattern = /<span[^>]*class="[^"]*genres[^"]*"[^>]*>(.*?)<\/span>/s;
  const categoriesMatch = html.match(categoriesPattern);
  if (categoriesMatch) {
    const catLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const catLinks = [...categoriesMatch[1].matchAll(catLinkPattern)];
    catLinks.forEach(link => {
      info.categories.push({
        name: link[2].trim(),
        url: link[1]
      });
    });
  }
  
  const castPattern = /<ul[^>]*class="[^"]*cast-lst[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/s;
  const castMatch = html.match(castPattern);
  if (castMatch) {
    const castLinkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const castLinks = [...castMatch[1].matchAll(castLinkPattern)];
    castLinks.forEach(link => {
      info.cast.push({
        name: link[2].trim(),
        url: link[1]
      });
    });
  }
  
  return info;
}

function scrapeNavigation(html) {
  const navigation = {
    previousEpisode: null,
    nextEpisode: null,
    seriesPage: null
  };
  
  const navPattern = /<div[^>]*class="[^"]*epsdsnv[^"]*"[^>]*>(.*?)<\/div>/s;
  const navMatch = html.match(navPattern);
  
  if (navMatch) {
    const content = navMatch[1];
    
    const prevPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Previous/;
    const prevMatch = content.match(prevPattern);
    if (prevMatch) {
      navigation.previousEpisode = prevMatch[1];
    }
    
    const nextPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>[\s\S]*?Next/;
    const nextMatch = content.match(nextPattern);
    if (nextMatch) {
      navigation.nextEpisode = nextMatch[1];
    }
    
    const seriesPattern = /<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?Seasons/;
    const seriesMatch = content.match(seriesPattern);
    if (seriesMatch) {
      navigation.seriesPage = seriesMatch[1];
    }
  }
  
  return navigation;
}

function scrapeSeasons(html) {
  const seasons = [];
  const seasonPattern = /<li[^>]*class="[^"]*sel-temp[^"]*"[^>]*><a[^>]+data-post="([^"]+)"[^>]+data-season="([^"]+)"[^>]*>(.*?)<\/a>/g;
  const matches = [...html.matchAll(seasonPattern)];
  
  for (const match of matches) {
    seasons.push({
      name: match[3].trim(),
      seasonNumber: parseInt(match[2]),
      dataPost: match[1],
      dataSeason: match[2]
    });
  }
  
  return seasons;
}

function scrapeEpisodes(html) {
  const episodes = [];
  const episodePattern = /<ul[^>]*id="episode_by_temp"[^>]*>(.*?)<\/ul>/s;
  const episodeMatch = html.match(episodePattern);
  
  if (!episodeMatch) return episodes;
  
  const episodesSection = episodeMatch[1];
  const liPattern = /<li[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...episodesSection.matchAll(liPattern)];
  
  for (const item of items) {
    const content = item[1];
    
    const numEpiMatch = content.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/);
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"/);
    const timeMatch = content.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/);
    const urlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    
    episodes.push({
      episodeNumber: numEpiMatch ? numEpiMatch[1].trim() : '',
      title: titleMatch ? titleMatch[1].trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      time: timeMatch ? timeMatch[1].trim() : '',
      url: urlMatch ? urlMatch[1] : ''
    });
  }
  
  return episodes;
}

function scrapeServers(html, apiUrl) {
  const servers = [];
  
  // First, extract all iframes to create a mapping
  const iframePattern = /<div[^>]*id="options-(\d+)"[^>]*>[\s\S]*?<iframe[^>]+(?:src|data-src)="([^"]+)"/g;
  const iframes = [...html.matchAll(iframePattern)];
  const iframeMap = {};
  iframes.forEach(iframe => {
    iframeMap[iframe[1]] = iframe[2];
  });
  
  // Extract server list section
  const serverPattern = /<ul[^>]*class="[^"]*aa-tbs aa-tbs-video[^"]*"[^>]*>(.*?)<\/ul>/s;
  const serverMatch = html.match(serverPattern);
  
  if (!serverMatch) return servers;
  
  const serversSection = serverMatch[1];
  
  // Fixed regex pattern to match the actual HTML structure
  // Pattern breakdown:
  // - Finds <a> tags with class containing "btn"
  // - Extracts href="#options-X"
  // - Captures server number from "Sever <span>X</span>"
  // - Captures server name from <span class="server">
  const liPattern = /<li[^>]*>\s*<a[^>]+class="[^"]*btn([^"]*)"[^>]+href="#(options-\d+)"[^>]*>[\s\S]*?Sever\s*<span>(\d+)<\/span>[\s\S]*?<span[^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  const items = [...serversSection.matchAll(liPattern)];
  
  for (const item of items) {
    const isActive = item[1].includes('on');
    const targetId = item[2]; // e.g., "options-0"
    const displayNumber = parseInt(item[3]); // The number shown to user (1, 2, 3...)
    const serverText = item[4].trim(); // Full server text with language suffix
    
    // Extract server number from targetId (options-0 -> 0)
    const serverNumberMatch = targetId.match(/options-(\d+)/);
    const serverNumber = serverNumberMatch ? parseInt(serverNumberMatch[1]) : 0;
    
    // Clean server name by removing language suffixes
    const serverName = serverText
      .replace(/-Multi Audio/g, '')
      .replace(/-Hindi-Eng-Jap/g, '')
      .replace(/-Hindi-Eng/g, '')
      .trim();
    
    // Get the iframe source from the mapping
    const originalSrc = iframeMap[serverNumber.toString()] || '';
    
    servers.push({
      serverNumber: serverNumber,
      displayNumber: displayNumber,
      name: serverName,
      targetId: targetId,
      isActive: isActive,
      originalSrc: originalSrc,
      src: `${apiUrl}/api/embed?url=${encodeURIComponent(originalSrc)}`
    });
  }
  
  return servers;
}

async function scrapeEpisodePage(baseUrl, slug, apiUrl) {
  const episodeUrl = `${baseUrl}/episode/${slug}/`;
  const html = await fetchWithProxy(episodeUrl);
  
  const episodeInfo = scrapeEpisodeInfo(html);
  const navigation = scrapeNavigation(html);
  const seasons = scrapeSeasons(html);
  const episodes = scrapeEpisodes(html);
  const servers = scrapeServers(html, apiUrl);
  
  // Extract languages from categories
  const languages = extractLanguages(episodeInfo.categories);
  
  return {
    success: true,
    data: {
      baseUrl: baseUrl,
      episodeUrl: episodeUrl,
      episodeSlug: slug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...episodeInfo,
      languages: languages,
      navigation: navigation,
      seasons: seasons,
      episodes: episodes,
      servers: servers
    },
    stats: {
      totalServersAvailable: servers.length,
      serversReturned: servers.length,
      castCount: episodeInfo.cast.length,
      categoriesCount: episodeInfo.categories.length,
      languagesCount: languages.length,
      seasonsCount: seasons.length,
      episodesCount: episodes.length
    }
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed. Use GET request.' }),
      { 
        status: 405, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
  
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get('slug');
    
    if (!slug) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Episode slug parameter "slug" is required.' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Base URL not found.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const apiUrl = `${url.protocol}//${url.host}`;
    const result = await scrapeEpisodePage(baseUrl, slug, apiUrl);
    
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
    
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error', 
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}
