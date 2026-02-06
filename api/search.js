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
      
      return res.status(result.success ? 200 : 500).json(result);
    }
    
    // Search page request
    const query = req.query.q || req.query.s || req.query.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required. Use ?q=naruto or ?s=naruto',
        usage: {
          search: '?q=naruto&page=1',
          detail: '?slug=naruto-shippuden&type=tv'
        }
      });
    }
    
    // Validate query length
    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }
    
    // Get page number
    const page = parseInt(req.query.page) || 1;
    
    if (page < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page number must be greater than 0'
      });
    }
    
    const result = await scrapeSearchPage(query, page);
    
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
