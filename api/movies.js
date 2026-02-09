// /api/movies.js

export const config = { runtime: "edge" };

let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

async function getBaseUrl() {
  const now = Date.now();
  if (baseUrlCache.url && (now - baseUrlCache.timestamp) < CACHE_DURATION) {
    return baseUrlCache.url;
  }
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt');
    if (response.ok) {
      const baseUrl = (await response.text()).trim().replace(/\/+$/, '');
      baseUrlCache = { url: baseUrl, timestamp: now };
      return baseUrl;
    }
  } catch (error) {
    console.error('Error fetching base URL:', error.message);
  }
  const fallbackUrl = 'https://toonstream.dad';
  baseUrlCache = { url: fallbackUrl, timestamp: now };
  return fallbackUrl;
}

async function getProxyUrl() {
  const now = Date.now();
  if (proxyUrlCache.url && (now - proxyUrlCache.timestamp) < CACHE_DURATION) {
    return proxyUrlCache.url;
  }
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt');
    if (response.ok) {
      const proxyUrl = (await response.text()).trim().replace(/\/+$/, '');
      proxyUrlCache = { url: proxyUrl, timestamp: now };
      return proxyUrl;
    }
  } catch (error) {
    console.error('Error fetching proxy URL:', error.message);
  }
  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

async function fetchWithProxy(targetUrl) {
  const proxyUrl = await getProxyUrl();
  if (proxyUrl) {
    try {
      const proxyFetchUrl = `${proxyUrl}?url=${encodeURIComponent(targetUrl)}`;
      const proxyResponse = await fetch(proxyFetchUrl, { signal: AbortSignal.timeout(30000) });
      if (proxyResponse.ok) return await proxyResponse.text();
    } catch (proxyError) {
      console.log('Proxy fetch failed:', proxyError.message);
    }
  }
  const directResponse = await fetch(targetUrl, { signal: AbortSignal.timeout(30000) });
  if (!directResponse.ok) {
    throw new Error(`HTTP ${directResponse.status}: ${directResponse.statusText}`);
  }
  return await directResponse.text();
}

