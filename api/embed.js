export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Set CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get URL from query parameter
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing url parameter',
          usage: '?url={full_url}' 
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Validate URL
    let validUrl;
    try {
      validUrl = new URL(targetUrl);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL provided' }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Fetch the target page
    const response = await fetch(validUrl.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch page: ${response.status} ${response.statusText}` 
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const html = await response.text();

    // Extract iframe src using regex
    const iframeRegex = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/i;
    const match = html.match(iframeRegex);

    if (!match || !match[1]) {
      return new Response(
        JSON.stringify({ 
          error: 'No iframe found in the page',
          html: html.substring(0, 500) // Return first 500 chars for debugging
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const iframeSrc = match[1];

    // Return the iframe source
    return new Response(
      JSON.stringify({
        success: true,
        iframe_src: iframeSrc,
        original_url: targetUrl,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
