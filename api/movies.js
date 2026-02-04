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

// Generate random user agents
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Add delay between requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract iframe from HTML with better anti-detection
async function extractIframeFromUrl(originalUrl, referer) {
  try {
    console.log(`Extracting iframe from: ${originalUrl}`);
    
    // Add random delay to avoid rate limiting
    await delay(Math.random() * 1000 + 500);
    
    const urlObj = new URL(originalUrl);
    const fullUrl = urlObj.toString();
    
    // Create axios instance with cookie jar simulation
    const response = await axios.get(fullUrl, {
      headers: { 
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': referer || 'https://www.google.com/',
        'DNT': '1',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
      },
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      },
      // Important: handle cookies
      withCredentials: true,
      // Follow redirects
      maxContentLength: 50 * 1024 * 1024,
      maxBodyLength: 50 * 1024 * 1024
    });
    
    if (response.status === 403 || response.status === 404 || response.status >= 400) {
      console.log(`Got status ${response.status}, using original URL as fallback`);
      return originalUrl;
    }
    
    const html = response.data;
    
    // Multiple patterns to find iframe
    const iframePatterns = [
      /<iframe[^>]+src=["']([^"']+)["']/i,
      /<iframe[^>]+data-src=["']([^"']+)["']/i,
      /src:\s*["']([^"']+)["']/i,
      /"iframe":\s*["']([^"']+)["']/i
    ];
    
    for (const pattern of iframePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const iframeSrc = match[1];
        console.log(`Extracted iframe: ${iframeSrc}`);
        return iframeSrc;
      }
    }
    
    console.log('No iframe found, using original URL');
    return originalUrl;
    
  } catch (error) {
    console.error('Error extracting iframe:', error.message);
    return originalUrl;
  }
}

// Scrape movie details
function scrapeMovieDetails($) {
  const movie = {};
  
  movie.title = $('.entry-title').first().text().trim();
  movie.posterImage = extractImageUrl($('.post-thumbnail img').attr('src'));
  movie.posterAlt = $('.post-thumbnail img').attr('alt') || '';
  
  movie.backdrop = {
    header: extractImageUrl($('.bghd .TPostBg').attr('src')) || null,
    footer: extractImageUrl($('.bgft .TPostBg').attr('src')) || null
  };
  
  movie.genres = [];
  $('.entry-meta .genres a').each((index, element) => {
    movie.genres.push({
      name: $(element).text().trim(),
      url: $(element).attr('href') || ''
    });
  });
  
  movie.tags = [];
  $('.entry-meta .tag a').each((index, element) => {
    movie.tags.push({
      name: $(element).text().trim(),
      url: $(element).attr('href') || ''
    });
  });
  
  const durationText = $('.entry-meta .duration').text().trim();
  movie.duration = durationText;
  
  const yearText = $('.entry-meta .year').text().trim();
  movie.year = yearText;
  
  const descriptionParagraphs = [];
  $('.description p').each((index, element) => {
    const text = $(element).text().trim();
    if (text) {
      descriptionParagraphs.push(text);
    }
  });
  movie.description = descriptionParagraphs[0] || '';
  movie.additionalInfo = descriptionParagraphs.slice(1);
  
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
  
  const ratingText = $('.vote-cn .vote .num').text().trim();
  movie.rating = ratingText || null;
  movie.ratingSource = $('.vote-cn .vote span').last().text().trim() || 'TMDB';
  
  return movie;
}

