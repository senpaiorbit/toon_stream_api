// /api/home.js

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

function extractText(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

function extractAttr(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : null;
}

function extractEpisodeNumber(text) {
  const match = text.match(/(\d+)x(\d+)/);
  if (match) {
    return {
      season: parseInt(match[1]),
      episode: parseInt(match[2]),
      full: text
    };
  }
  return { full: text };
}

function extractCategories(classList) {
  const categories = [];
  const categoryMatches = [...(classList.matchAll(/category-([\w-]+)/g))];
  categoryMatches.forEach(match => categories.push(match[1]));
  return categories;
}

function extractTags(classList) {
  const tags = [];
  const tagMatches = [...(classList.matchAll(/tag-([\w-]+)/g))];
  tagMatches.forEach(match => tags.push(match[1]));
  return tags;
}

function extractCast(classList) {
  const cast = [];
  const castMatches = [...(classList.matchAll(/cast[_-]([\w-]+)/g))];
  castMatches.forEach(match => cast.push(match[1].replace(/-/g, ' ')));
  return cast.slice(0, 10);
}

function extractDirectors(classList) {
  const directors = [];
  const directorMatches = [...(classList.matchAll(/directors-([\w-]+)/g))];
  directorMatches.forEach(match => directors.push(match[1].replace(/-/g, ' ')));
  return directors;
}

function extractCountries(classList) {
  const countries = [];
  const countryMatches = [...(classList.matchAll(/country-([\w-]+)/g))];
  countryMatches.forEach(match => countries.push(match[1].replace(/-/g, ' ')));
  return countries;
}

function scrapeFeaturedShows(html) {
  const featured = [];
  const pattern = /<div[^>]*class="[^"]*gs_logo_single--wrapper[^"]*"[^>]*>(.*?)<\/div>/gs;
  const matches = [...html.matchAll(pattern)];
  
  for (const match of matches) {
    const content = match[1];
    const title = extractAttr(content, /<img[^>]+(?:title|alt)="([^"]+)"/);
    const image = extractAttr(content, /<img[^>]+src="([^"]+)"/);
    const searchUrl = extractAttr(content, /<a[^>]+href="([^"]+)"/);
    const srcset = extractAttr(content, /<img[^>]+srcset="([^"]+)"/);
    
    featured.push({
      title: title || '',
      image: normalizeImage(image),
      searchUrl: searchUrl || '',
      srcset: srcset || null
    });
  }
  
  return featured;
}

function scrapeLatestEpisodes(html) {
  const episodes = [];
  const sectionPattern = /<div[^>]*id="widget_list_episodes-8"[^>]*>(.*?)<\/div>\s*<\/div>/s;
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) return episodes;
  
  const section = sectionMatch[1];
  const liPattern = /<li[^>]*>(.*?)<\/li>/gs;
  const items = [...section.matchAll(liPattern)];
  
  for (const item of items) {
    const content = item[1];
    
    const title = extractText(content, /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const url = extractAttr(content, /<a[^>]+href="([^"]+)"/);
    const image = extractAttr(content, /<img[^>]+src="([^"]+)"/);
    const imageAlt = extractAttr(content, /<img[^>]+alt="([^"]+)"/);
    const numEpi = extractText(content, /<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/);
    const timeAgo = extractText(content, /<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/);
    
    episodes.push({
      title: title,
      episodeNumber: extractEpisodeNumber(numEpi),
      image: normalizeImage(image),
      url: url || '',
      timeAgo: timeAgo,
      imageAlt: imageAlt || ''
    });
  }
  
  return episodes;
}

function scrapeContent(html, sectionId) {
  const content = [];
  const sectionPattern = new RegExp(`<div[^>]*id="${sectionId}"[^>]*>(.*?)<\\/div>\\s*<\\/div>`, 's');
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) return content;
  
  const section = sectionMatch[1];
  const liPattern = /<li[^>]*class="([^"]*)"[^>]*id="([^"]*)"[^>]*>(.*?)<\/li>/gs;
  const items = [...section.matchAll(liPattern)];
  
  for (const item of items) {
    const classList = item[1];
    const postId = item[2];
    const itemContent = item[3];
    
    const title = extractText(itemContent, /<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const url = extractAttr(itemContent, /<a[^>]+href="([^"]+)"/);
    const image = extractAttr(itemContent, /<img[^>]+src="([^"]+)"/);
    const imageAlt = extractAttr(itemContent, /<img[^>]+alt="([^"]+)"/);
    const rating = extractText(itemContent, /<span[^>]*class="[^"]*vote[^"]*"[^>]*>(.*?)<\/span>/).replace('TMDB', '').trim();
    
    content.push({
      id: postId || '',
      title: title,
      image: normalizeImage(image),
      url: url || '',
      rating: rating || null,
      imageAlt: imageAlt || '',
      categories: extractCategories(classList),
      tags: extractTags(classList),
      cast: extractCast(classList),
      directors: extractDirectors(classList),
      countries: extractCountries(classList)
    });
  }
  
  return content;
}

function scrapeSchedule(html) {
  const schedule = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (const day of days) {
    const daySchedule = [];
    const dayPattern = new RegExp(`<div[^>]*id="${day}"[^>]*>(.*?)<\\/div>`, 's');
    const dayMatch = html.match(dayPattern);
    
    if (dayMatch) {
      const dayContent = dayMatch[1];
      const itemPattern = /<div[^>]*class="[^"]*custom-schedule-item[^"]*"[^>]*>(.*?)<\/div>/gs;
      const items = [...dayContent.matchAll(itemPattern)];
      
      for (const item of items) {
        const content = item[1];
        const time = extractText(content, /<span[^>]*class="[^"]*schedule-time[^"]*"[^>]*>(.*?)<\/span>/);
        const show = extractText(content, /<span[^>]*class="[^"]*schedule-description[^"]*"[^>]*>(.*?)<\/span>/);
        
        daySchedule.push({
          time: time,
          show: show
        });
      }
    }
    
    schedule[day] = daySchedule;
  }
  
  return schedule;
}

function scrapeAlphabetNav(html) {
  const alphabet = [];
  const pattern = /<div[^>]*class="[^"]*az-lst[^"]*"[^>]*>(.*?)<\/div>/s;
  const match = html.match(pattern);
  
  if (!match) return alphabet;
  
  const content = match[1];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gs;
  const links = [...content.matchAll(linkPattern)];
  
  for (const link of links) {
    alphabet.push({
      letter: link[2].trim(),
      url: link[1]
    });
  }
  
  return alphabet;
}

async function scrapeHomePage(baseUrl) {
  const homeUrl = `${baseUrl}/home`;
  const html = await fetchWithProxy(homeUrl);
  
  const data = {
    baseUrl: baseUrl,
    scrapedAt: new Date().toISOString(),
    featured: scrapeFeaturedShows(html),
    latestEpisodes: scrapeLatestEpisodes(html),
    latestSeries: scrapeContent(html, 'widget_list_movies_series-2-all'),
    latestMovies: scrapeContent(html, 'widget_list_movies_series-3-all'),
    schedule: scrapeSchedule(html),
    alphabetNav: scrapeAlphabetNav(html)
  };
  
  return {
    success: true,
    data: data,
    stats: {
      featuredCount: data.featured.length,
      latestEpisodesCount: data.latestEpisodes.length,
      latestSeriesCount: data.latestSeries.length,
      latestMoviesCount: data.latestMovies.length,
      scheduleCount: Object.keys(data.schedule).length
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
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Base URL not found.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const result = await scrapeHomePage(baseUrl);
    
    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
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
