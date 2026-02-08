export const config = {
  runtime: 'edge',
};

// Cache for base URL and proxy URL
let cachedBaseUrl = null;
let cachedProxyUrl = null;
let baseUrlCacheTime = 0;
let proxyUrlCacheTime = 0;
const CACHE_DURATION = 300000; // 5 minutes

async function getBaseUrl() {
  const now = Date.now();
  if (cachedBaseUrl && (now - baseUrlCacheTime) < CACHE_DURATION) {
    return cachedBaseUrl;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt', {
      headers: {
        'Accept': 'text/plain,*/*',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch base URL');
    }
    
    const baseUrl = (await response.text()).trim().replace(/\/+$/, '');
    cachedBaseUrl = baseUrl;
    baseUrlCacheTime = now;
    return baseUrl;
  } catch (error) {
    console.error('Error fetching baseurl.txt:', error);
    cachedBaseUrl = 'https://toonstream.dad';
    baseUrlCacheTime = now;
    return cachedBaseUrl;
  }
}

async function getProxyUrl() {
  const now = Date.now();
  if (cachedProxyUrl && (now - proxyUrlCacheTime) < CACHE_DURATION) {
    return cachedProxyUrl;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt', {
      headers: {
        'Accept': 'text/plain,*/*',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch proxy URL');
    }
    
    const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
    cachedProxyUrl = proxyUrl;
    proxyUrlCacheTime = now;
    return proxyUrl;
  } catch (error) {
    console.error('Error fetching cf_proxy.txt:', error);
    cachedProxyUrl = null;
    proxyUrlCacheTime = now;
    return null;
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

function scrapeCategoryTabs(doc) {
  const tabs = [];
  const elements = doc.querySelectorAll('.aa-tbs.cat-t a');
  
  elements.forEach((element) => {
    tabs.push({
      label: element.textContent.trim(),
      url: element.getAttribute('href') || '',
      active: element.classList.contains('on'),
      type: element.getAttribute('data-post') || 'movies-series'
    });
  });
  
  return tabs;
}

function scrapeContent(doc) {
  const content = [];
  const elements = doc.querySelectorAll('.section.movies .post-lst li');
  
  elements.forEach((element) => {
    const link = element.querySelector('.lnk-blk');
    const img = element.querySelector('img');
    const title = element.querySelector('.entry-title');
    const vote = element.querySelector('.vote');
    const postId = element.getAttribute('id');
    const classList = element.getAttribute('class');
    
    const metadata = extractMetadata(classList);
    
    content.push({
      id: postId || '',
      title: title ? title.textContent.trim() : '',
      image: extractImageUrl(img ? img.getAttribute('src') : null),
      imageAlt: img ? (img.getAttribute('alt') || '') : '',
      url: link ? (link.getAttribute('href') || '') : '',
      rating: vote ? vote.textContent.replace('TMDB', '').trim() : null,
      ...metadata
    });
  });
  
  return content;
}

function scrapePagination(doc) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    pages: [],
    nextUrl: null,
    prevUrl: null
  };
  
  const elements = doc.querySelectorAll('.navigation.pagination .nav-links a');
  
  elements.forEach((element) => {
    const text = element.textContent.trim();
    const href = element.getAttribute('href');
    
    if (element.classList.contains('current')) {
      pagination.currentPage = parseInt(text) || 1;
    }
    
    if (text === 'NEXT') {
      pagination.nextUrl = href;
    } else if (text === 'PREV' || text === 'PREVIOUS') {
      pagination.prevUrl = href;
    } else if (!isNaN(text) && text !== '...') {
      pagination.pages.push({
        page: parseInt(text),
        url: href,
        current: element.classList.contains('current')
      });
      
      const pageNum = parseInt(text);
      if (pageNum > pagination.totalPages) {
        pagination.totalPages = pageNum;
      }
    }
  });
  
  return pagination;
}

function scrapeRandomSeries(doc) {
  const randomSeries = [];
  const elements = doc.querySelectorAll('#widget_list_movies_series-4 .post-lst li');
  
  elements.forEach((element) => {
    const link = element.querySelector('.lnk-blk');
    const img = element.querySelector('img');
    const title = element.querySelector('.entry-title');
    const vote = element.querySelector('.vote');
    const postId = element.getAttribute('id');
    const classList = element.getAttribute('class');
    
    const metadata = extractMetadata(classList);
    
    randomSeries.push({
      id: postId || '',
      title: title ? title.textContent.trim() : '',
      image: extractImageUrl(img ? img.getAttribute('src') : null),
      imageAlt: img ? (img.getAttribute('alt') || '') : '',
      url: link ? (link.getAttribute('href') || '') : '',
      rating: vote ? vote.textContent.replace('TMDB', '').trim() : null,
      ...metadata
    });
  });
  
  return randomSeries;
}

