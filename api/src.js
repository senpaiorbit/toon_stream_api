// api/embed.js
const axios = require('axios');
const cheerio = require('cheerio');

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
async function scrapeEmbedUrl(url) {
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
        'Referer': url
      },
      timeout: 15000,
      maxRedirects: 5
    });
    
    // Extract iframe URL from HTML
    const iframeUrl = extractIframeUrl(response.data);
    
    if (!iframeUrl) {
      return {
        ok: false,
        error: 'No iframe found in the page',
        url: null
      };
    }
    
    // Return success response
    return {
      ok: true,
      url: iframeUrl
    };
    
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
        error: 'Request timeout',
        url: null
      };
    } else if (error.code === 'ENOTFOUND') {
      return {
        ok: false,
        error: 'URL not found',
        url: null
      };
    } else {
      return {
        ok: false,
        error: error.message,
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
    
    if (!embedUrl) {
      return res.status(400).json({
        ok: false,
        error: 'URL parameter is required. Use ?url=https://example.com',
        url: null
      });
    }
    
    // Scrape the embed URL
    const result = await scrapeEmbedUrl(embedUrl);
    
    // Return JSON response
    const statusCode = result.ok ? 200 : 400;
    res.status(statusCode).json(result);
    
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Internal server error',
      url: null
    });
  }
};
