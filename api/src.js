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
        'Cache-Control': 'no-cache'
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

    // Extract iframe src using regex (no dependencies)
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/i;
    const match = html.match(iframeRegex);

    if (match && match[1]) {
      return res.status(200).json({
        ok: true,
        url: match[1]
      });
    } else {
      return res.status(200).json({
        ok: false,
        url: null,
        error: 'No iframe found'
      });
    }

  } catch (error) {
    return res.status(500).json({
      ok: false,
      url: null,
      error: error.message || 'Failed to scrape'
    });
  }
}
