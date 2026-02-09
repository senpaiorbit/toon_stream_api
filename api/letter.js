// /api/letter.js

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

function scrapeAlphabetNav(html) {
  const letters = [];
  const navPattern = /<ul[^>]*class="[^"]*az-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const navMatch = html.match(navPattern);
  
  if (!navMatch) return letters;
  
  const linkPattern = /<a[^>]*class="[^"]*btn([^"]*)"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
  const matches = [...navMatch[1].matchAll(linkPattern)];
  
  for (const match of matches) {
    letters.push({
      letter: match[3].trim(),
      url: match[2],
      active: match[1].includes('on')
    });
  }
  
  return letters;
}

function scrapeContent(html) {
  const results = [];
  const contentPattern = /<div[^>]*id="movies-a"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const contentMatch = html.match(contentPattern);
  
  if (!contentMatch) return results;
  
  const liPattern = /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...contentMatch[1].matchAll(liPattern)];
  
  for (const item of items) {
    const postId = item[1];
    const classList = item[2];
    const content = item[3];
    
    const titleMatch = content.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/);
    const ratingMatch = content.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/);
    const urlMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    
    const contentType = classList.includes('type-series') ? 'series' : 
                       classList.includes('type-movies') ? 'movie' : 'unknown';
    
    const categories = [];
    const categoryMatches = [...classList.matchAll(/category-([\w-]+)/g)];
    categoryMatches.forEach(m => categories.push(m[1]));
    
    const tags = [];
    const tagMatches = [...classList.matchAll(/tag-([\w-]+)/g)];
    tagMatches.forEach(m => tags.push(m[1]));
    
    const cast = [];
    const castMatches = [...classList.matchAll(/cast(?:_tv)?-([\w-]+)/g)];
    castMatches.forEach(m => cast.push(m[1].replace(/-/g, ' ')));
    
    const directors = [];
    const directorMatches = [...classList.matchAll(/directors?(?:_tv)?-([\w-]+)/g)];
    directorMatches.forEach(m => directors.push(m[1].replace(/-/g, ' ')));
    
    results.push({
      id: `post-${postId}`,
      title: titleMatch ? titleMatch[1].trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      imageAlt: imageMatch ? imageMatch[2] : '',
      rating: ratingMatch ? ratingMatch[1] : null,
      url: urlMatch ? urlMatch[1] : '',
      contentType: contentType,
      categories: categories,
      tags: tags,
      cast: cast.slice(0, 10),
      directors: directors
    });
  }
  
  return results;
}

function scrapePagination(html) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
    nextPageUrl: null,
    prevPageUrl: null,
    pages: []
  };
  
  const paginationPattern = /<nav[^>]*class="[^"]*navigation pagination[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*nav-links[^"]*"[^>]*>([\s\S]*?)<\/div>/;
  const paginationMatch = html.match(paginationPattern);
  
  if (!paginationMatch) return pagination;
  
  const content = paginationMatch[1];
  
  const currentMatch = content.match(/<a[^>]*class="[^"]*page-link current[^"]*"[^>]*href="([^"]+)"[^>]*>(\d+)<\/a>/);
  if (currentMatch) {
    pagination.currentPage = parseInt(currentMatch[2]);
  }
  
  const prevMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*>PREV<\/a>/);
  if (prevMatch) {
    pagination.hasPrevPage = true;
    pagination.prevPageUrl = prevMatch[1];
  }
  
  const nextMatch = content.match(/<a[^>]+href="([^"]+)"[^>]*>NEXT<\/a>/);
  if (nextMatch) {
    pagination.hasNextPage = true;
    pagination.nextPageUrl = nextMatch[1];
  }
  
  const pagePattern = /<a[^>]*class="[^"]*page-link[^"]*"[^>]*href="([^"]+)"[^>]*>(\d+)<\/a>/g;
  const pageMatches = [...content.matchAll(pagePattern)];
  
  pageMatches.forEach(match => {
    const pageNum = parseInt(match[2]);
    if (!pagination.pages.find(p => p.page === pageNum)) {
      pagination.pages.push({
        page: pageNum,
        url: match[1],
        current: match[0].includes('current')
      });
    }
  });
  
  if (pagination.pages.length > 0) {
    pagination.totalPages = Math.max(...pagination.pages.map(p => p.page));
  }
  
  return pagination;
}

async function scrapeLetterPage(baseUrl, letter, page = 1) {
  const letterUrl = page > 1 
    ? `${baseUrl}/home/letter/${letter}/page/${page}/`
    : `${baseUrl}/home/letter/${letter}/`;
  
  const html = await fetchWithProxy(letterUrl);
  
  const alphabetNav = scrapeAlphabetNav(html);
  const results = scrapeContent(html);
  const pagination = scrapePagination(html);
  
  const seriesCount = results.filter(r => r.contentType === 'series').length;
  const moviesCount = results.filter(r => r.contentType === 'movie').length;
  
  return {
    success: true,
    data: {
      baseUrl: baseUrl,
      letter: letter.toUpperCase(),
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      alphabetNav: alphabetNav,
      results: results,
      pagination: {
        hasNextPage: pagination.hasNextPage,
        hasPrevPage: pagination.hasPrevPage,
        nextPageUrl: pagination.nextPageUrl,
        prevPageUrl: pagination.prevPageUrl,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        pages: pagination.pages
      }
    },
    stats: {
      resultsCount: results.length,
      seriesCount: seriesCount,
      moviesCount: moviesCount,
      alphabetNavCount: alphabetNav.length
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
    const letter = url.searchParams.get('letter');
    const page = parseInt(url.searchParams.get('page') || '1');
    
    if (!letter) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Letter parameter "letter" is required (e.g., ?letter=a or ?letter=0-9 for #).' 
        }),
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
    
    const result = await scrapeLetterPage(baseUrl, letter, page);
    
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
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error', 
        message: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

