// api/movies.js
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

// Scrape movie details
function scrapeMovieDetails($) {
  const movie = {};
  
  // Basic info
  movie.title = $('.entry-title').first().text().trim();
  movie.posterImage = extractImageUrl($('.post-thumbnail img').attr('src'));
  movie.posterAlt = $('.post-thumbnail img').attr('alt') || '';
  
  // Genres
  movie.genres = [];
  $('.entry-meta .genres a').each((index, element) => {
    movie.genres.push({
      name: $(element).text().trim(),
      url: $(element).attr('href') || ''
    });
  });
  
  // Tags
  movie.tags = [];
  $('.entry-meta .tag a').each((index, element) => {
    movie.tags.push({
      name: $(element).text().trim(),
      url: $(element).attr('href') || ''
    });
  });
  
  // Duration
  const durationText = $('.entry-meta .duration').text().trim();
  movie.duration = durationText;
  
  // Year
  const yearText = $('.entry-meta .year').text().trim();
  movie.year = yearText;
  
  // Description
  const descriptionParagraphs = [];
  $('.description p').each((index, element) => {
    const text = $(element).text().trim();
    if (text) {
      descriptionParagraphs.push(text);
    }
  });
  movie.description = descriptionParagraphs[0] || '';
  movie.additionalInfo = descriptionParagraphs.slice(1);
  
  // Extract language, quality, running time from description
  movie.language = null;
  movie.quality = null;
  movie.runningTime = null;
  
  descriptionParagraphs.forEach(para => {
    if (para.includes('Language:')) {
      movie.language = para.replace(/Language:/gi, '').trim();
    }
    if (para.includes('Quality:')) {
      movie.quality = para.replace(/Quality:/gi, '').trim();
    }
    if (para.includes('Running time:')) {
      movie.runningTime = para.replace(/Running time:/gi, '').trim();
    }
  });
  
  // Directors
  movie.directors = [];
  $('.cast-lst li').each((index, element) => {
    const $elem = $(element);
    const label = $elem.find('span').text().trim();
    
    if (label === 'Director') {
      $elem.find('p a').each((i, directorLink) => {
        movie.directors.push({
          name: $(directorLink).text().trim(),
          url: $(directorLink).attr('href') || ''
        });
      });
    }
  });
  
  // Cast
  movie.cast = [];
  $('.cast-lst li').each((index, element) => {
    const $elem = $(element);
    const label = $elem.find('span').text().trim();
    
    if (label === 'Cast') {
      $elem.find('p a').each((i, castLink) => {
        movie.cast.push({
          name: $(castLink).text().trim(),
          url: $(castLink).attr('href') || ''
        });
      });
    }
  });
  
  // Rating
  const ratingText = $('.vote-cn .vote .num').text().trim();
  movie.rating = ratingText || null;
  movie.ratingSource = $('.vote-cn .vote span').last().text().trim() || 'TMDB';
  
  return movie;
}

// Scrape video/streaming options
function scrapeVideoOptions($) {
  const videoOptions = {
    languages: [],
    servers: []
  };
  
  // Language tabs
  $('.d-flex-ch.mb-10.btr .btn').each((index, element) => {
    const $elem = $(element);
    const language = $elem.text().trim();
    const tabId = $elem.attr('tab');
    const isActive = $elem.hasClass('active');
    
    videoOptions.languages.push({
      language: language,
      tabId: tabId,
      active: isActive
    });
  });
  
  // Server options
  $('.lrt').each((langIndex, langElement) => {
    const $langElem = $(langElement);
    const langId = $langElem.attr('id');
    const isActive = $langElem.hasClass('active');
    
    const servers = [];
    $langElem.find('.aa-tbs li').each((serverIndex, serverElement) => {
      const $serverLink = $(serverElement).find('a');
      const serverNumber = $serverLink.find('span').first().text().trim();
      const serverName = $serverLink.find('.server').text().trim();
      const targetId = $serverLink.attr('href')?.replace('#', '') || '';
      const isServerActive = $serverLink.hasClass('on');
      
      servers.push({
        serverNumber: serverNumber,
        serverName: serverName,
        targetId: targetId,
        active: isServerActive
      });
    });
    
    videoOptions.servers.push({
      languageId: langId,
      active: isActive,
      servers: servers
    });
  });
  
  // Video iframes
  videoOptions.iframes = [];
  $('.video-player .video').each((index, element) => {
    const $elem = $(element);
    const optionId = $elem.attr('id');
    const isActive = $elem.hasClass('on');
    const $iframe = $elem.find('iframe');
    
    videoOptions.iframes.push({
      optionId: optionId,
      active: isActive,
      src: $iframe.attr('src') || $iframe.attr('data-src') || ''
    });
  });
  
  return videoOptions;
}

