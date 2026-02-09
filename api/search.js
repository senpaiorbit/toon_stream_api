// api/search.js
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

// Fetch with proxy fallback - optimized for HTML text response
async function fetchWithProxy(targetPath) {
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
  
  // Try proxy first (proxy returns HTML as text)
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?path=${encodeURIComponent(targetPath)}`;
      console.log('Fetching via proxy:', proxyFetchUrl);
      
      const proxyResponse = await fetch(proxyFetchUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        const htmlText = await proxyResponse.text();
        console.log('✓ Proxy fetch successful, HTML length:', htmlText.length);
        return htmlText;
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
    const fullUrl = `${baseUrl}${targetPath}`;
    headers['Referer'] = baseUrl;
    
    console.log('Fetching directly:', fullUrl);
    
    const directResponse = await fetch(fullUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!directResponse.ok) {
      throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
    }
    
    const htmlText = await directResponse.text();
    console.log('✓ Direct fetch successful, HTML length:', htmlText.length);
    return htmlText;
  } catch (directError) {
    throw new Error(`Both proxy and direct fetch failed: ${directError.message}`);
  }
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  if (imgSrc.startsWith('//')) {
    return 'https:' + imgSrc;
  }
  return imgSrc;
}

function extractMetadata(classList) {
  const metadata = {
    categories: [],
    tags: [],
    cast: [],
    directors: [],
    countries: [],
    letters: [],
    year: null,
    contentType: null
  };

  if (!classList) return metadata;

  const categoryMatches = classList.match(/category-[\w-]+/g);
  if (categoryMatches) {
    categoryMatches.forEach(cat => {
      metadata.categories.push(cat.replace('category-', '').replace(/-/g, ' '));
    });
  }

  const tagMatches = classList.match(/tag-[\w-]+/g);
  if (tagMatches) {
    tagMatches.forEach(tag => {
      metadata.tags.push(tag.replace('tag-', '').replace(/-/g, ' '));
    });
  }

  const castMatches = classList.match(/cast[_-][\w-]+/g);
  if (castMatches) {
    castMatches.forEach(member => {
      metadata.cast.push(member.replace(/cast[_-]/, '').replace(/-/g, ' '));
    });
  }

  const directorMatches = classList.match(/directors[_-][\w-]+/g);
  if (directorMatches) {
    directorMatches.forEach(director => {
      metadata.directors.push(director.replace(/directors[_-]/, '').replace(/-/g, ' '));
    });
  }

  const countryMatches = classList.match(/country-[\w-]+/g);
  if (countryMatches) {
    countryMatches.forEach(country => {
      metadata.countries.push(country.replace('country-', '').replace(/-/g, ' '));
    });
  }

  const letterMatches = classList.match(/letters-([\w-]+)/g);
  if (letterMatches) {
    letterMatches.forEach(letter => {
      metadata.letters.push(letter.replace('letters-', ''));
    });
  }

  const yearMatch = classList.match(/annee-(\d+)/);
  if (yearMatch) {
    metadata.year = yearMatch[1];
  }

  if (classList.includes('type-series')) {
    metadata.contentType = 'series';
  } else if (classList.includes('type-movies')) {
    metadata.contentType = 'movie';
  } else if (classList.includes('type-post')) {
    metadata.contentType = 'post';
  }

  return metadata;
}

// Scrape search results
function scrapeSearchResults($) {
  const results = [];
  
  $('.section.movies .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const postId = $elem.attr('id');
    const classList = $elem.attr('class');
    
    const metadata = extractMetadata(classList);
    const url = $link.attr('href') || '';
    
    // Extract slug from URL
    let slug = '';
    if (url) {
      const urlParts = url.split('/').filter(Boolean);
      slug = urlParts[urlParts.length - 1] || '';
    }
    
    results.push({
      id: postId || '',
      slug: slug,
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: url,
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return results;
}

// Scrape pagination info
function scrapePagination($) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
    nextPage: null,
    prevPage: null,
    pages: []
  };
  
  const $currentPage = $('.navigation.pagination .current');
  if ($currentPage.length) {
    pagination.currentPage = parseInt($currentPage.text()) || 1;
  }
  
  $('.navigation.pagination .page-link').each((index, element) => {
    const $elem = $(element);
    const pageNum = parseInt($elem.text());
    if (!isNaN(pageNum)) {
      pagination.pages.push({
        number: pageNum,
        url: $elem.attr('href'),
        isCurrent: $elem.hasClass('current')
      });
      if (pageNum > pagination.totalPages) {
        pagination.totalPages = pageNum;
      }
    }
  });
  
  const $nextLink = $('.navigation.pagination a:contains("NEXT")');
  if ($nextLink.length && $nextLink.attr('href') !== 'javascript:void(0)') {
    pagination.hasNext = true;
    pagination.nextPage = pagination.currentPage + 1;
  }
  
  const $prevLink = $('.navigation.pagination a:contains("PREV")');
  if ($prevLink.length && $prevLink.attr('href') !== 'javascript:void(0)') {
    pagination.hasPrev = true;
    pagination.prevPage = pagination.currentPage - 1;
  }
  
  return pagination;
}

// Scrape random series sidebar
function scrapeRandomSeries($) {
  const randomSeries = [];
  
  $('#widget_list_movies_series-4 .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const postId = $elem.attr('id');
    const classList = $elem.attr('class');
    
    const metadata = extractMetadata(classList);
    const url = $link.attr('href') || '';
    
    let slug = '';
    if (url) {
      const urlParts = url.split('/').filter(Boolean);
      slug = urlParts[urlParts.length - 1] || '';
    }
    
    randomSeries.push({
      id: postId || '',
      slug: slug,
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: url,
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return randomSeries;
}

// Scrape random movies sidebar
function scrapeRandomMovies($) {
  const randomMovies = [];
  
  $('#widget_list_movies_series-5 .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const postId = $elem.attr('id');
    const classList = $elem.attr('class');
    
    const metadata = extractMetadata(classList);
    const url = $link.attr('href') || '';
    
    let slug = '';
    if (url) {
      const urlParts = url.split('/').filter(Boolean);
      slug = urlParts[urlParts.length - 1] || '';
    }
    
    randomMovies.push({
      id: postId || '',
      slug: slug,
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: url,
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return randomMovies;
}

// Scrape schedule
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

// Scrape anime detail page
function scrapeAnimeDetail($, baseUrl) {
  const detail = {
    title: '',
    alternativeTitles: [],
    description: '',
    image: null,
    coverImage: null,
    rating: null,
    genres: [],
    tags: [],
    cast: [],
    directors: [],
    year: null,
    status: null,
    type: null,
    episodes: [],
    seasons: [],
    relatedContent: [],
    downloadLinks: []
  };

  // Extract title
  detail.title = $('.entry-title').first().text().trim();

  // Extract description
  detail.description = $('.entry-content p').first().text().trim();

  // Extract main image
  const $mainImg = $('.post-thumbnail img').first();
  detail.image = extractImageUrl($mainImg.attr('src'));

  // Extract cover/background image
  const $coverImg = $('.bghd img, .bgft img').first();
  if ($coverImg.length) {
    detail.coverImage = extractImageUrl($coverImg.attr('src'));
  }

  // Extract rating
  const ratingText = $('.vote').first().text();
  if (ratingText) {
    detail.rating = ratingText.replace('TMDB', '').trim();
  }

  // Extract metadata from body class
  const bodyClass = $('body').attr('class') || '';
  const metadata = extractMetadata(bodyClass);
  detail.genres = metadata.categories;
  detail.tags = metadata.tags;
  detail.cast = metadata.cast;
  detail.directors = metadata.directors;
  detail.year = metadata.year;
  detail.type = metadata.contentType;

  // Extract episodes/seasons (for series)
  $('.aa-season, .season-list').each((index, element) => {
    const $season = $(element);
    const seasonTitle = $season.find('.season-title').text().trim();
    const episodes = [];

    $season.find('.episode-item, .aa-ep').each((epIndex, epElement) => {
      const $ep = $(epElement);
      const epTitle = $ep.find('.episode-title, .ep-title').text().trim();
      const epNumber = $ep.find('.episode-number, .ep-num').text().trim();
      const epUrl = $ep.find('a').attr('href');

      episodes.push({
        number: epNumber,
        title: epTitle,
        url: epUrl || ''
      });
    });

    if (episodes.length > 0) {
      detail.seasons.push({
        title: seasonTitle || `Season ${index + 1}`,
        episodes: episodes
      });
    }
  });

  // Extract single episodes list (if no seasons)
  if (detail.seasons.length === 0) {
    $('.episode-list .episode-item, .aa-eps .aa-ep').each((index, element) => {
      const $ep = $(element);
      const epTitle = $ep.find('.episode-title, .ep-title').text().trim();
      const epNumber = $ep.text().match(/\d+/)?.[0] || (index + 1).toString();
      const epUrl = $ep.find('a').attr('href') || $ep.attr('href');

      detail.episodes.push({
        number: epNumber,
        title: epTitle,
        url: epUrl || ''
      });
    });
  }

  // Extract download links
  $('.download-links a, .dl-link').each((index, element) => {
    const $link = $(element);
    detail.downloadLinks.push({
      quality: $link.text().trim(),
      url: $link.attr('href') || ''
    });
  });

  // Extract related content
  $('.related-posts .post-lst li, .aa-rel .post').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk, a').first();
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title, .title');
    const url = $link.attr('href') || '';
    
    let slug = '';
    if (url) {
      const urlParts = url.split('/').filter(Boolean);
      slug = urlParts[urlParts.length - 1] || '';
    }

    detail.relatedContent.push({
      slug: slug,
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      url: url
    });
  });

  return detail;
}

// Main scraper function for search with pagination
async function scrapeSearchPage(query, page = 1) {
  try {
    // Construct search path
    let searchPath;
    if (page === 1) {
      searchPath = `/home/?s=${encodeURIComponent(query)}`;
    } else {
      searchPath = `/home/page/${page}/?s=${encodeURIComponent(query)}`;
    }
    
    console.log(`Scraping search: ${searchPath}`);
    
    const html = await fetchWithProxy(searchPath);
    const $ = cheerio.load(html);
    
    // Get search query from page title
    const pageTitle = $('.section-title').first().text().trim();
    
    // Check if there are any results
    const hasResults = $('.section.movies .post-lst li').length > 0;
    
    const data = {
      pageType: 'search',
      searchQuery: query,
      searchTitle: pageTitle || query,
      hasResults: hasResults,
      pagination: scrapePagination($),
      scrapedAt: new Date().toISOString(),
      results: scrapeSearchResults($),
      randomSeries: scrapeRandomSeries($),
      randomMovies: scrapeRandomMovies($),
      schedule: scrapeSchedule($)
    };
    
    return {
      success: true,
      data: data,
      stats: {
        resultsCount: data.results.length,
        seriesCount: data.results.filter(r => r.contentType === 'series').length,
        moviesCount: data.results.filter(r => r.contentType === 'movie').length,
        postsCount: data.results.filter(r => r.contentType === 'post').length,
        randomSeriesCount: data.randomSeries.length,
        randomMoviesCount: data.randomMovies.length,
        currentPage: data.pagination.currentPage,
        totalPages: data.pagination.totalPages
      }
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    if (error.message.includes('404')) {
      return {
        success: false,
        error: 'Search page not found',
        statusCode: 404
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Scrape anime detail page
async function scrapeAnimePage(slug, type) {
  try {
    const baseUrl = await getBaseUrl();
    
    // Construct anime path based on type
    let animePath;
    if (type === 'movie' || type === 'movies') {
      animePath = `/movies/${slug}/`;
    } else {
      animePath = `/series/${slug}/`;
    }
    
    console.log(`Scraping anime detail: ${animePath}`);
    
    const html = await fetchWithProxy(animePath);
    const $ = cheerio.load(html);
    
    const data = {
      pageType: 'detail',
      slug: slug,
      type: type,
      scrapedAt: new Date().toISOString(),
      detail: scrapeAnimeDetail($, baseUrl),
      randomSeries: scrapeRandomSeries($),
      randomMovies: scrapeRandomMovies($)
    };
    
    return {
      success: true,
      data: data
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    if (error.message.includes('404')) {
      return {
        success: false,
        error: 'Anime page not found',
        statusCode: 404
      };
    }
    
    return {
      success: false,
      error: error.message
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
    // Check if this is a detail page request
    const slug = req.query.slug;
    const type = req.query.type;
    
    if (slug) {
      // Detail page request
      if (!type || !['tv', 'movie', 'series', 'movies'].includes(type.toLowerCase())) {
        return res.status(400).json({
          success: false,
          error: 'Type parameter is required and must be either "tv" or "movie"'
        });
      }
      
      const result = await scrapeAnimePage(slug, type.toLowerCase());
      
      if (!result.success && result.statusCode === 404) {
        return res.status(404).json(result);
      }
// /api/search.js

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

function scrapeSearchResults(html) {
  const results = [];
  const resultsPattern = /<div[^>]*id="movies-a"[^>]*class="[^"]*aa-tb[^"]*"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const resultsMatch = html.match(resultsPattern);
  
  if (!resultsMatch) return results;
  
  const section = resultsMatch[1];
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
    
    const contentType = classList.includes('type-series') ? 'series' : 
                       classList.includes('type-movies') ? 'movie' : 'unknown';
    
    results.push({
      id: `post-${postId}`,
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      url: urlMatch ? urlMatch[1] : '',
      rating: ratingMatch ? ratingMatch[1].trim() : null,
      contentType: contentType,
      imageAlt: imageAltMatch ? imageAltMatch[1] : '',
      categories: extractCategories(classList),
      tags: extractTags(classList),
      cast: extractCast(classList),
      directors: extractDirectors(classList),
      countries: extractCountries(classList)
    });
  }
  
  return results;
}

function extractPagination(html) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
    nextPageUrl: null,
    prevPageUrl: null
  };
  
  const paginationPattern = /<nav[^>]*class="[^"]*navigation pagination[^"]*"[^>]*>([\s\S]*?)<\/nav>/;
  const paginationMatch = html.match(paginationPattern);
  
  if (!paginationMatch) return pagination;
  
  const paginationContent = paginationMatch[1];
  
  const currentMatch = paginationContent.match(/<a[^>]*class="[^"]*page-link current[^"]*"[^>]*>(\d+)<\/a>/);
  if (currentMatch) {
    pagination.currentPage = parseInt(currentMatch[1]);
  }
  
  const allPagesPattern = /<a[^>]*class="[^"]*page-link[^"]*"[^>]*>(\d+)<\/a>/g;
  const allPages = [...paginationContent.matchAll(allPagesPattern)];
  if (allPages.length > 0) {
    const pageNumbers = allPages.map(m => parseInt(m[1]));
    pagination.totalPages = Math.max(...pageNumbers);
  }
  
  const nextMatch = paginationContent.match(/<a[^>]+href="([^"]+)"[^>]*>NEXT<\/a>/);
  if (nextMatch) {
    pagination.hasNextPage = true;
    pagination.nextPageUrl = nextMatch[1];
  }
  
  pagination.hasPrevPage = pagination.currentPage > 1;
  
  return pagination;
}

async function searchContent(baseUrl, query, page = 1) {
  const searchUrl = page > 1 
    ? `${baseUrl}/home/page/${page}/?s=${encodeURIComponent(query)}`
    : `${baseUrl}/home/?s=${encodeURIComponent(query)}`;
  
  const html = await fetchWithProxy(searchUrl);
  const results = scrapeSearchResults(html);
  const pagination = extractPagination(html);
  
  const seriesCount = results.filter(r => r.contentType === 'series').length;
  const moviesCount = results.filter(r => r.contentType === 'movie').length;
  
  return {
    success: true,
    data: {
      searchQuery: query,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      hasResults: results.length > 0,
      results: results,
      pagination: {
        hasNextPage: pagination.hasNextPage,
        hasPrevPage: pagination.hasPrevPage,
        nextPageUrl: pagination.nextPageUrl,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages
      }
    },
    stats: {
      resultsCount: results.length,
      seriesCount: seriesCount,
      moviesCount: moviesCount
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
    const query = url.searchParams.get('q');
    const page = parseInt(url.searchParams.get('page') || '1');
    
    if (!query) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Search query parameter "q" is required.' 
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
    
    const result = await searchContent(baseUrl, query, page);
    
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
