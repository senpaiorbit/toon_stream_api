// api/home.js
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

// Fetch with proxy fallback - CLOUDFLARE WORKER RETURNS HTML AS TEXT/PLAIN
async function fetchWithProxy(targetUrl) {
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
    'Referer': baseUrl
  };
  
  // Try proxy first - CONSUME AS TEXT (Cloudflare returns text/plain)
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

// Helper function to extract image URL
function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  if (imgSrc.startsWith('//')) {
    return 'https:' + imgSrc;
  }
  return imgSrc;
}

// Helper function to extract episode number
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

// Scrape featured carousel/slider
function scrapeFeaturedShows($) {
  const featured = [];
  
  $('.gs_logo_single--wrapper').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('a');
    const $img = $elem.find('img');
    
    featured.push({
      title: $img.attr('title') || $img.attr('alt') || '',
      image: extractImageUrl($img.attr('src')),
      searchUrl: $link.attr('href') || '',
      srcset: $img.attr('srcset') || null
    });
  });
  
  return featured;
}

// Scrape latest episodes
function scrapeLatestEpisodes($) {
  const episodes = [];
  
  $('#widget_list_episodes-8 .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $numEpi = $elem.find('.num-epi');
    const $time = $elem.find('.time');
    
    episodes.push({
      title: $title.text().trim(),
      episodeNumber: extractEpisodeNumber($numEpi.text().trim()),
      image: extractImageUrl($img.attr('src')),
      url: $link.attr('href') || '',
      timeAgo: $time.text().trim(),
      imageAlt: $img.attr('alt') || ''
    });
  });
  
  return episodes;
}

// Scrape series or movies
function scrapeContent($, sectionId) {
  const content = [];
  
  $(`#${sectionId} .post-lst li`).each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const $postId = $elem.attr('id');
    
    // Extract categories
    const categories = [];
    const classList = $elem.attr('class') || '';
    const categoryMatches = classList.match(/category-[\w-]+/g);
    if (categoryMatches) {
      categoryMatches.forEach(cat => {
        categories.push(cat.replace('category-', ''));
      });
    }
    
    // Extract tags
    const tags = [];
    const tagMatches = classList.match(/tag-[\w-]+/g);
    if (tagMatches) {
      tagMatches.forEach(tag => {
        tags.push(tag.replace('tag-', ''));
      });
    }
    
    // Extract cast
    const cast = [];
    const castMatches = classList.match(/cast[_-][\w-]+/g);
    if (castMatches) {
      castMatches.forEach(member => {
        cast.push(member.replace(/cast[_-]/, '').replace(/-/g, ' '));
      });
    }
    
    // Extract directors
    const directors = [];
    const directorMatches = classList.match(/directors-[\w-]+/g);
    if (directorMatches) {
      directorMatches.forEach(director => {
        directors.push(director.replace('directors-', '').replace(/-/g, ' '));
      });
    }
    
    // Extract country
    const countries = [];
    const countryMatches = classList.match(/country-[\w-]+/g);
    if (countryMatches) {
      countryMatches.forEach(country => {
        countries.push(country.replace('country-', '').replace(/-/g, ' '));
      });
    }
    
    content.push({
      id: $postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      url: $link.attr('href') || '',
      rating: $vote.text().replace('TMDB', '').trim() || null,
      imageAlt: $img.attr('alt') || '',
      categories: categories,
      tags: tags,
      cast: cast.slice(0, 10),
      directors: directors,
      countries: countries
    });
  });
  
  return content;
}

// Scrape weekly schedule
function scrapeSchedule($) {
  const schedule = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const daySchedule = [];
    
    $(`#${day} .custom-schedule-item`).each((index, element) => {
      const $elem = $(element);
      const $time = $elem.find('.schedule-time');
      const $description = $elem.find('.schedule-description');
      
      daySchedule.push({
        time: $time.text().trim(),
        show: $description.text().trim()
      });
    });
    
    schedule[day] = daySchedule;
  });
  
  return schedule;
}

// Scrape alphabetical navigation
function scrapeAlphabetNav($) {
  const alphabet = [];
  
  $('.az-lst a').each((index, element) => {
    const $elem = $(element);
    alphabet.push({
      letter: $elem.text().trim(),
      url: $elem.attr('href') || ''
    });
  });
  
  return alphabet;
}

// Main scraper function
async function scrapeHomePage(baseUrl) {
  try {
    const homeUrl = `${baseUrl}/home`;
    console.log(`Scraping: ${homeUrl}`);
    
    const html = await fetchWithProxy(homeUrl);
    const $ = cheerio.load(html);
    
    const data = {
      baseUrl: baseUrl,
      scrapedAt: new Date().toISOString(),
      featured: scrapeFeaturedShows($),
      latestEpisodes: scrapeLatestEpisodes($),
      latestSeries: scrapeContent($, 'widget_list_movies_series-2-all'),
      latestMovies: scrapeContent($, 'widget_list_movies_series-3-all'),
      schedule: scrapeSchedule($),
      alphabetNav: scrapeAlphabetNav($)
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
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use GET request.' 
    });
  }
  
  try {
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return res.status(500).json({ 
        success: false, 
        error: 'Base URL not found.' 
      });
    }
    
    const result = await scrapeHomePage(baseUrl);
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