// Scrape comments
function scrapeComments($) {
  const comments = [];
  
  $('.comment-list .comment').each((index, element) => {
    const $elem = $(element);
    const commentId = $elem.attr('id');
    
    const author = $elem.find('.comment-author .fn').text().trim();
    const avatar = $elem.find('.comment-author img').attr('src') || '';
    const date = $elem.find('.comment-metadata time').attr('datetime') || '';
    const dateText = $elem.find('.comment-metadata time').text().trim();
    const content = $elem.find('.comment-content p').text().trim();
    const commentUrl = $elem.find('.comment-metadata a').attr('href') || '';
    
    comments.push({
      id: commentId,
      author: author,
      avatar: avatar,
      date: date,
      dateText: dateText,
      content: content,
      url: commentUrl
    });
  });
  
  return comments;
}

// Scrape related movies
function scrapeRelatedMovies($) {
  const relatedMovies = [];
  
  $('.section.episodes .carousel article').each((index, element) => {
    const $elem = $(element);
    const $link = $elem.find('.lnk-blk');
    const $img = $elem.find('img');
    const $title = $elem.find('.entry-title');
    const $vote = $elem.find('.vote');
    
    relatedMovies.push({
      title: $title.text().trim(),
      image: extractImageUrl($img.attr('src')),
      imageAlt: $img.attr('alt') || '',
      url: $link.attr('href') || '',
      rating: $vote.text().replace('TMDB', '').trim() || null
    });
  });
  
  return relatedMovies;
}

// Main scraper function
async function scrapeMoviePage(baseUrl, moviePath) {
  try {
    const movieUrl = `${baseUrl}/movies/${moviePath}`;
    console.log(`Scraping: ${movieUrl}`);
    
    const response = await axios.get(movieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    
    // Get post ID from body class
    const bodyClass = $('body').attr('class') || '';
    const postIdMatch = bodyClass.match(/postid-(\d+)/);
    const postId = postIdMatch ? postIdMatch[1] : null;
    
    const data = {
      baseUrl: baseUrl,
      movieUrl: movieUrl,
      moviePath: moviePath,
      postId: postId,
      scrapedAt: new Date().toISOString(),
      movieDetails: scrapeMovieDetails($),
      videoOptions: scrapeVideoOptions($),
      comments: scrapeComments($),
      relatedMovies: scrapeRelatedMovies($)
    };
    
    return {
      success: true,
      data: data,
      stats: {
        hasMovieDetails: !!data.movieDetails.title,
        videoOptionsCount: data.videoOptions.iframes.length,
        commentsCount: data.comments.length,
        relatedMoviesCount: data.relatedMovies.length
      }
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    if (error.response && error.response.status === 404) {
      return {
        success: false,
        error: 'Movie not found',
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
    
    // Get movie path from query parameter
    const moviePath = req.query.path;
    
    if (!moviePath) {
      return res.status(400).json({
        success: false,
        error: 'Movie path is required. Use ?path=movie-name'
      });
    }
    
    const result = await scrapeMoviePage(baseUrl, moviePath);
    
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
