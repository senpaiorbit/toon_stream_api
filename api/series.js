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

// Parse seasons query parameter
function parseSeasons(seasonsParam) {
  if (!seasonsParam) return [1]; // Default to season 1
  
  if (seasonsParam.toLowerCase() === 'all') {
    return 'all';
  }
  
  const seasons = [];
  const parts = seasonsParam.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    // Range: 2-4
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!seasons.includes(i)) seasons.push(i);
        }
      }
    }
    // Single number: 3
    else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && !seasons.includes(num)) {
        seasons.push(num);
      }
    }
  }
  
  return seasons.sort((a, b) => a - b);
}

// Scrape series metadata from main series page
async function scrapeSeriesMetadata(baseUrl, seriesSlug) {
  const seriesUrl = `${baseUrl}/series/${seriesSlug}/`;
  
  try {
    const response = await axios.get(seriesUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const $article = $('article.post.single');
    
    // Extract available seasons
    const availableSeasons = [];
    $('.choose-season .sel-temp a').each((i, el) => {
      const seasonNum = parseInt($(el).attr('data-season'));
      if (!isNaN(seasonNum)) {
        availableSeasons.push({
          seasonNumber: seasonNum,
          name: $(el).text().trim()
        });
      }
    });
    
    return {
      title: $article.find('.entry-title').text().trim(),
      image: extractImageUrl($article.find('.post-thumbnail img').attr('src')),
      duration: $article.find('.duration').text().replace('min.', '').trim(),
      year: $article.find('.year').text().trim(),
      views: $article.find('.views span').first().text().trim(),
      totalSeasons: parseInt($article.find('.seasons span').text()) || 0,
      totalEpisodes: parseInt($article.find('.episodes span').text()) || 0,
      rating: $article.find('.vote .num').text().trim(),
      description: $article.find('.description').html()?.trim() || '',
      categories: [],
      tags: [],
      cast: [],
      availableSeasons: availableSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber)
    };
  } catch (error) {
    throw new Error(`Failed to fetch series metadata: ${error.message}`);
  }
}

// Scrape episodes for a specific season
async function scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNumber) {
  // Fetch first episode page to get season info
  const episodeUrl = `${baseUrl}/episode/${seriesSlug}-${seasonNumber}x1/`;
  
  try {
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Extract episode metadata
    const seasonData = {
      seasonNumber: seasonNumber,
      episodes: [],
      categories: [],
      tags: [],
      cast: [],
      year: $('article.post.single .year').text().trim(),
      rating: $('article.post.single .vote .num').text().trim()
    };
    
    // Extract categories
    $('article.post.single .genres a').each((i, el) => {
      seasonData.categories.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract tags
    $('article.post.single .tag a').each((i, el) => {
      seasonData.tags.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract cast
    $('article.post.single .cast-lst a').each((i, el) => {
      seasonData.cast.push({
        name: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    
    // Extract all episodes from episode list
    $('#episode_by_temp li').each((i, el) => {
      const $el = $(el);
      const $article = $el.find('article');
      const episodeNum = $article.find('.num-epi').text().trim();
      
      seasonData.episodes.push({
        episodeNumber: episodeNum,
        title: $article.find('.entry-title').text().trim(),
        image: extractImageUrl($article.find('img').attr('src')),
        time: $article.find('.time').text().trim(),
        url: $article.find('.lnk-blk').attr('href')
      });
    });
    
    return seasonData;
  } catch (error) {
    console.error(`Failed to fetch season ${seasonNumber}:`, error.message);
    return {
      seasonNumber: seasonNumber,
      episodes: [],
      error: error.message
    };
  }
}

// Main scraper function
async function scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery) {
  try {
    // Get series metadata
    const metadata = await scrapeSeriesMetadata(baseUrl, seriesSlug);
    
    // Determine which seasons to fetch
    let requestedSeasons = parseSeasons(seasonsQuery);
    
    if (requestedSeasons === 'all') {
      requestedSeasons = metadata.availableSeasons.map(s => s.seasonNumber);
    }
    
    // Validate requested seasons
    const validSeasons = requestedSeasons.filter(season => 
      metadata.availableSeasons.some(s => s.seasonNumber === season)
    );
    
    if (validSeasons.length === 0 && requestedSeasons.length > 0) {
      return {
        success: false,
        error: `None of the requested seasons (${requestedSeasons.join(', ')}) are available. Available seasons: ${metadata.availableSeasons.map(s => s.seasonNumber).join(', ')}`
      };
    }
    
    // Fetch episodes for each requested season
    const seasonsData = [];
    
    for (const seasonNum of validSeasons) {
      console.log(`Fetching season ${seasonNum}...`);
      const seasonData = await scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNum);
      seasonsData.push(seasonData);
    }
    
    // Combine categories, tags, and cast from all seasons (deduplicate)
    const allCategories = new Map();
    const allTags = new Map();
    const allCast = new Map();
    
    seasonsData.forEach(season => {
      season.categories.forEach(cat => allCategories.set(cat.name, cat));
      season.tags.forEach(tag => allTags.set(tag.name, tag));
      season.cast.forEach(member => allCast.set(member.name, member));
    });
    
    const data = {
      baseUrl,
      seriesUrl: `${baseUrl}/series/${seriesSlug}/`,
      seriesSlug,
      pageType: 'series',
      scrapedAt: new Date().toISOString(),
      requestedSeasons: validSeasons,
      ...metadata,
      categories: Array.from(allCategories.values()),
      tags: Array.from(allTags.values()),
      cast: Array.from(allCast.values()),
      seasons: seasonsData
    };
    
    // Calculate total episodes from fetched seasons
    const totalFetchedEpisodes = seasonsData.reduce((sum, s) => sum + s.episodes.length, 0);
    
    return {
      success: true,
      data,
      stats: {
        totalSeasons: metadata.availableSeasons.length,
        requestedSeasons: validSeasons.length,
        fetchedEpisodes: totalFetchedEpisodes,
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
      return res.status(400).json({ 
        success: false, 
        error: 'Series slug required. Use ?slug=attack-on-titan&seasons=1,2 or ?slug=attack-on-titan&seasons=all' 
      });
    }
    
    const seasonsQuery = req.query.seasons || req.query.season;
    
    const result = await scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery);
    
    if (!result.success && result.statusCode === 404) {
      return res.status(404).json(result);
    }
    
    res.status(result.success ? 200 : 500).json(result);
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error', 
      message: error.message 
    });
  }
};