// Scrape video/streaming options
async function scrapeVideoOptions($, movieUrl) {
  const videoOptions = {
    languages: [],
    servers: []
  };
  
  $('.d-flex-ch.mb-10.btr .btn, .d-flex-ch.mb-10.btr span').each((index, element) => {
    const $elem = $(element);
    const language = $elem.text().trim();
    const tabId = $elem.attr('tab');
    const isActive = $elem.hasClass('active');
    
    if (language) {
      videoOptions.languages.push({
        language: language,
        tabId: tabId,
        active: isActive
      });
    }
  });
  
  $('.lrt').each((langIndex, langElement) => {
    const $langElem = $(langElement);
    const langId = $langElem.attr('id');
    const isActive = $langElem.hasClass('active');
    
    const servers = [];
    $langElem.find('.aa-tbs-video li').each((serverIndex, serverElement) => {
      const $serverLink = $(serverElement).find('a');
      const serverNumber = $serverLink.find('span').first().text().trim();
      const serverName = $serverLink.find('.server').text()
        .replace('-Hindi-Eng-Jap', '')
        .replace('-Multi Audio', '')
        .replace('Multi Audio', '')
        .trim();
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
  
  const iframes = [];
  $('.video-player .video').each((index, element) => {
    const $elem = $(element);
    const optionId = $elem.attr('id');
    const isActive = $elem.hasClass('on');
    const $iframe = $elem.find('iframe');
    const originalSrc = $iframe.attr('src') || $iframe.attr('data-src') || '';
    
    iframes.push({
      optionId: optionId,
      active: isActive,
      originalSrc: originalSrc,
      src: originalSrc
    });
  });
  
  console.log(`Processing ${iframes.length} video iframes...`);
  for (let i = 0; i < iframes.length; i++) {
    if (iframes[i].originalSrc) {
      const extractedUrl = await extractIframeFromUrl(iframes[i].originalSrc, movieUrl);
      iframes[i].src = extractedUrl;
    }
  }
  
  videoOptions.iframes = iframes;
  
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

// Main scraper function with anti-detection
async function scrapeMoviePage(baseUrl, moviePath) {
  try {
    const movieUrl = `${baseUrl}/movies/${moviePath}`;
    console.log(`Scraping: ${movieUrl}`);
    
    // Add random delay before request
    await delay(Math.random() * 2000 + 1000);
    
    const response = await axios.get(movieUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'DNT': '1',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        // Critical: Add referer to appear more legitimate
        'Referer': baseUrl + '/'
      },
      timeout: 30000,
      maxRedirects: 5,
      // Important for cookies
      withCredentials: true,
      // Validate all status codes to handle them manually
      validateStatus: function (status) {
        return status >= 200 && status < 600;
      }
    });
    
    // Handle different status codes
    if (response.status === 403) {
      return {
        success: false,
        error: 'Access forbidden (403). Try using a proxy or VPN.',
        statusCode: 403,
        suggestion: 'The website is blocking direct requests. Consider deploying on Vercel with different IP addresses or using a proxy service.'
      };
    }
    
    if (response.status === 404) {
      return {
        success: false,
        error: 'Movie not found (404)',
        statusCode: 404
      };
    }
    
    if (response.status >= 500) {
      return {
        success: false,
        error: `Server error (${response.status})`,
        statusCode: response.status
      };
    }
    
    const $ = cheerio.load(response.data);
    
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
      videoOptions: await scrapeVideoOptions($, movieUrl),
      comments: scrapeComments($),
      relatedMovies: scrapeRelatedMovies($)
    };
    
    return {
      success: true,
      data: data,
      stats: {
        hasMovieDetails: !!data.movieDetails.title,
        hasBackdrop: !!(data.movieDetails.backdrop.header || data.movieDetails.backdrop.footer),
        videoOptionsCount: data.videoOptions.iframes.length,
        commentsCount: data.comments.length,
        relatedMoviesCount: data.relatedMovies.length
      }
    };
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      return {
        success: false,
        error: 'Connection refused. The server may be down.',
        details: error.message
      };
    }
    
    if (error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'Request timeout. The server took too long to respond.',
        details: error.message
      };
    }
    
    return {
      success: false,
      error: error.message,
      type: error.code || 'UNKNOWN_ERROR'
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
    
    const moviePath = req.query.path;
    
    if (!moviePath) {
      return res.status(400).json({
        success: false,
        error: 'Movie path is required. Use ?path=movie-name',
        example: '/api/movies?path=avatar-2009'
      });
    }
    
    const result = await scrapeMoviePage(baseUrl, moviePath);
    
    if (!result.success && result.statusCode === 404) {
      return res.status(404).json(result);
    }
    
    if (!result.success && result.statusCode === 403) {
      return res.status(403).json(result);
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
