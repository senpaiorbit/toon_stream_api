export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');
    
    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL parameter is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch the page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch page' }),
        { 
          status: response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const html = await response.text();
    
    // Extract category from URL
    const urlParts = url.split('/').filter(part => part);
    const category = urlParts[urlParts.length - 1] || 'movies';
    const categoryName = category
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Parse movies/series
    const results = [];
    const itemRegex = /<li[^>]*class="[^"]*post-\d+[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
    let match;

    while ((match = itemRegex.exec(html)) !== null) {
      const itemHtml = match[1];
      
      // Extract title
      const titleMatch = itemHtml.match(/<h2[^>]*class="entry-title"[^>]*>([^<]+)<\/h2>/);
      const title = titleMatch ? titleMatch[1].trim() : '';
      
      // Extract URL
      const urlMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*class="lnk-blk"/);
      const itemUrl = urlMatch ? urlMatch[1] : '';
      
      // Extract poster
      const posterMatch = itemHtml.match(/<img[^>]*src="([^"]+)"/);
      let poster = posterMatch ? posterMatch[1] : '';
      if (poster.startsWith('//')) {
        poster = 'https:' + poster;
      }
      
      // Extract ID from URL
      const id = itemUrl.split('/').filter(part => part).pop() || '';
      
      if (title && itemUrl && id) {
        results.push({
          id,
          title,
          url: itemUrl,
          poster
        });
      }
    }

    // Extract pagination info
    const currentPageMatch = html.match(/<a[^>]*class="page-link current"[^>]*>(\d+)<\/a>/) || 
                            html.match(/href="[^"]*\/page\/(\d+)\/"[^>]*class="page-link current"/);
    const currentPage = currentPageMatch ? parseInt(currentPageMatch[1]) : 1;

    const lastPageMatch = html.match(/<a[^>]*class="page-link"[^>]*href="[^"]*\/page\/(\d+)\/"[^>]*>(\d+)<\/a>/g);
    let totalPages = 1;
    if (lastPageMatch) {
      const pages = lastPageMatch.map(link => {
        const pageNum = link.match(/>\s*(\d+)\s*</);
        return pageNum ? parseInt(pageNum[1]) : 0;
      });
      totalPages = Math.max(...pages, currentPage);
    }

    const hasNextPage = html.includes('>NEXT<');
    const hasPrevPage = currentPage > 1;

    // Return structured JSON
    return new Response(
      JSON.stringify({
        success: true,
        category,
        categoryName,
        results,
        pagination: {
          currentPage,
          totalPages,
          hasNextPage,
          hasPrevPage
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300'
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
