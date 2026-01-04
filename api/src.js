// api/scrape.js

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get URL from query parameter
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      ok: false,
      url: null,
      error: 'URL parameter is required'
    });
  }

  try {
    // Validate URL
    let targetUrl;
    try {
      targetUrl = new URL(url);
    } catch (e) {
      return res.status(400).json({
        ok: false,
        url: null,
        error: 'Invalid URL format'
      });
    }

    // Fetch the page
    const response = await fetch(targetUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Referer': targetUrl.origin
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        url: null,
        error: `HTTP error ${response.status}`
      });
    }

    // Get HTML content
    const html = await response.text();

    // Extract iframe src - improved regex to handle multiple formats
    // This will match various iframe formats including:
    // <iframe src="...">
    // <iframe width="560" height="315" src="...">
    const iframePatterns = [
      /<iframe[^>]+src=["']([^"']+)["'][^>]*>/gi,
      /<iframe[^>]*src=["']([^"']+)["']/gi,
      /src=["']([^"']+)["'][^>]*>/gi
    ];

    let extractedUrl = null;

    // Try each pattern
    for (const pattern of iframePatterns) {
      const match = html.match(pattern);
      if (match) {
        // Extract the URL from the matched string
        const srcMatch = match[0].match(/src=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
          extractedUrl = srcMatch[1];
          break;
        }
      }
    }

    // Alternative method: find all iframes in the body
    if (!extractedUrl) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        const bodyContent = bodyMatch[1];
        const iframeMatch = bodyContent.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch && iframeMatch[1]) {
          extractedUrl = iframeMatch[1];
        }
      }
    }

    if (extractedUrl) {
      // Clean up the URL (remove any whitespace)
      extractedUrl = extractedUrl.trim();
      
      return res.status(200).json({
        ok: true,
        url: extractedUrl
      });
    } else {
      return res.status(200).json({
        ok: false,
        url: null,
        error: 'No iframe found in HTML'
      });
    }

  } catch (error) {
    console.error('Scraping error:', error);
    return res.status(500).json({
      ok: false,
      url: null,
      error: error.message || 'Failed to scrape'
    });
  }
}