function normalizeImage(url) {
  if (!url) return null;
  let normalized = url.startsWith('//') ? 'https:' + url : url;
  normalized = normalized.replace(/\/w\d+\//g, '/w500/');
  return normalized;
}

function extractPostId(html) {
  const match = html.match(/postid-(\d+)/);
  return match ? match[1] : null;
}

function scrapeMovieDetails(html) {
  const details = {
    title: '',
    posterImage: null,
    posterAlt: '',
    backdrop: { header: null, footer: null },
    genres: [],
    tags: [],
    duration: '',
    year: '',
    description: '',
    additionalInfo: [],
    language: '',
    quality: '',
    runningTime: '',
    directors: [],
    cast: [],
    rating: '',
    ratingSource: 'TMDB'
  };

  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/);
  if (titleMatch) details.title = titleMatch[1].trim();

  const posterMatch = html.match(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/);
  if (posterMatch) {
    details.posterImage = normalizeImage(posterMatch[1]);
    details.posterAlt = posterMatch[2];
  }

  const backdropHeaderMatch = html.match(/<div[^>]*class="[^"]*bghd[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (backdropHeaderMatch) details.backdrop.header = normalizeImage(backdropHeaderMatch[1]);

  const backdropFooterMatch = html.match(/<div[^>]*class="[^"]*bgft[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/);
  if (backdropFooterMatch) details.backdrop.footer = normalizeImage(backdropFooterMatch[1]);

  const genresMatch = html.match(/<span[^>]*class="[^"]*genres[^"]*"[^>]*>(.*?)<\/span>/s);
  if (genresMatch) {
    const genrePattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const genreMatches = [...genresMatch[1].matchAll(genrePattern)];
    genreMatches.forEach(m => details.genres.push({ name: m[2].trim(), url: m[1] }));
  }

  const tagsMatch = html.match(/<span[^>]*class="[^"]*tag[^"]*"[^>]*>(.*?)<\/span>/s);
  if (tagsMatch) {
    const tagPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    const tagMatches = [...tagsMatch[1].matchAll(tagPattern)];
    tagMatches.forEach(m => details.tags.push({ name: m[2].trim(), url: m[1] }));
  }

  const durationMatch = html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(.*?)<\/span>/);
  if (durationMatch) details.duration = durationMatch[1].replace(/<[^>]+>/g, '').trim();

  const yearMatch = html.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/);
  if (yearMatch) details.year = yearMatch[1];

  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (descMatch) {
    const descHtml = descMatch[1];
    const pPattern = /<p[^>]*>(.*?)<\/p>/gs;
    const paragraphs = [...descHtml.matchAll(pPattern)];
    
    paragraphs.forEach(p => {
      const text = p[1].replace(/<[^>]+>/g, '').trim();
      if (text && !text.startsWith('Language:') && !text.startsWith('Quality:') && !text.startsWith('Running time:')) {
        if (!details.description) details.description = text;
      }
      
      if (text.startsWith('Language:')) {
        details.language = text.replace('Language:', '').trim();
        details.additionalInfo.push(text);
      } else if (text.startsWith('Quality:')) {
        details.quality = text.replace('Quality:', '').trim();
        details.additionalInfo.push(text);
      } else if (text.startsWith('Running time:')) {
        details.runningTime = text.replace('Running time:', '').trim();
        details.additionalInfo.push(text);
      }
    });
  }

  const castListMatch = html.match(/<ul[^>]*class="[^"]*cast-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/);
  if (castListMatch) {
    const directorMatch = castListMatch[1].match(/<li[^>]*>[\s\S]*?<span>Director<\/span>[\s\S]*?<p[^>]*>(.*?)<\/p>/s);
    if (directorMatch) {
      const dirPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
      const dirs = [...directorMatch[1].matchAll(dirPattern)];
      dirs.forEach(d => details.directors.push({ name: d[2].trim(), url: d[1] }));
    }

    const castMatch = castListMatch[1].match(/<li[^>]*>[\s\S]*?<span>Cast<\/span>[\s\S]*?<p[^>]*>(.*?)<\/p>/s);
    if (castMatch) {
      const castPattern = /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g;
      const casts = [...castMatch[1].matchAll(castPattern)];
      casts.forEach(c => details.cast.push({ name: c[2].trim(), url: c[1] }));
    }
  }

  const ratingMatch = html.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*num[^"]*"[^>]*>([\d.]+)<\/span>/);
  if (ratingMatch) details.rating = ratingMatch[1];

  return details;
}

