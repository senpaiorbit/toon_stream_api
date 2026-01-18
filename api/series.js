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
  
  if (seasonsParam.toLowerCase() === 'latest') {
    return 'latest';
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

// Parse server query
function parseServers(serverParam, totalServers) {
  if (!serverParam) return null;
  
  if (serverParam.toLowerCase() === 'all') {
    return Array.from({length: totalServers}, (_, i) => i);
  }
  
  const servers = [];
  const parts = serverParam.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!servers.includes(i)) servers.push(i);
        }
      }
    } else {
      const num = parseInt(trimmed);
      if (!isNaN(num) && !servers.includes(num)) {
        servers.push(num);
      }
    }
  }
  
  return servers.sort((a, b) => a - b);
}

// Scrape series metadata from main series page
async function scrapeSeriesMetadata(baseUrl, seriesSlug) {
  const seriesUrl = `${baseUrl}/series/${seriesSlug}/`;
  
  try {
    const response = await axios.get(seriesUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
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
      availableSeasons: availableSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber)
    };
  } catch (error) {
    throw new Error(`Failed to fetch series metadata: ${error.message}`);
  }
}

// Scrape episode servers
async function scrapeEpisodeServers(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const servers = [];
    let serverIndex = 0;
    
    // Extract from video player iframes
    $('.video-player .video').each((i, el) => {
      const $el = $(el);
      const $iframe = $el.find('iframe');
      const src = $iframe.attr('src') || $iframe.attr('data-src');
      
      if (src) {
        servers.push({
          serverNumber: serverIndex,
          src: src
        });
        serverIndex++;
      }
    });
    
    // Extract server names from buttons
    $('.aa-tbs-video li').each((i, el) => {
      const $el = $(el);
      const $btn = $el.find('.btn');
      const serverNum = parseInt($btn.find('span').first().text()) - 1;
      const serverName = $btn.find('.server').text()
        .replace('-Multi Audio', '')
        .replace('Multi Audio', '')
        .trim();
      
      if (servers[serverNum]) {
        servers[serverNum].name = serverName;
        servers[serverNum].displayNumber = serverNum + 1;
      }
    });
    
    // Filter servers
    const requestedServers = parseServers(serverQuery, servers.length);
    if (requestedServers && requestedServers.length > 0) {
      return servers.filter(s => requestedServers.includes(s.serverNumber));
    }
    
    return servers;
  } catch (error) {
    console.error(`Failed to fetch servers for ${episodeSlug}:`, error.message);
    return [];
  }
}

// Scrape episodes for a specific season
async function scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNumber, includeSrc, serverQuery) {
  const episodeUrl = `${baseUrl}/episode/${seriesSlug}-${seasonNumber}x1/`;
  
  try {
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
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
      const url = $article.find('.lnk-blk').attr('href');
      
      const episode = {
        episodeNumber: episodeNum,
        title: $article.find('.entry-title').text().trim(),
        image: extractImageUrl($article.find('img').attr('src')),
        time: $article.find('.time').text().trim(),
        url: url
      };
      
      seasonData.episodes.push(episode);
    });
    
    // Fetch servers if requested
    if (includeSrc && seasonData.episodes.length > 0) {
      console.log(`Fetching servers for season ${seasonNumber}...`);
      for (const episode of seasonData.episodes) {
        const episodeSlug = episode.url.split('/episode/')[1]?.replace('/', '');
        if (episodeSlug) {
          episode.servers = await scrapeEpisodeServers(baseUrl, episodeSlug, serverQuery);
        }
      }
    }
    
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
async function scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery) {
  try {
    // Get series metadata
    const metadata = await scrapeSeriesMetadata(baseUrl, seriesSlug);
    
    // Determine which seasons to fetch
    let requestedSeasons = parseSeasons(seasonsQuery);
    
    if (requestedSeasons === 'all') {
      requestedSeasons = metadata.availableSeasons.map(s => s.seasonNumber);
    } else if (requestedSeasons === 'latest') {
      // Get the highest season number (latest season)
      const latestSeason = Math.max(...metadata.availableSeasons.map(s => s.seasonNumber));
      requestedSeasons = [latestSeason];
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
      const seasonData = await scrapeSeasonEpisodes(baseUrl, seriesSlug, seasonNum, includeSrc, serverQuery);
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
      includeServerSources: includeSrc || false,
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
        categoriesCount: data.categories.length,
        includesServerSources: includeSrc || false
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
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use GET request.' });
  }
  
  try {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      return res.status(500).json({ success: false, error: 'Base URL not found. Please check src/baseurl.txt file.' });
    }
    
    const seriesSlug = req.query.slug || req.query.series;
    if (!seriesSlug) {
      return res.status(400).json({ 
        success: false, 
        error: 'Series slug required. Use ?slug=attack-on-titan&seasons=1,2 or ?slug=attack-on-titan&seasons=all or ?slug=attack-on-titan&seasons=latest&src=true&server=0,1,2' 
      });
    }
    
    const seasonsQuery = req.query.seasons || req.query.season;
    const includeSrc = req.query.src === 'true';
    const serverQuery = req.query.server || req.query.servers;
    
    const result = await scrapeSeriesPage(baseUrl, seriesSlug, seasonsQuery, includeSrc, serverQuery);
    
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
