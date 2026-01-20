// api/movies_page.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// Utility Functions
const getBaseUrl = () => {
  try {
    const baseUrlPath = path.join(__dirname, '../src/baseurl.txt');
    return fs.readFileSync(baseUrlPath, 'utf-8').trim();
  } catch (error) {
    console.error('Error reading baseurl.txt:', error);
    return null;
  }
};

const normalizeImageUrl = (imgSrc) => {
  if (!imgSrc) return null;
  return imgSrc.startsWith('//') ? `https:${imgSrc}` : imgSrc;
};

const extractSlugFromUrl = (url) => {
  if (!url) return '';
  const match = url.match(/\/([^\/]+)\/?$/);
  return match ? match[1] : '';
};

// Main Scraping Functions
const scrapeMovies = ($) => {
  const movies = [];
  
  $('.section.movies .post-lst li').each((index, element) => {
    const $elem = $(element);
    const url = $elem.find('.lnk-blk').attr('href') || '';
    
    movies.push({
      id: extractSlugFromUrl(url),
      title: $elem.find('.entry-title').text().trim(),
      url: url,
      poster: normalizeImageUrl($elem.find('img').attr('src'))
    });
  });
  
  return movies;
};

const scrapePagination = ($) => {
  let currentPage = 1;
  let totalPages = 1;
  let hasNextPage = false;
  let hasPrevPage = false;
  
  $('.navigation.pagination .nav-links a, .navigation.pagination .nav-links span').each((index, element) => {
    const $elem = $(element);
    const text = $elem.text().trim();
    
    if ($elem.hasClass('current')) {
      currentPage = parseInt(text) || 1;
    }
    
    if (text === 'NEXT' && $elem.attr('href')) {
      hasNextPage = true;
    }
    
    if ((text === 'PREV' || text === 'PREVIOUS') && $elem.attr('href')) {
      hasPrevPage = true;
    }
    
    if (!isNaN(text) && text !== '...') {
      const pageNum = parseInt(text);
      if (pageNum > totalPages) {
        totalPages = pageNum;
      }
    }
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
