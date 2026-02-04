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

// Create axios instance with better defaults
function createAxiosInstance(baseUrl) {
  return axios.create({
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Cache-Control': 'max-age=0',
      'Referer': baseUrl,
      'DNT': '1'
    },
    validateStatus: function (status) {
      return status >= 200 && status < 500;
    }
  });
}

// Add delay to avoid rate limiting
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Extract iframe from HTML with improved error handling
async function extractIframeFromUrl(originalUrl, baseUrl, retryCount = 0) {
  const maxRetries = 2;
  
  try {
    console.log(`[Attempt ${retryCount + 1}] Extracting iframe from: ${originalUrl}`);
    
    // Add small delay between requests
    if (retryCount > 0) {
      await delay(1000 * retryCount);
    }
    
    const axiosInstance = createAxiosInstance(baseUrl);
    
    // Parse URL to rebuild it properly
    const urlObj = new URL(originalUrl);
    const fullUrl = urlObj.toString();
    
    // Fetch the page with updated headers for iframe context
    const response = await axiosInstance.get(fullUrl, {
      headers: {
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': baseUrl
      }
    });
    
    // Handle different status codes
    if (response.status === 403) {
      console.log(`Got 403 for ${originalUrl}`);
      if (retryCount < maxRetries) {
        console.log(`Retrying with different approach...`);
        await delay(2000);
        return await extractIframeFromUrl(originalUrl, baseUrl, retryCount + 1);
      }
      // After retries, return original URL
      return originalUrl;
    }
    
    if (response.status === 404 || response.status >= 400) {
      console.log(`Got status ${response.status}, using original URL as fallback`);
      return originalUrl;
    }
    
    const html = response.data;
    
    // Try multiple iframe extraction patterns
    let iframeSrc = null;
    
    // Pattern 1: Standard iframe src
    const iframeMatch1 = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeMatch1 && iframeMatch1[1]) {
      iframeSrc = iframeMatch1[1];
    }
    
    // Pattern 2: iframe with data-src
    if (!iframeSrc) {
      const iframeMatch2 = html.match(/<iframe[^>]+data-src=["']([^"']+)["']/i);
      if (iframeMatch2 && iframeMatch2[1]) {
        iframeSrc = iframeMatch2[1];
      }
    }
    
    // Pattern 3: Look for video player URLs in script tags
    if (!iframeSrc) {
      const scriptMatch = html.match(/(?:src|url)["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4|mkv)[^"']*)["']/i);
      if (scriptMatch && scriptMatch[1]) {
        iframeSrc = scriptMatch[1];
      }
    }
    
    if (iframeSrc) {
      // Handle relative URLs
      if (iframeSrc.startsWith('//')) {
        iframeSrc = 'https:' + iframeSrc;
      } else if (iframeSrc.startsWith('/')) {
        const urlBase = new URL(originalUrl);
        iframeSrc = urlBase.origin + iframeSrc;
      }
      
      console.log(`✓ Extracted iframe: ${iframeSrc}`);
      return iframeSrc;
    } else {
      console.log('No iframe found, using original URL');
      return originalUrl;
    }
    
  } catch (error) {
    console.error(`Error extracting iframe (attempt ${retryCount + 1}):`, error.message);
    
    // Retry on network errors
    if (retryCount < maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.log(`Network error, retrying...`);
      await delay(2000);
      return await extractIframeFromUrl(originalUrl, baseUrl, retryCount + 1);
    }
    
    // Fallback to original URL on any error
    return originalUrl;
  }
}

