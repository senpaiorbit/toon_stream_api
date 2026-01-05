// api/episode.js
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

// Scrape episode metadata
function scrapeEpisodeMetadata($) {
  const $article = $('article.post.single');
  
  return {
    title: $article.find('.entry-title').text().trim(),
    image: extractImageUrl($article.find('.post-thumbnail img').attr('src')),
    description: $article.find('.description').text().trim(),
    duration: $article.find('.duration').text().replace('min', '').trim(),
    year: $article.find('.year').text().trim(),
    rating: $('.vote .num').text().trim(),
    categories: [],
    cast: [],
    navigation: {}
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

// Extract cast
function scrapeCast($) {
  const cast = [];
  $('.cast-lst a').each((i, el) => {
    cast.push({
      name: $(el).text().trim(),
      url: $(el).attr('href')
    });
  });
  return cast;
}

// Extract navigation buttons
function scrapeNavigation($) {
  const nav = {
    previousEpisode: null,
    nextEpisode: null,
    seriesPage: null
  };
  
  $('.epsdsnv a, .epsdsnv span').each((i, el) => {
    const $el = $(el);
    const text = $el.text().toLowerCase();
    const href = $el.attr('href');
    
    if (text.includes('previous') && href) {
      nav.previousEpisode = href;
    } else if (text.includes('next') && href) {
      nav.nextEpisode = href;
    } else if (text.includes('season') && href) {
      nav.seriesPage = href;
    }
  });
  
  return nav;
}

// Extract servers/iframes
function scrapeServers($, requestedServers) {
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
        src: src,
        isActive: $el.hasClass('on')
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
      .trim();
    
    if (servers[serverNum]) {
      servers[serverNum].name = serverName;
      servers[serverNum].displayNumber = serverNum + 1;
      servers[serverNum].isActive = $btn.hasClass('on');
    }
  });
  
  // Filter by requested servers
  if (requestedServers && requestedServers.length > 0) {
    return servers.filter(s => requestedServers.includes(s.serverNumber));
  }
  
  return servers;
}

// Extract available seasons
function scrapeAvailableSeasons($) {
  const seasons = [];
  $('.choose-season .sel-temp a').each((i, el) => {
    const $el = $(el);
    seasons.push({
      seasonNumber: parseInt($el.attr('data-season')) || 0,
      name: $el.text().trim()
    });
  });
  return seasons;
}

// Extract season episodes
function scrapeSeasonEpisodes($) {
  const episodes = [];
  $('#episode_by_temp li').each((i, el) => {
    const $el = $(el);
    const $article = $el.find('article');
    
    episodes.push({
      episodeNumber: $article.find('.num-epi').text().trim(),
      title: $article.find('.entry-title').text().trim(),
      image: extractImageUrl($article.find('img').attr('src')),
      time: $article.find('.time').text().trim(),
      url: $article.find('.lnk-blk').attr('href')
    });
  });
  return episodes;
}

// Main scraper
async function scrapeEpisodePage(baseUrl, episodeSlug, serverQuery) {
  try {
    const episodeUrl = `${baseUrl}/episode/${episodeSlug}/`;
    console.log(`Scraping: ${episodeUrl}`);
    
    const response = await axios.get(episodeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    const metadata = scrapeEpisodeMetadata($);
    const allServers = scrapeServers($, null);
    const requestedServers = parseServers(serverQuery, allServers.length);
    
    const data = {
      baseUrl,
      episodeUrl,
      episodeSlug,
      pageType: 'episode',
      scrapedAt: new Date().toISOString(),
      ...metadata,
      categories: scrapeCategories($),
      cast: scrapeCast($),
      navigation: scrapeNavigation($),
      availableSeasons: scrapeAvailableSeasons($),
      seasonEpisodes: scrapeSeasonEpisodes($),
      servers: requestedServers ? 
        scrapeServers($, requestedServers) : 
        allServers
    };
    
    return {
      success: true,
      data,
      stats: {
        totalServers: allServers.length,
        returnedServers: data.servers.length,
        castCount: data.cast.length,
        categoriesCount: data.categories.length,
        seasonEpisodesCount: data.seasonEpisodes.length
      }
    };
    
  } catch (error) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Episode not found', statusCode: 404 };
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
    
    const episodeSlug = req.query.slug || req.query.episode;
    if (!episodeSlug) {
      return res.status(400).json({ 
        success: false, 
        error: 'Episode slug required. Use ?slug=attack-on-titan-2x1 or ?slug=attack-on-titan-2x1&server=1,2,3'
      });
    }
    
    const serverQuery = req.query.server || req.query.servers;
    
    const result = await scrapeEpisodePage(baseUrl, episodeSlug, serverQuery);
    
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
