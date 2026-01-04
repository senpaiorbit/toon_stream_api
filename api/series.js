// api/series.js
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

// Scrape series metadata
function scrapeSeriesMetadata($) {
  const $article = $('article.post.single');
  
  return {
    title: $article.find('.entry-title').text().trim(),
    image: extractImageUrl($article.find('.post-thumbnail img').attr('src')),
    categories: [],
    tags: [],
    cast: [],
    duration: $article.find('.duration').text().replace('min.', '').trim(),
    year: $article.find('.year').text().trim(),
    views: $article.find('.views span').first().text().trim(),
    seasons: parseInt($article.find('.seasons span').text()) || 0,
    episodes: parseInt($article.find('.episodes span').text()) || 0,
    rating: $article.find('.vote .num').text().trim(),
    description: $article.find('.description').html()?.trim() || '',
  };
}

// Extract categories
function scrapeCategories($) {
  const categories = [];
  $('.genres a').each((i, el) => {
    categories.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return categories;
}

// Extract tags
function scrapeTags($) {
  const tags = [];
  $('.tag a').each((i, el) => {
    tags.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return tags;
}

// Extract cast
function scrapeCast($) {
  const cast = [];
  $('.loadactor a').each((i, el) => {
    cast.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return cast;
}

// Extract available seasons
function scrapeSeasons($) {
  const seasons = [];
  $('.choose-season .sel-temp a').each((i, el) => {
    const $el = $(el);
    seasons.push({
      seasonNumber: parseInt($el.attr('data-season')) || 0,
      name: $el.text().trim()
    });
  });
  return seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
}

// Extract episodes
function scrapeEpisodes($) {
  const episodes = [];
  $('#episode_by_temp li').each((i, el) => {
    const $el = $(el);
    const $article = $el.find('article');
    const episodeNum = $article.find('.num-epi').text().trim();
    
    episodes.push({
      episodeNumber: episodeNum,
      title: $article.find('.entry-title').text().trim(),
      image: extractImageUrl($article.find('img').attr('src')),
      time: $article.find('.time').text().trim(),
      url: $article.find('.lnk-blk').attr('href')
    });
  });
  return episodes;
}

// Main scraper
async function scrapeSeriesPage(baseUrl, seriesSlug) {
  try {
    const seriesUrl = `${baseUrl}/series/${seriesSlug}/`;
    console.log(`Scraping: ${seriesUrl}`);
    
    const response = await axios.get(seriesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    const metadata = scrapeSeriesMetadata($);
    
    const data = {
      baseUrl,
      seriesUrl,
      seriesSlug,
      pageType: 'series',
      scrapedAt: new Date().toISOString(),
      ...metadata,
      categories: scrapeCategories($),
      tags: scrapeTags($),
      cast: scrapeCast($),
      seasons: scrapeSeasons($),
      episodes: scrapeEpisodes($)
    };
    
    return {
      success: true,
      data,
      stats: {
        totalSeasons: data.seasons.length,
        totalEpisodes: data.episodes.length,
        castCount: data.cast.length,
        categoriesCount: data.categories.length
      }
    };
    
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Series not found', statusCode: 404 };
    }
    return { success: false, error: error.message };
  }
}

// Vercel handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({ success: false, error: 'Base URL not found' });
    }
    
    const seriesSlug = req.query.slug || req.query.series;
    if (!seriesSlug) {
      return res.status(400).json({ success: false, error: 'Series slug required. Use ?slug=attack-on-titan' });
    }
    
    const result = await scrapeSeriesPage(baseUrl, seriesSlug);
    
    if (!result.success && result.statusCode === 404) {
      return res.status(404).json(result);
    }
    
    res.status(result.success ? 200 : 500).json(result);
    
  } catch (error) {
    res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
  }
};
