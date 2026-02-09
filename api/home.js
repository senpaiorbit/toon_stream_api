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

function decodeHTML(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8230;/g, '...');
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

function scrapeFeaturedShows(html) {
  const featured = [];
  const wrapperPattern = /<div[^>]*class="[^"]*gs_logo_single--wrapper[^"]*"[^>]*>[\s\S]*?<\/div>/g;
  const wrappers = [...html.matchAll(wrapperPattern)];
  
  for (const wrapper of wrappers) {
    const content = wrapper[0];
    
    const hrefMatch = content.match(/<a[^>]+href="([^"]+)"/);
    const imgMatch = content.match(/<img[^>]*>/);
    
    if (imgMatch) {
      const img = imgMatch[0];
      const srcMatch = img.match(/src="([^"]+)"/);
      const titleMatch = img.match(/title="([^"]+)"/);
      const altMatch = img.match(/alt="([^"]+)"/);
      const srcsetMatch = img.match(/srcset="([^"]+)"/);
      
      featured.push({
        title: decodeHTML(titleMatch?.[1] || altMatch?.[1] || ''),
        image: normalizeImage(srcMatch?.[1]),
        searchUrl: hrefMatch?.[1] || '',
        srcset: srcsetMatch?.[1] || null
      });
    }
  }
  
  return featured;
}

function scrapeLatestEpisodes(html) {
  const episodes = [];
  
  const widgetMatch = html.match(/<div[^>]*id="widget_list_episodes-8"[^>]*class="[^"]*widget[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  
  if (!widgetMatch) return episodes;
  
  const widgetContent = widgetMatch[1];
  const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
  const items = [...widgetContent.matchAll(liPattern)];
  
  for (const item of items) {
    const content = item[1];
    
    const linkMatch = content.match(/<a[^>]+class="[^"]*lnk-blk[^"]*"[^>]+href="([^"]+)"/);
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?/);
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/);
    const numEpiMatch = content.match(/<span[^>]*class="[^"]*num-epi[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const timeMatch = content.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const numEpi = numEpiMatch ? numEpiMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    episodes.push({
      title: decodeHTML(title),
      episodeNumber: extractEpisodeNumber(numEpi),
      image: normalizeImage(imgMatch?.[1]),
      url: linkMatch?.[1] || '',
      timeAgo: timeMatch ? timeMatch[1].trim() : '',
      imageAlt: imgMatch?.[2] || ''
    });
  }
  
  return episodes;
}

function scrapeContent(html, sectionId) {
  const content = [];
  
  const sectionPattern = new RegExp(`<div[^>]*id="${sectionId}"[^>]*class="[^"]*widget[^"]*"[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/div>`, '');
  const sectionMatch = html.match(sectionPattern);
  
  if (!sectionMatch) return content;
  
  const sectionContent = sectionMatch[1];
  const liPattern = /<li[^>]*class="([^"]*)"[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/li>/g;
  const items = [...sectionContent.matchAll(liPattern)];
  
  for (const item of items) {
    const classList = item[1];
    const postId = item[2] || '';
    const itemContent = item[3];
    
    const linkMatch = itemContent.match(/<a[^>]+class="[^"]*lnk-blk[^"]*"[^>]+href="([^"]+)"/);
    const imgMatch = itemContent.match(/<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?/);
    const titleMatch = itemContent.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h2>/);
    const voteMatch = itemContent.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const rating = voteMatch ? voteMatch[1].replace('TMDB', '').replace(/<[^>]+>/g, '').trim() : null;
    
    const categories = [];
    const categoryMatches = [...classList.matchAll(/category-([\w-]+)/g)];
    categoryMatches.forEach(match => categories.push(match[1]));
    
    const tags = [];
    const tagMatches = [...classList.matchAll(/tag-([\w-]+)/g)];
    tagMatches.forEach(match => tags.push(match[1]));
    
    const cast = [];
    const castMatches = [...classList.matchAll(/cast[_-]([\w-]+)/g)];
    castMatches.forEach(match => cast.push(match[1].replace(/-/g, ' ')));
    
    const directors = [];
    const directorMatches = [...classList.matchAll(/directors-([\w-]+)/g)];
    directorMatches.forEach(match => directors.push(match[1].replace(/-/g, ' ')));
    
    const countries = [];
    const countryMatches = [...classList.matchAll(/country-([\w-]+)/g)];
    countryMatches.forEach(match => countries.push(match[1].replace(/-/g, ' ')));
    
    content.push({
      id: postId,
      title: decodeHTML(title),
      image: normalizeImage(imgMatch?.[1]),
      url: linkMatch?.[1] || '',
      rating: rating,
      imageAlt: imgMatch?.[2] || '',
      categories: categories,
      tags: tags,
      cast: cast.slice(0, 10),
      directors: directors,
      countries: countries
    });
  }
  
  return content;
}

function scrapeSchedule(html) {
  const schedule = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  for (const day of days) {
    const daySchedule = [];
    const dayPattern = new RegExp(`<div[^>]*id="${day}"[^>]*class="[^"]*custom-schedule[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, '');
    const dayMatch = html.match(dayPattern);
    
    if (dayMatch) {
      const dayContent = dayMatch[1];
      const itemPattern = /<div[^>]*class="[^"]*custom-schedule-item[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
      const items = [...dayContent.matchAll(itemPattern)];
      
      for (const item of items) {
        const content = item[1];
        const timeMatch = content.match(/<span[^>]*class="[^"]*schedule-time[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        const showMatch = content.match(/<span[^>]*class="[^"]*schedule-description[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        
        const time = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        const show = showMatch ? showMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        if (time || show) {
          daySchedule.push({
            time: time,
            show: decodeHTML(show)
          });
        }
      }
    }
    
    schedule[day] = daySchedule;
  }
  
  return schedule;
}

function scrapeAlphabetNav(html) {
  const alphabet = [];
  const navPattern = /<div[^>]*class="[^"]*az-lst[^"]*"[^>]*>([\s\S]*?)<\/div>/;
  const navMatch = html.match(navPattern);
  
  if (!navMatch) return alphabet;
  
  const navContent = navMatch[1];
  const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const links = [...navContent.matchAll(linkPattern)];
  
  for (const link of links) {
    const letter = link[2].replace(/<[^>]+>/g, '').trim();
    if (letter) {
      alphabet.push({
        letter: letter,
        url: link[1]
      });
    }
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
