// api/category.js
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

// Scrape category tabs
function scrapeCategoryTabs($) {
  const tabs = [];
  
  $('.aa-tbs.cat-t a').each((index, element) => {
    const $elem = $(element);
    tabs.push({
      label: $elem.text().trim(),
      url: $elem.attr('href') || '',
      active: $elem.hasClass('on'),
      type: $elem.attr('data-post') || 'movies-series'
    });
  });
  
  return tabs;
}

// Scrape content items
function scrapeContent($) {
  const content = [];
  
  $('.section.movies .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const postId = $elem.attr('id');
    const classList = $elem.attr('class');
    
    const metadata = extractMetadata(classList);
    
    content.push({
      id: postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return content;
}

// Scrape pagination
function scrapePagination($) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    pages: [],
    nextUrl: null,
    prevUrl: null
  };
  
  $('.navigation.pagination .nav-links a').each((index, element) => {
    const $elem = $(element);
    const text = $elem.text().trim();
    const href = $elem.attr('href');
    
    if ($elem.hasClass('current')) {
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
        current: $elem.hasClass('current')
      });
      
      const pageNum = parseInt(text);
      if (pageNum > pagination.totalPages) {
        pagination.totalPages = pageNum;
      }
    }
  });
  
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
async function scrapeCategoryPage(baseUrl, categoryPath, pageNumber = 1, contentType = null) {
  try {
    // Remove leading/trailing slashes from categoryPath
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
    
    const response = await axios.get(categoryUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Get page title
    const pageTitle = $('.section-title').first().text().trim();
    
    const data = {
      baseUrl: baseUrl,
      pageUrl: categoryUrl,
      pageType: 'category',
      categoryPath: categoryPath,
      categoryTitle: pageTitle,
      pageNumber: pageNumber,
      contentTypeFilter: contentType || 'all',
      scrapedAt: new Date().toISOString(),
      categoryTabs: scrapeCategoryTabs($),
      content: scrapeContent($),
      pagination: scrapePagination($),
      randomSeries: scrapeRandomSeries($),
      randomMovies: scrapeRandomMovies($),
      schedule: scrapeSchedule($)
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
    
    if (error.response && error.response.status === 404) {
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
    
    // Get category path from query parameter
    const categoryPath = req.query.path;
    
    if (!categoryPath) {
      return res.status(400).json({
        success: false,
        error: 'Category path is required. Use ?path=crunchyroll or ?path=language/hindi-language'
      });
    }
    
    // Get page number from query parameter
    const pageNumber = parseInt(req.query.page) || 1;
    
    if (pageNumber < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page number. Must be 1 or greater.'
      });
    }
    
    // Get content type filter (optional)
    const contentType = req.query.type || null;
    if (contentType && !['movies', 'series', 'post'].includes(contentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type parameter. Must be: movies, series, or post'
      });
    }
    
    const result = await scrapeCategoryPage(baseUrl, categoryPath, pageNumber, contentType);
    
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
