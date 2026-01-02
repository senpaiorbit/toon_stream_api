// api/series_page.js
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
    letters: null,
    year: null
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

  const castMatches = classList.match(/cast_tv-[\w-]+/g);
  if (castMatches) {
    castMatches.forEach(member => {
      metadata.cast.push(member.replace('cast_tv-', '').replace(/-/g, ' '));
    });
  }

  const directorMatches = classList.match(/directors_tv-[\w-]+/g);
  if (directorMatches) {
    directorMatches.forEach(director => {
      metadata.directors.push(director.replace('directors_tv-', '').replace(/-/g, ' '));
    });
  }

  const countryMatches = classList.match(/country-[\w-]+/g);
  if (countryMatches) {
    countryMatches.forEach(country => {
      metadata.countries.push(country.replace('country-', '').replace(/-/g, ' '));
    });
  }

  const letterMatch = classList.match(/letters-([\w-]+)/);
  if (letterMatch) {
    metadata.letters = letterMatch[1];
  }

  const yearMatch = classList.match(/annee-(\d+)/);
  if (yearMatch) {
    metadata.year = yearMatch[1];
  }

  return metadata;
}

function scrapeSeries($) {
  const series = [];
  
  $('.section.movies .post-lst li').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    const postId = $elem.attr('id');
    const classList = $elem.attr('class');
    
    const metadata = extractMetadata(classList);
    
    series.push({
      id: postId || '',
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
      rating: $vote.text().replace('TMDB', '').trim() || null,
      ...metadata
    });
  });
  
  return series;
}

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

function scrapeRandomSeries($) {
  const randomSeries = [];
  
  $('.wdgt-sidebar .post-lst li').each((index, element) => {
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

async function scrapeSeriesPage(baseUrl, pageNumber = 1) {
  try {
    let seriesUrl;
    if (pageNumber === 1) {
      seriesUrl = `${baseUrl}/series/`;
    } else {
      seriesUrl = `${baseUrl}/series/page/${pageNumber}/`;
    }
    
    console.log(`Scraping: ${seriesUrl}`);
    
    const response = await axios.get(seriesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const pageTitle = $('.section-title').first().text().trim();
    
    const data = {
      baseUrl: baseUrl,
      pageUrl: seriesUrl,
      pageType: 'series',
      pageNumber: pageNumber,
      pageTitle: pageTitle,
      scrapedAt: new Date().toISOString(),
      series: scrapeSeries($),
      pagination: scrapePagination($),
      randomSeries: scrapeRandomSeries($)
    };
    
    return {
      success: true,
      data: data,
      stats: {
        seriesCount: data.series.length,
        randomSeriesCount: data.randomSeries.length,
        currentPage: data.pagination.currentPage,
        totalPages: data.pagination.totalPages
      }
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

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
    
    const pageNumber = parseInt(req.query.page) || 1;
    
    if (pageNumber < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page number. Must be 1 or greater.'
      });
    }
    
    const result = await scrapeSeriesPage(baseUrl, pageNumber);
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