function scrapeRandomMovies(doc) {
  const randomMovies = [];
  const elements = doc.querySelectorAll('#widget_list_movies_series-5 .post-lst li');
  
  elements.forEach((element) => {
    const link = element.querySelector('.lnk-blk');
    const img = element.querySelector('img');
    const title = element.querySelector('.entry-title');
    const vote = element.querySelector('.vote');
    const postId = element.getAttribute('id');
    const classList = element.getAttribute('class');
    
    const metadata = extractMetadata(classList);
    
    randomMovies.push({
      id: postId || '',
      title: title ? title.textContent.trim() : '',
      image: extractImageUrl(img ? img.getAttribute('src') : null),
      imageAlt: img ? (img.getAttribute('alt') || '') : '',
      url: link ? (link.getAttribute('href') || '') : '',
      rating: vote ? vote.textContent.replace('TMDB', '').trim() : null,
      ...metadata
    });
  });
  
  return randomMovies;
}

function scrapeSchedule(doc) {
  const schedule = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const daySchedule = [];
    const elements = doc.querySelectorAll(`#${day} .custom-schedule-item`);
    
    elements.forEach((element) => {
      const time = element.querySelector('.schedule-time');
      const description = element.querySelector('.schedule-description');
      
      daySchedule.push({
        time: time ? time.textContent.trim() : '',
        show: description ? description.textContent.trim() : ''
      });
    });
    
    schedule[day] = daySchedule;
  });
  
  return schedule;
}

async function fetchWithProxy(targetUrl, baseUrl) {
  const proxyUrl = await getProxyUrl();
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/plain,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': baseUrl,
  };
  
  if (proxyUrl) {
    try {
      const proxyResponse = await fetch(`${proxyUrl}?url=${encodeURIComponent(targetUrl)}`, {
        headers,
        cf: {
          cacheTtl: 300,
          cacheEverything: true,
        },
      });
      
      if (proxyResponse.ok) {
        return await proxyResponse.text();
      }
    } catch (error) {
      console.error('Proxy fetch failed:', error);
    }
  }
  
  const directResponse = await fetch(targetUrl, {
    headers,
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });
  
  if (!directResponse.ok) {
    throw new Error(`HTTP ${directResponse.status}`);
  }
  
  return await directResponse.text();
}

async function scrapeCategoryPage(baseUrl, categoryPath, pageNumber = 1, contentType = null) {
  try {
    categoryPath = categoryPath.replace(/^\/+|\/+$/g, '');
    
    let categoryUrl;
    if (pageNumber === 1 && !contentType) {
      categoryUrl = `${baseUrl}/category/${categoryPath}/`;
    } else if (pageNumber === 1 && contentType) {
      categoryUrl = `${baseUrl}/category/${categoryPath}/?type=${contentType}`;
    } else if (pageNumber > 1 && !contentType) {
      categoryUrl = `${baseUrl}/category/${categoryPath}/page/${pageNumber}/`;
    } else {
      categoryUrl = `${baseUrl}/category/${categoryPath}/page/${pageNumber}/?type=${contentType}`;
    }
    
    console.log(`Scraping: ${categoryUrl}`);
    
    const html = await fetchWithProxy(categoryUrl, baseUrl);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const pageTitle = doc.querySelector('.section-title');
    
    const data = {
      baseUrl: baseUrl,
      pageUrl: categoryUrl,
      pageType: 'category',
      categoryPath: categoryPath,
      categoryTitle: pageTitle ? pageTitle.textContent.trim() : '',
      pageNumber: pageNumber,
      contentTypeFilter: contentType || 'all',
      scrapedAt: new Date().toISOString(),
      categoryTabs: scrapeCategoryTabs(doc),
      content: scrapeContent(doc),
      pagination: scrapePagination(doc),
      randomSeries: scrapeRandomSeries(doc),
      randomMovies: scrapeRandomMovies(doc),
      schedule: scrapeSchedule(doc)
    };
    
    return {
      success: true,
      data: data,
      stats: {
        contentCount: data.content.length,
        seriesCount: data.content.filter(c => c.contentType === 'series').length,
        moviesCount: data.content.filter(c => c.contentType === 'movie').length,
        postsCount: data.content.filter(c => c.contentType === 'post').length,
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
        error: 'Category page not found',
        statusCode: 404
      };
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
      },
    });
  }
  
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Method not allowed. Use GET request.' 
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  try {
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Base URL not found. Please check src/baseurl.txt file.' 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const url = new URL(req.url);
    const categoryPath = url.searchParams.get('path');
    
    if (!categoryPath) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Category path is required. Use ?path=crunchyroll or ?path=language/hindi-language'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const pageNumber = parseInt(url.searchParams.get('page')) || 1;
    
    if (pageNumber < 1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid page number. Must be 1 or greater.'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const contentType = url.searchParams.get('type') || null;
    if (contentType && !['movies', 'series', 'post'].includes(contentType)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid type parameter. Must be: movies, series, or post'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
    
    const result = await scrapeCategoryPage(baseUrl, categoryPath, pageNumber, contentType);
    
    const status = !result.success && result.statusCode === 404 ? 404 : (result.success ? 200 : 500);
    
    return new Response(JSON.stringify(result), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
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
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