function scrapeVideoOptions(html, apiUrl) {
  const languages = [];
  const servers = [];
  const iframes = [];

  const langTabPattern = /<span[^>]+tab="(ln\d+)"[^>]*class="[^"]*btn([^"]*)"[^>]*>(.*?)<\/span>/g;
  const langMatches = [...html.matchAll(langTabPattern)];
  langMatches.forEach(m => {
    languages.push({
      language: m[3].trim(),
      tabId: m[1],
      active: m[2].includes('active')
    });
  });

  const serverSectionPattern = /<div[^>]+id="(ln\d+)"[^>]*class="[^"]*lrt([^"]*)"[^>]*>([\s\S]*?)<\/div>/g;
  const serverSections = [...html.matchAll(serverSectionPattern)];
  
  serverSections.forEach(section => {
    const languageId = section[1];
    const isActive = section[2].includes('active');
    const content = section[3];
    
    const serverPattern = /<a[^>]+class="[^"]*btn([^"]*)"[^>]+href="#(options-\d+)"[^>]*>[\s\S]*?<span>(\d+)<\/span>[\s\S]*?<span[^>]*class="[^"]*server[^"]*"[^>]*>(.*?)<\/span>/g;
    const serverMatches = [...content.matchAll(serverPattern)];
    
    const langServers = [];
    serverMatches.forEach(s => {
      langServers.push({
        serverNumber: s[3].trim(),
        serverName: s[4].replace(/-Hindi-Eng-Jap|-Hindi-Eng/g, '').trim(),
        targetId: s[2],
        active: s[1].includes('on')
      });
    });
    
    servers.push({
      languageId,
      active: isActive,
      servers: langServers
    });
  });

  const iframePattern = /<div[^>]+id="(options-\d+)"[^>]*class="[^"]*video[^"]*([^"]*)"[^>]*>[\s\S]*?<iframe[^>]+(?:src|data-src)="([^"]+)"/g;
  const iframeMatches = [...html.matchAll(iframePattern)];
  
  iframeMatches.forEach(iframe => {
    iframes.push({
      optionId: iframe[1],
      active: iframe[2].includes('on'),
      originalSrc: iframe[3],
      src: `${apiUrl}/api/embed?url=${encodeURIComponent(iframe[3])}`
    });
  });

  return { languages, servers, iframes };
}

function scrapeComments(html) {
  const comments = [];
  const commentPattern = /<li[^>]+id="(comment-\d+)"[^>]*>[\s\S]*?<article[^>]*>([\s\S]*?)<\/article>/g;
  const matches = [...html.matchAll(commentPattern)];
  
  for (const match of matches) {
    const commentId = match[1];
    const content = match[2];
    
    const authorMatch = content.match(/<b[^>]*class="[^"]*fn[^"]*"[^>]*>(.*?)<\/b>/);
    const avatarMatch = content.match(/<img[^>]+src='([^']+)'/);
    const dateMatch = content.match(/<time[^>]+datetime="([^"]+)"[^>]*>(.*?)<\/time>/);
    const commentMatch = content.match(/<div[^>]*class="[^"]*comment-content[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/);
    const urlMatch = content.match(/<a[^>]+href="([^"#]+#comment-\d+)"/);
    
    comments.push({
      id: commentId,
      author: authorMatch ? authorMatch[1].trim() : '',
      avatar: avatarMatch ? avatarMatch[1] : '',
      date: dateMatch ? dateMatch[1] : '',
      dateText: dateMatch ? dateMatch[2].trim() : '',
      content: commentMatch ? commentMatch[1].trim() : '',
      url: urlMatch ? urlMatch[1] : ''
    });
  }
  
  return comments;
}

function scrapeRelatedMovies(html) {
  const movies = [];
  const relatedPattern = /<section[^>]*class="[^"]*section episodes[^"]*"[^>]*>[\s\S]*?<h3[^>]*>Related movies<\/h3>[\s\S]*?<div[^>]*class="[^"]*owl-carousel[^"]*"[^>]*>([\s\S]*?)<\/div>/;
  const relatedMatch = html.match(relatedPattern);
  
  if (!relatedMatch) return movies;
  
  const articlePattern = /<article[^>]*class="[^"]*post dfx fcl movies[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  const articles = [...relatedMatch[1].matchAll(articlePattern)];
  
  for (const article of articles) {
    const content = article[1];
    
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/);
    const urlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    const ratingMatch = content.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/);
    
    movies.push({
      title: titleMatch ? titleMatch[1].replace(/&#038;/g, '&').trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      imageAlt: imageMatch ? imageMatch[2] : '',
      url: urlMatch ? urlMatch[1] : '',
      rating: ratingMatch ? ratingMatch[1] : ''
    });
  }
  
  return movies;
}

async function scrapeMoviePage(baseUrl, path, apiUrl) {
  const movieUrl = `${baseUrl}/movies/${path}/`;
  const html = await fetchWithProxy(movieUrl);
  
  const postId = extractPostId(html);
  const movieDetails = scrapeMovieDetails(html);
  const videoOptions = scrapeVideoOptions(html, apiUrl);
  const comments = scrapeComments(html);
  const relatedMovies = scrapeRelatedMovies(html);
  
  return {
    success: true,
    data: {
      baseUrl,
      movieUrl,
      moviePath: path,
      postId,
      scrapedAt: new Date().toISOString(),
      movieDetails,
      videoOptions,
      comments,
      relatedMovies
    },
    stats: {
      hasMovieDetails: true,
      hasBackdrop: !!(movieDetails.backdrop.header || movieDetails.backdrop.footer),
      videoOptionsCount: videoOptions.iframes.length,
      commentsCount: comments.length,
      relatedMoviesCount: relatedMovies.length
    }
  };
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed. Use GET request.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    
    if (!path) {
      return new Response(
        JSON.stringify({ success: false, error: 'Movie path parameter "path" is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Base URL not found.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const apiUrl = `${url.protocol}//${url.host}`;
    const result = await scrapeMoviePage(baseUrl, path, apiUrl);
    
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
    
  } catch (error) {
    console.error('Handler error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error', message: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
