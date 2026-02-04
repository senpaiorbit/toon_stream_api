
// api/movies.js
const cheerio = require('cheerio');

// Cache for base URL and proxy URL (5 minutes)
let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch base URL from GitHub with caching
async function getBaseUrl() {
  const now = Date.now();
  
  if (baseUrlCache.url && (now - baseUrlCache.timestamp) < CACHE_DURATION) {
    return baseUrlCache.url;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const baseUrl = (await response.text()).trim().replace(/\/+$/, '');
      baseUrlCache = { url: baseUrl, timestamp: now };
      return baseUrl;
    }
  } catch (error) {
    console.error('Error fetching base URL from GitHub:', error.message);
  }
  
  // Fallback
  const fallbackUrl = 'https://toonstream.dad';
  baseUrlCache = { url: fallbackUrl, timestamp: now };
  return fallbackUrl;
}

// Fetch proxy URL from GitHub with caching
async function getProxyUrl() {
  const now = Date.now();
  
  if (proxyUrlCache.url && (now - proxyUrlCache.timestamp) < CACHE_DURATION) {
    return proxyUrlCache.url;
  }
  
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url: proxyUrl, timestamp: now };
      return proxyUrl;
    }
  } catch (error) {
    console.error('Error fetching proxy URL from GitHub:', error.message);
  }
  
  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

// Fetch with proxy fallback
async function fetchWithProxy(targetUrl, refererUrl = null) {
  const proxyUrl = await getProxyUrl();
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  
  if (refererUrl) {
    headers['Referer'] = refererUrl;
  }
  
  // Try proxy first
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await fetch(proxyFetchUrl, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        console.log('✓ Proxy fetch successful');
        return await proxyResponse.text();
      } else {
        console.log(`✗ Proxy returned ${proxyResponse.status}, falling back to direct fetch`);
      }
    } catch (proxyError) {
      console.log('✗ Proxy fetch failed:', proxyError.message);
    }
  }
  
  // Fallback to direct fetch
  try {
    const baseUrl = await getBaseUrl();
    if (!refererUrl) {
      headers['Referer'] = baseUrl;
    }
    
    const directResponse = await fetch(targetUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30000)
    });
    
    if (!directResponse.ok) {
      throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
    }
    
    console.log('✓ Direct fetch successful');
    return await directResponse.text();
  } catch (directError) {
    throw new Error(`Both proxy and direct fetch failed: ${directError.message}`);
  }
}

function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  if (imgSrc.startsWith('//')) {
    return 'https:' + imgSrc;
  }
  return imgSrc;
}

// Extract iframe from HTML (embedded logic with better error handling)
async function extractIframeFromUrl(originalUrl) {
  try {
    console.log(`Extracting iframe from: ${originalUrl}`);
    
    const urlObj = new URL(originalUrl);
    const fullUrl = urlObj.toString();
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'max-age=0'
    };
    
    const proxyUrl = await getProxyUrl();
    let html = null;
    
    // Try proxy first for iframe extraction
    if (proxyUrl) {
      try {
        const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(fullUrl)}`;
        const proxyResponse = await fetch(proxyFetchUrl, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000)
        });
        
        if (proxyResponse.ok) {
          html = await proxyResponse.text();
        }
      } catch (proxyError) {
        console.log('Proxy failed for iframe extraction:', proxyError.message);
      }
    }
    
    // Fallback to direct fetch
    if (!html) {
      try {
        const directResponse = await fetch(fullUrl, {
          headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000)
        });
        
        if (directResponse.status === 403 || directResponse.status === 404 || directResponse.status >= 400) {
          console.log(`Got status ${directResponse.status}, using original URL as fallback`);
          return originalUrl;
        }
        
        if (directResponse.ok) {
          html = await directResponse.text();
        }
      } catch (directError) {
        console.error('Error extracting iframe:', directError.message);
        return originalUrl;
      }
    }
    
    if (!html) {
      return originalUrl;
    }
    
    // Extract iframe src using regex
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    
    if (iframeMatch && iframeMatch[1]) {
      const iframeSrc = iframeMatch[1];
      console.log(`Extracted iframe: ${iframeSrc}`);
      return iframeSrc;
    } else {
      console.log('No iframe found, using original URL');
      return originalUrl;
    }
    
  } catch (error) {
    console.error('Error extracting iframe:', error.message);
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

// Scrape video/streaming options
async function scrapeVideoOptions($) {
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
  
  // Process all iframes to extract real URLs
  console.log(`Processing ${iframes.length} video iframes...`);
  for (let i = 0; i < iframes.length; i++) {
    if (iframes[i].originalSrc) {
      const extractedUrl = await extractIframeFromUrl(iframes[i].originalSrc);
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

// Main scraper function
async function scrapeMoviePage(baseUrl, moviePath) {
  try {
    const movieUrl = `${baseUrl}/movies/${moviePath}`;
    console.log(`Scraping: ${movieUrl}`);
    
    const html = await fetchWithProxy(movieUrl, baseUrl);
    const $ = cheerio.load(html);
    
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
      videoOptions: await scrapeVideoOptions($),
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
    
    if (error.message.includes('404')) {
      return {
        success: false,
        error: 'Movie not found',
        statusCode: 404
      };
    }
    
    if (error.message.includes('403')) {
      return {
        success: false,
        error: 'Access forbidden (403). The website may be blocking requests.',
        statusCode: 403
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
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  
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
    const baseUrl = await getBaseUrl();
    
    if (!baseUrl) {
      return res.status(500).json({ 
        success: false, 
        error: 'Base URL not found.' 
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
