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
  const castMatches = [...(classList.matchAll(/cast(?:_tv)?-([\w-]+)/g))];
  castMatches.forEach(match => cast.push(match[1].replace(/-/g, ' ')));
  return cast.slice(0, 10);
}

function extractDirectors(classList) {
  const directors = [];
  const directorMatches = [...(classList.matchAll(/directors?(?:-tv)?-([\w-]+)/g))];
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
  const pattern = /<div[^>]*class="[^"]*gs_logo_single--wrapper[^"]*"[^>]*>(.*?)<\/div>\s*(?=<div[^>]*class="[^"]*gs_logo_single--wrapper|<\/div>)/gs;
  const matches = [...html.matchAll(pattern)];
  
  for (const match of matches) {
    const content = match[1];
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*(?:title|alt)="([^"]+)"/);
    const linkMatch = content.match(/<a[^>]+href="([^"]+)"/);
    const srcsetMatch = content.match(/srcset="([^"]+)"/);
    
    if (imgMatch || linkMatch) {
      featured.push({
        title: imgMatch ? imgMatch[2] : '',
        image: normalizeImage(imgMatch ? imgMatch[1] : null),
        searchUrl: linkMatch ? linkMatch[1] : '',
        srcset: srcsetMatch ? srcsetMatch[1] : null
      });
    }
  }
  
  return featured;
}

function scrapeLatestEpisodes(html) {
  const episodes = [];
  const sectionPattern = /<section[^>]*id="widget_list_episodes-8"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) return episodes;
  
  const section = sectionMatch[1];
  const liPattern = /<li[^>]*>\s*<article[^>]*class="[^"]*episodes[^"]*"[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...section.matchAll(liPattern)];
  
  for (const item of items) {
    const content = item[1];
    
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const urlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"/);
    const imageAltMatch = content.match(/<img[^>]+alt="([^"]+)"/);
    const numEpiMatch = content.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>(.*?)<\/span>/);
    const timeMatch = content.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/);
    
    episodes.push({
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
      episodeNumber: numEpiMatch ? extractEpisodeNumber(numEpiMatch[1].trim()) : { full: '' },
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      url: urlMatch ? urlMatch[1] : '',
      timeAgo: timeMatch ? timeMatch[1].trim() : '',
      imageAlt: imageAltMatch ? imageAltMatch[1] : ''
    });
  }
  
  return episodes;
}

function scrapeContent(html, sectionId) {
  const content = [];
  const sectionPattern = new RegExp(`<section[^>]*id="${sectionId}"[^>]*>[\\s\\S]*?<div[^>]*id="${sectionId}-all"[^>]*>[\\s\\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\\s\\S]*?)<\/ul>`, 's');
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) return content;
  
  const section = sectionMatch[1];
  const liPattern = /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...section.matchAll(liPattern)];
  
  for (const item of items) {
    const postId = item[1];
    const classList = item[2];
    const itemContent = item[3];
    
    const titleMatch = itemContent.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const urlMatch = itemContent.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    const imageMatch = itemContent.match(/<img[^>]+src="([^"]+)"/);
    const imageAltMatch = itemContent.match(/<img[^>]+alt="([^"]+)"/);
    const ratingMatch = itemContent.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/);
    
    content.push({
      id: `post-${postId}`,
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      url: urlMatch ? urlMatch[1] : '',
      rating: ratingMatch ? ratingMatch[1].trim() : null,
      imageAlt: imageAltMatch ? imageAltMatch[1] : '',
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
    const dayPattern = new RegExp(`<div[^>]*class="[^"]*custom-tab-pane[^"]*"[^>]*id="${day}"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div[^>]*class="[^"]*custom-tab-pane|<\\/div>\\s*<\\/div>)`, 's');
    const dayMatch = html.match(dayPattern);
    
    if (dayMatch) {
      const dayContent = dayMatch[1];
      const itemPattern = /<li[^>]*class="[^"]*custom-schedule-item[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*schedule-time[^"]*"[^>]*>(.*?)<\/span>[\s\S]*?<p[^>]*class="[^"]*schedule-description[^"]*"[^>]*>(.*?)<\/p>/g;
      const items = [...dayContent.matchAll(itemPattern)];
      
      for (const item of items) {
        daySchedule.push({
          time: item[1].trim(),
          show: item[2].trim()
        });
      }
    }
    
    schedule[day] = daySchedule;
  }
  
  return schedule;
}

function scrapeAlphabetNav(html) {
  const alphabet = [];
  const pattern = /<section[^>]*id="wdgt_letter-5"[^>]*>[\s\S]*?<ul[^>]*class="az-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const match = html.match(pattern);
  
  if (!match) return alphabet;
  
  const content = match[1];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
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
    latestSeries: scrapeContent(html, 'widget_list_movies_series-2'),
    latestMovies: scrapeContent(html, 'widget_list_movies_series-3'),
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
