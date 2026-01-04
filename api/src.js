const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  // Get URL from query parameter
  const { url } = req.query;

  // Validate URL parameter
  if (!url) {
    return res.status(400).json({
      ok: false,
      error: 'Missing url parameter'
    });
  }

  try {
    // Fetch the page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    // Load HTML into cheerio
    const $ = cheerio.load(response.data);

    // Find iframe src
    const iframeSrc = $('iframe').attr('src');

    if (iframeSrc) {
      return res.status(200).json({
        ok: true,
        url: iframeSrc
      });
    } else {
      return res.status(404).json({
        ok: false,
        error: 'No iframe found on the page'
      });
    }

  } catch (error) {
    console.error('Scraping error:', error.message);
    
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to scrape the page'
    });
  }
};
