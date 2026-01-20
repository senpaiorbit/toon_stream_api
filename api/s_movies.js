// api/movies_page.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

function getBaseUrl() {
  try {
    const baseUrlPath = path.join(__dirname, '../src/baseurl.txt');
    return fs.readFileSync(baseUrlPath, 'utf-8').trim();
  } catch (error) {
    console.error('Error reading baseurl.txt:', error);
    return null;
  }
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  return imgSrc.startsWith('//') ? 'https:' + imgSrc : imgSrc;
}

// --- MOVIE SCRAPER ---
function scrapeMovies($) {
  const movies = [];

  $('.section.movies .post-lst li').each((_, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');

    movies.push({
      id: ($elem.attr('id') || '').replace(/^post-/, ''),
      title: $title.text().trim(),
      url: $link.attr('href') || '',
      poster: extractImageUrl($img.attr('src'))
    });
  });

  return movies;
}

// --- CLEAN PAGINATION ---
function scrapePagination($) {
  let currentPage = 1;
  let totalPages = 1;
  let hasNextPage = false;
  let hasPrevPage = false;

  $('.navigation.pagination .nav-links a').each((_, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    if ($el.hasClass('current')) {
      currentPage = parseInt(text) || 1;
    }

    if (text === 'NEXT') hasNextPage = true;
    if (text === 'PREV' || text === 'PREVIOUS') hasPrevPage = true;

    if (!isNaN(text) && text !== '...') {
      totalPages = Math.max(totalPages, parseInt(text));
    }
  });

  return {
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage
  };
}

// --- SMART SCRAPER WITH 404 FALLBACK ---
async function scrapeMoviesPage(baseUrl, pageNumber = 1) {
  let moviesUrl =
    pageNumber === 1
      ? `${baseUrl}/movies/`
      : `${baseUrl}/movies/page/${pageNumber}/`;

  console.log(`Trying: ${moviesUrl}`);

  let response;

  try {
    response = await axios.get(moviesUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
  } catch (err) {
    console.log(`404 on page ${pageNumber}, falling back to page 1`);

    // 👉 Fallback to page 1 if 404 happens
    moviesUrl = `${baseUrl}/movies/`;

    response = await axios.get(moviesUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
  }

  const $ = cheerio.load(response.data);

  const results = scrapeMovies($);
  const pagination = scrapePagination($);

  return {
    success: true,
    category: "anime-movies",
    categoryName: "Anime Movies",
    results,
    pagination
  };
}

// --- FINAL API HANDLER ---
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({
        success: false,
        error: 'Base URL missing in src/baseurl.txt'
      });
    }

    const pageNumber = Math.max(1, parseInt(req.query.page) || 1);

    const data = await scrapeMoviesPage(baseUrl, pageNumber);

    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: 'Server error',
      message: err.message
    });
  }
};    }
  });
  
  return {
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage
  };
};

const scrapeMoviesPage = async (baseUrl, pageNumber = 1) => {
  try {
    const moviesUrl = pageNumber === 1 
      ? `${baseUrl}/movies/` 
      : `${baseUrl}/movies/page/${pageNumber}/`;
    
    console.log(`Scraping: ${moviesUrl}`);
    
    const response = await axios.get(moviesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 30000,
      maxRedirects: 5
    });
    
    const $ = cheerio.load(response.data);
    const categoryName = $('.section-title').first().text().trim() || 'Movies';
    
    return {
      success: true,
      category: 'movies',
      categoryName: categoryName,
      results: scrapeMovies($),
      pagination: scrapePagination($)
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    return {
      success: false,
      error: error.message,
      category: 'movies',
      categoryName: 'Movies',
      results: [],
      pagination: {
        currentPage: pageNumber,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }
};

// API Handler
module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET request.'
    });
  }
  
  try {
    const baseUrl = getBaseUrl();
    
    if (!baseUrl) {
      return res.status(500).json({
        success: false,
        error: 'Base URL not found. Please check src/baseurl.txt file.'
      });
    }
    
    const pageNumber = parseInt(req.query.page) || 1;
    
    if (pageNumber < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page number. Must be 1 or greater.'
      });
    }
    
    const result = await scrapeMoviesPage(baseUrl, pageNumber);
    return res.status(result.success ? 200 : 500).json(result);
    
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
