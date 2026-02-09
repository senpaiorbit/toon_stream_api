// api/search.js
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
    const response = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt'
    );
    
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
    const response = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt'
    );
    
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
      const proxyResponse = await fetch(proxyFetchUrl, {
        signal: AbortSignal.timeout(30000)
      });
      
      if (proxyResponse.ok) {
        return await proxyResponse.text();
      }
    } catch (proxyError) {
      console.log('Proxy fetch failed:', proxyError.message);
    }
  }
  
  const directResponse = await fetch(targetUrl, {
    signal: AbortSignal.timeout(30000)
  });
  
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

function extractCategories(classList) {
  const categories = [];
  const categoryMatches = [...(classList.matchAll(/category-([\w-]+)/g))];
  categoryMatches.forEach(match => categories.push(match[1]));
  return categories;
}

function extractTags(classList) {
  const tags = [];
  const tagMatches = [...(classList.matchAll(/tag-([\w-]+)/g))];
  tagMatches.forEach(match => tags.push(match[1]));
  return tags;
}

function extractCast(classList) {
  const cast = [];
  const castMatches = [...(classList.matchAll(/cast(?:_tv)?-([\w-]+)/g))];
  castMatches.forEach(match => cast.push(match[1].replace(/-/g, ' ')));
  return cast.slice(0, 10);
}

function extractDirectors(classList) {
  const directors = [];
  const directorMatches = [...(classList.matchAll(/directors?(?:-tv)?-([\w-]+)/g))];
  directorMatches.forEach(match => directors.push(match[1].replace(/-/g, ' ')));
  return directors;
}

function extractCountries(classList) {
  const countries = [];
  const countryMatches = [...(classList.matchAll(/country-([\w-]+)/g))];
  countryMatches.forEach(match => countries.push(match[1].replace(/-/g, ' ')));
  return countries;
}

function scrapeSearchResults(html) {
  const results = [];
  const resultsPattern = /<div[^>]*id="movies-a"[^>]*class="[^"]*aa-tb[^"]*"[^>]*>[\s\S]*?<ul[^>]*class="post-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/;
  const resultsMatch = html.match(resultsPattern);
  
  if (!resultsMatch) return results;
  
  const section = resultsMatch[1];
  const liPattern = /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>\s*<article[^>]*>([\s\S]*?)<\/article>\s*<\/li>/g;
  const items = [...section.matchAll(liPattern)];
  
  for (const item of items) {
    const postId = item[1];
    const classList = item[2];
    const itemContent = item[3];
    
    const titleMatch = itemContent.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/);
    const urlMatch = itemContent.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/);
    const imageMatch = itemContent.match(/<img[^>]+src="([^"]+)"/);
    const imageAltMatch = itemContent.match(/<img[^>]+alt="([^"]+)"/);
    const ratingMatch = itemContent.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/);
    
    const contentType = classList.includes('type-series') ? 'series' : 
                       classList.includes('type-movies') ? 'movie' : 'unknown';
    
    results.push({
      id: `post-${postId}`,
      title: titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '',
      image: normalizeImage(imageMatch ? imageMatch[1] : null),
      url: urlMatch ? urlMatch[1] : '',
      rating: ratingMatch ? ratingMatch[1].trim() : null,
      contentType: contentType,
      imageAlt: imageAltMatch ? imageAltMatch[1] : '',
      categories: extractCategories(classList),
      tags: extractTags(classList),
      cast: extractCast(classList),
      directors: extractDirectors(classList),
      countries: extractCountries(classList)
    });
  }
  
  return results;
}

function extractPagination(html) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
    nextPageUrl: null,
    prevPageUrl: null
  };
  
  const paginationPattern = /<nav[^>]*class="[^"]*navigation pagination[^"]*"[^>]*>([\s\S]*?)<\/nav>/;
  const paginationMatch = html.match(paginationPattern);
  
  if (!paginationMatch) return pagination;
  
  const paginationContent = paginationMatch[1];
  
  const currentMatch = paginationContent.match(/<a[^>]*class="[^"]*page-link current[^"]*"[^>]*>(\d+)<\/a>/);
  if (currentMatch) {
    pagination.currentPage = parseInt(currentMatch[1]);
  }
  
  const allPagesPattern = /<a[^>]*class="[^"]*page-link[^"]*"[^>]*>(\d+)<\/a>/g;
  const allPages = [...paginationContent.matchAll(allPagesPattern)];
  if (allPages.length > 0) {
    const pageNumbers = allPages.map(m => parseInt(m[1]));
    pagination.totalPages = Math.max(...pageNumbers);
  }
  
  const nextMatch = paginationContent.match(/<a[^>]+href="([^"]+)"[^>]*>NEXT<\/a>/);
  if (nextMatch) {
    pagination.hasNextPage = true;
    pagination.nextPageUrl = nextMatch[1];
  }
  
  pagination.hasPrevPage = pagination.currentPage > 1;
  
  return pagination;
}

async function searchContent(baseUrl, query, page = 1) {
  const searchUrl = page > 1 
    ? `${baseUrl}/home/page/${page}/?s=${encodeURIComponent(query)}`
    : `${baseUrl}/home/?s=${encodeURIComponent(query)}`;
  
  const html = await fetchWithProxy(searchUrl);
  const results = scrapeSearchResults(html);
  const pagination = extractPagination(html);
  
  const seriesCount = results.filter(r => r.contentType === 'series').length;
  const moviesCount = results.filter(r => r.contentType === 'movie').length;
  
  return {
    success: true,
    data: {
      searchQuery: query,
      currentPage: pagination.currentPage,
      totalPages: pagination.totalPages,
      hasResults: results.length > 0,
      results: results,
      pagination: {
        hasNextPage: pagination.hasNextPage,
        hasPrevPage: pagination.hasPrevPage,
        nextPageUrl: pagination.nextPageUrl,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages
      }
    },
    stats: {
      resultsCount: results.length,
      seriesCount: seriesCount,
      moviesCount: moviesCount
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
      { 
        status: 405, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
  
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const page = parseInt(url.searchParams.get('page') || '1');
    
    if (!query) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Search query parameter "q" is required.' 
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
    
    const result = await searchContent(baseUrl, query, page);
    
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
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}
