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

// --- KEEP YOUR METADATA EXTRACTION (unchanged) ---
function extractMetadata(classList) {
  const metadata = {
    categories: [],
    tags: [],
    cast: [],
    directors: [],
    countries: [],
    letters: null,
    year: null
  };

  if (!classList) return metadata;

  const matchPush = (regex, arr, replaceFrom) => {
    const matches = classList.match(regex);
    if (matches) {
      matches.forEach(m =>
        arr.push(m.replace(replaceFrom, '').replace(/-/g, ' '))
      );
    }
  };

  matchPush(/category-[\w-]+/g, metadata.categories, 'category-');
  matchPush(/tag-[\w-]+/g, metadata.tags, 'tag-');
  matchPush(/cast-[\w-]+/g, metadata.cast, 'cast-');
  matchPush(/directors-[\w-]+/g, metadata.directors, 'directors-');
  matchPush(/country-[\w-]+/g, metadata.countries, 'country-');

  const letterMatch = classList.match(/letters-([\w-]+)/);
  if (letterMatch) metadata.letters = letterMatch[1];

  const yearMatch = classList.match(/annee-(\d+)/);
  if (yearMatch) metadata.year = yearMatch[1];

  return metadata;
}

// --- MAIN MOVIES SCRAPER (same site, same selectors) ---
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

// --- CLEAN PAGINATION (your style) ---
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

async function scrapeMoviesPage(baseUrl, pageNumber = 1) {
  const moviesUrl =
    pageNumber === 1
      ? `${baseUrl}/movies/`
      : `${baseUrl}/movies/page/${pageNumber}/`;

  console.log(`Scraping: ${moviesUrl}`);

  const response = await axios.get(moviesUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    timeout: 30000
  });

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
};
