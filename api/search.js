// api/search.js
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

function getBaseUrl() {
  try {
    const baseUrlPath = path.join(__dirname, '../src/baseurl.txt');
    const baseUrl = fs.readFileSync(baseUrlPath, 'utf-8').trim();
    return baseUrl;
  } catch (error) {
    console.error('Error reading baseurl.txt:', error);
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
    
    results.push({
      id: postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return results;
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
    
    randomSeries.push({
      id: postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
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
    
    randomMovies.push({
      id: postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
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

// Main scraper function
async function scrapeSearchPage(baseUrl, query) {
  try {
    // Construct search URL
    const searchUrl = `${baseUrl}/home/?s=${encodeURIComponent(query)}`;
    
    console.log(`Scraping: ${searchUrl}`);
    
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Get search query from page title
    const pageTitle = $('.section-title').first().text().trim();
    
    // Check if there are any results
    const hasResults = $('.section.movies .post-lst li').length > 0;
    
    const data = {
      baseUrl: baseUrl,
      searchUrl: searchUrl,
      pageType: 'search',
      searchQuery: query,
      searchTitle: pageTitle || query,
      hasResults: hasResults,
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
        randomMoviesCount: data.randomMovies.length
      }
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    if (error.response && error.response.status === 404) {
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

// Vercel serverless function handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
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
    const baseUrl = getBaseUrl();
    
    if (!baseUrl) {
      return res.status(500).json({ 
        success: false, 
        error: 'Base URL not found. Please check src/baseurl.txt file.' 
      });
    }
    
    // Get search query from query parameter
    const query = req.query.q || req.query.s || req.query.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required. Use ?q=naruto or ?s=naruto'
      });
    }
    
    // Validate query length
    if (query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters long'
      });
    }
    
    const result = await scrapeSearchPage(baseUrl, query);
    
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
