// api/movies_page.js
export const config = {
  runtime: 'edge',
};

const BASE_URL = 'https://toonstream.one';

/**
 * Extract clean ID from URL
 */
function extractIdFromUrl(url) {
  if (!url) return '';
  const match = url.match(/\/(movies|series)\/([^/]+)\/?$/);
  return match ? match[2] : '';
}

/**
 * Extract and clean image URL
 */
function extractImageUrl(imgSrc) {
  if (!imgSrc) return null;
  if (imgSrc.startsWith('//')) {
    return 'https:' + imgSrc;
  }
  return imgSrc;
}

/**
 * Parse HTML using basic string manipulation (Edge runtime compatible)
 */
function parseMovies(html) {
  const results = [];
  
  // Find all movie list items
  const movieListRegex = /<li[^>]*class="[^"]*post-\d+[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let match;
  
  while ((match = movieListRegex.exec(html)) !== null) {
    const itemHtml = match[1];
    
    // Extract URL
    const urlMatch = itemHtml.match(/href="([^"]+)"/);
    const url = urlMatch ? urlMatch[1] : '';
    
    // Extract title
    const titleMatch = itemHtml.match(/<h3[^>]*class="entry-title"[^>]*>([^<]+)<\/h3>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    
    // Extract image
    const imgMatch = itemHtml.match(/<img[^>]+src="([^"]+)"/);
    const poster = imgMatch ? extractImageUrl(imgMatch[1]) : null;
    
    // Extract ID from URL
    const id = extractIdFromUrl(url);
    
    if (id && title && url) {
      results.push({
        id,
        title,
        url,
        poster
      });
    }
  }
  
  return results;
}

/**
 * Parse pagination information
 */
function parsePagination(html) {
  const pagination = {
    currentPage: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false
  };
  
  // Find current page
  const currentMatch = html.match(/<a[^>]*class="[^"]*current[^"]*"[^>]*>(\d+)<\/a>/);
  if (currentMatch) {
    pagination.currentPage = parseInt(currentMatch[1]) || 1;
  }
  
  // Check for NEXT link
  if (html.includes('>NEXT<')) {
    pagination.hasNextPage = true;
  }
  
  // Check for PREV link
  if (html.includes('>PREV<') || html.includes('>PREVIOUS<')) {
    pagination.hasPrevPage = true;
  }
  
  // Find all page numbers
  const pageRegex = /<a[^>]*class="page-numbers"[^>]*>(\d+)<\/a>/g;
  let pageMatch;
  while ((pageMatch = pageRegex.exec(html)) !== null) {
    const pageNum = parseInt(pageMatch[1]);
    if (pageNum > pagination.totalPages) {
      pagination.totalPages = pageNum;
    }
  }
  
  return pagination;
}

/**
 * Main scraper function
 */
async function scrapeMoviesPage(pageNumber = 1) {
  try {
    // Construct URL
    const moviesUrl = pageNumber === 1 
      ? `${BASE_URL}/movies/` 
      : `${BASE_URL}/movies/page/${pageNumber}/`;

    console.log(`Scraping: ${moviesUrl}`);

    // Fetch page
    const response = await fetch(moviesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Get HTML content
    const html = await response.text();
    
    // Parse data
    const results = parseMovies(html);
    const pagination = parsePagination(html);

    // Return clean response
    return {
      success: true,
      category: 'anime-movies',
      categoryName: 'Anime Movies',
      results,
      pagination
    };

  } catch (error) {
    console.error('Scraping error:', error.message);
    
    // Return error response
    return {
      success: false,
      error: error.message,
      category: 'anime-movies',
      categoryName: 'Anime Movies',
      results: [],
      pagination: {
        currentPage: pageNumber,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }
}

/**
 * Edge Function Handler
 */
export default async function handler(req) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Method not allowed. Use GET request.'
      }),
      { status: 405, headers }
    );
  }

  try {
    // Get page number from query
    const url = new URL(req.url);
    const pageNumber = parseInt(url.searchParams.get('page')) || 1;

    // Validate page number
    if (pageNumber < 1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid page number. Must be 1 or greater.'
        }),
        { status: 400, headers }
      );
    }

    // Scrape and return data
    const result = await scrapeMoviesPage(pageNumber);
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500,
        headers
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
      { status: 500, headers }
    );
  }
}
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }),
      { status: 200 }
    );
  }
}
