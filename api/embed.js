// api/embed.js (Enhanced Version)
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extract all possible iframe sources from embed page
 */
function extractAllIframes(html) {
  try {
    const $ = cheerio.load(html);
    const iframes = [];
    
    $('iframe').each((index, element) => {
      const $iframe = $(element);
      const src = $iframe.attr('src') || $iframe.attr('data-src');
      
      if (src) {
        iframes.push({
          src: src,
          width: $iframe.attr('width') || null,
          height: $iframe.attr('height') || null,
          allowfullscreen: $iframe.attr('allowfullscreen') !== undefined,
          frameborder: $iframe.attr('frameborder') || '0'
        });
      }
    });
    
    return iframes;
  } catch (error) {
    console.error('Error extracting iframes:', error.message);
    return [];
  }
}

/**
 * Extract iframe URL from embed page
 */
function extractIframeUrl(html) {
  try {
    const $ = cheerio.load(html);
    
    // Try multiple selectors to find iframe
    let iframeSrc = null;
    
    // Method 1: Direct iframe in .Video div
    iframeSrc = $('.Video iframe').attr('src');
    
    // Method 2: Any iframe on page
    if (!iframeSrc) {
      iframeSrc = $('iframe').first().attr('src');
    }
    
    // Method 3: Check data-src attribute
    if (!iframeSrc) {
      iframeSrc = $('.Video iframe').attr('data-src');
    }
    
    // Method 4: Any data-src
    if (!iframeSrc) {
      iframeSrc = $('iframe').first().attr('data-src');
    }
    
    return iframeSrc;
  } catch (error) {
    console.error('Error extracting iframe:', error.message);
    return null;
  }
}

/**
 * Scrape embed page for iframe URL
 */
async function scrapeEmbedUrl(url, detailed = false) {
  try {
    console.log(`Scraping embed URL: ${url}`);
    
    // Validate URL
    if (!url || !url.startsWith('http')) {
      return {
        ok: false,
        error: 'Invalid URL provided',
        url: null
      };
    }
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Referer': url
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    });
    
    // Check if page loaded successfully
    if (response.status !== 200) {
      return {
        ok: false,
        error: `HTTP ${response.status}: Page not accessible`,
        url: null
      };
    }
    
    // Extract iframe URL from HTML
    const iframeUrl = extractIframeUrl(response.data);
    
    if (!iframeUrl) {
      return {
        ok: false,
        error: 'No iframe found in the page',
        url: null
      };
    }
    
    // Basic response
    const result = {
      ok: true,
      url: iframeUrl
    };
    
    // Add detailed info if requested
    if (detailed) {
      const allIframes = extractAllIframes(response.data);
      result.details = {
        totalIframes: allIframes.length,
        allIframes: allIframes,
        scrapedAt: new Date().toISOString(),
        sourceUrl: url,
        statusCode: response.status
      };
    }
    
    return result;
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    
    // Handle specific error cases
    if (error.response) {
      return {
        ok: false,
        error: `HTTP ${error.response.status}: ${error.response.statusText}`,
        url: null
      };
    } else if (error.code === 'ECONNABORTED') {
      return {
        ok: false,
        error: 'Request timeout - server took too long to respond',
        url: null
      };
    } else if (error.code === 'ENOTFOUND') {
      return {
        ok: false,
        error: 'URL not found - domain does not exist',
        url: null
      };
    } else if (error.code === 'ECONNREFUSED') {
      return {
        ok: false,
        error: 'Connection refused - server is not accepting connections',
        url: null
      };
    } else {
      return {
        ok: false,
        error: error.message || 'Unknown error occurred',
        url: null
      };
    }
  }
}

/**
 * Vercel serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      ok: false, 
      error: 'Method not allowed. Use GET request.',
      url: null
    });
  }
  
  try {
    // Get URL from query parameter
    const embedUrl = req.query.url;
    const detailed = req.query.detailed === 'true' || req.query.detailed === '1';
    
    if (!embedUrl) {
      return res.status(400).json({
        ok: false,
        error: 'URL parameter is required. Use ?url=https://example.com',
        url: null,
        usage: {
          endpoint: '/embed',
          parameters: {
            url: 'required - The embed page URL to scrape',
            detailed: 'optional - Set to true for detailed response (default: false)'
          },
          examples: [
            '/embed?url=https://toonstream.one/home/?trembed=0&trid=3402&trtype=1',
            '/embed?url=https://example.com/embed&detailed=true'
          ]
        }
      });
    }
    
    // Scrape the embed URL
    const result = await scrapeEmbedUrl(embedUrl, detailed);
    
    // Return JSON response
    const statusCode = result.ok ? 200 : 400;
    res.status(statusCode).json(result);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Internal server error',
      url: null,
      message: error.message
    });
  }
};