// Scrape movie details
function scrapeMovieDetails($) {
  const movie = {};
  
  // Basic info
  movie.title = $('.entry-title').first().text().trim();
  movie.posterImage = extractImageUrl($('.post-thumbnail img').attr('src'));
  movie.posterAlt = $('.post-thumbnail img').attr('alt') || '';
  
  // Backdrop images
  movie.backdrop = {
    header: extractImageUrl($('.bghd .TPostBg').attr('src')) || null,
    footer: extractImageUrl($('.bgft .TPostBg').attr('src')) || null
  };
  
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

// Scrape video/streaming options with parallel processing limit
async function scrapeVideoOptions($, baseUrl) {
  const videoOptions = {
    languages: [],
    servers: []
  };
  
  // Language tabs
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
  
  // Server options
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
  
  // Video iframes - extract original URLs first
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
  
  // Process iframes with concurrency limit and delays
  console.log(`Processing ${iframes.length} video iframes...`);
  const concurrencyLimit = 3; // Process max 3 at a time
  
  for (let i = 0; i < iframes.length; i += concurrencyLimit) {
    const batch = iframes.slice(i, i + concurrencyLimit);
    
    // Process batch in parallel
    await Promise.all(
      batch.map(async (iframe) => {
        if (iframe.originalSrc) {
          try {
            const extractedUrl = await extractIframeFromUrl(iframe.originalSrc, baseUrl);
            iframe.src = extractedUrl;
          } catch (error) {
            console.error(`Failed to extract iframe for ${iframe.optionId}:`, error.message);
            iframe.src = iframe.originalSrc; // Fallback to original
          }
        }
      })
    );
    
    // Add delay between batches to avoid rate limiting
    if (i + concurrencyLimit < iframes.length) {
      await delay(1500);
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

// Main scraper function with retry logic
async function scrapeMoviePage(baseUrl, moviePath, retryCount = 0) {
  const maxRetries = 2;
  
  try {
    const movieUrl = `${baseUrl}/movies/${moviePath}`;
    console.log(`[Attempt ${retryCount + 1}] Scraping: ${movieUrl}`);
    
    // Add delay on retries
    if (retryCount > 0) {
      await delay(2000 * retryCount);
    }
    
    const axiosInstance = createAxiosInstance(baseUrl);
    
    const response = await axiosInstance.get(movieUrl);
    
    // Handle 403 with retry
    if (response.status === 403) {
      console.log('Received 403 Forbidden');
      if (retryCount < maxRetries) {
        console.log(`Retrying... (${retryCount + 1}/${maxRetries})`);
        await delay(3000);
        return await scrapeMoviePage(baseUrl, moviePath, retryCount + 1);
      }
      return {
        success: false,
        error: 'Access forbidden (403). The website is blocking requests after multiple attempts.',
        statusCode: 403,
        suggestion: 'Try again later or use a different network/proxy.'
      };
    }
    
    // Handle 404
    if (response.status === 404) {
      return {
        success: false,
        error: 'Movie not found',
        statusCode: 404
      };
    }
    
    // Handle other errors
    if (response.status >= 400) {
      return {
        success: false,
        error: `HTTP Error ${response.status}`,
        statusCode: response.status
      };
    }
    
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
      videoOptions: await scrapeVideoOptions($, baseUrl),
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
    
    // Retry on network errors
    if (retryCount < maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.log(`Network error, retrying... (${retryCount + 1}/${maxRetries})`);
      await delay(3000);
      return await scrapeMoviePage(baseUrl, moviePath, retryCount + 1);
    }
    
    if (error.response && error.response.status === 404) {
      return {
        success: false,
        error: 'Movie not found',
        statusCode: 404
      };
    }
    
    if (error.response && error.response.status === 403) {
      if (retryCount < maxRetries) {
        console.log(`403 error, retrying... (${retryCount + 1}/${maxRetries})`);
        await delay(3000);
        return await scrapeMoviePage(baseUrl, moviePath, retryCount + 1);
      }
      return {
        success: false,
        error: 'Access forbidden (403). The website is blocking requests.',
        statusCode: 403,
        suggestion: 'Try again later or use a different approach.'
      };
    }
    
    return {
      success: false,
      error: error.message,
      errorCode: error.code
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
        error: 'Movie path is required. Use ?path=movie-name',
        example: '/api/movies?path=spider-man-across-the-spider-verse-2023'
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
