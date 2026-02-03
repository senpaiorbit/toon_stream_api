export const config = {
  runtime: 'edge',
};

const FALLBACK_BASE_URL = 'https://toonstream.one';

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';
  const extract = searchParams.get('extract') || 'home';

  try {
    // Fetch base URL with fallback
    let baseUrl = FALLBACK_BASE_URL;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const baseUrlResponse = await fetch(
        'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt',
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);
      
      if (baseUrlResponse.ok) {
        const fetchedUrl = (await baseUrlResponse.text()).trim();
        if (fetchedUrl && fetchedUrl.startsWith('http')) {
          baseUrl = fetchedUrl;
        }
      }
    } catch (error) {
      // Use fallback URL
    }

    const targetUrl = `${baseUrl}${path}`;

    // Fetch the target page
    const pageResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': baseUrl,
        'Cache-Control': 'no-cache',
      },
    });

    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch: ${pageResponse.status} ${pageResponse.statusText}`,
          url: targetUrl,
        }, null, 2),
        {
          status: pageResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const html = await pageResponse.text();

    // Extract data based on type
    let data;
    switch (extract) {
      case 'home':
        data = extractHomeData(html, baseUrl);
        break;
      case 'suggestions':
        data = extractSuggestions(html, baseUrl);
        break;
      case 'anime':
        data = extractAnimeDetails(html, baseUrl, path);
        break;
      case 'episode':
        data = extractEpisodeData(html, baseUrl, path);
        break;
      case 'search':
        data = extractSearchResults(html, baseUrl);
        break;
      default:
        data = extractHomeData(html, baseUrl);
    }

    data.success = true;
    data.baseUrl = baseUrl;
    data.timestamp = new Date().toISOString();

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }, null, 2),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}

function extractHomeData(html, baseUrl) {
  const data = {
    page: 'home',
    suggestions: [],
    trending: [],
    recent: [],
  };

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    data.siteTitle = titleMatch[1].trim();
  }

  // Extract suggestions from the page
  data.suggestions = extractSuggestions(html, baseUrl).suggestions;

  // Extract trending/popular anime
  const trendingPatterns = [
    /<div[^>]*class="[^"]*trending[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*popular[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section[^>]*class="[^"]*featured[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
  ];

  trendingPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const items = extractAnimeItems(match[1]);
      data.trending.push(...items);
    }
  });

  // Extract recent anime
  const recentPatterns = [
    /<div[^>]*class="[^"]*recent[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*latest[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];

  recentPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const items = extractAnimeItems(match[1]);
      data.recent.push(...items);
    }
  });

  // Remove duplicates
  data.trending = removeDuplicates(data.trending);
  data.recent = removeDuplicates(data.recent);

  return data;
}

function extractSuggestions(html, baseUrl) {
  const data = {
    page: 'suggestions',
    suggestions: [],
  };

  // Pattern 1: Look for "Suggestion:" text block
  const suggestionBlockMatch = html.match(/Suggestion[:\s]*([\s\S]*?)(?:<\/div>|<div|$)/i);
  
  if (suggestionBlockMatch) {
    const block = suggestionBlockMatch[1];
    
    // Extract anime titles from the block
    const titleMatches = block.match(/([A-Za-z0-9\s\-:'()]+(?:Season\s+\d+)?),?/g);
    
    if (titleMatches) {
      titleMatches.forEach(title => {
        const cleanTitle = title.replace(/,$/, '').trim();
        if (cleanTitle.length > 3 && !cleanTitle.match(/^(div|span|class|style)$/i)) {
          data.suggestions.push({
            title: cleanTitle,
            type: 'suggestion',
          });
        }
      });
    }
  }

  // Pattern 2: Look for suggestion data attributes or classes
  const suggestionRegex = /<(?:div|li|a)[^>]*class="[^"]*suggestion[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li|a)>/gi;
  let match;

  while ((match = suggestionRegex.exec(html)) !== null) {
    const itemHtml = match[1];
    const titleMatch = itemHtml.match(/>([^<]+)</);
    
    if (titleMatch) {
      const title = titleMatch[1].trim();
      if (title.length > 3) {
        data.suggestions.push({
          title: title,
          type: 'suggestion',
        });
      }
    }
  }

  // Remove duplicates
  data.suggestions = removeDuplicates(data.suggestions);

  return data;
}

function extractAnimeDetails(html, baseUrl, path) {
  const data = {
    page: 'anime',
    title: '',
    description: '',
    genres: [],
    status: '',
    releaseYear: '',
    rating: '',
    image: '',
    episodes: [],
    alternativeTitles: [],
  };

  // Extract title
  const titlePatterns = [
    /<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
    /<div[^>]*class="[^"]*anime-title[^"]*"[^>]*>([^<]+)</i,
    /<title>([^<|]+)/i,
  ];

  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match) {
      data.title = match[1].trim();
      break;
    }
  }

  // Extract description
  const descPatterns = [
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)</i,
    /<p[^>]*class="[^"]*synopsis[^"]*"[^>]*>([^<]+)</i,
    /<meta\s+name="description"\s+content="([^"]+)"/i,
  ];

  for (const pattern of descPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.description = match[1].trim();
      break;
    }
  }

  // Extract genres
  const genreRegex = /<(?:a|span)[^>]*class="[^"]*genre[^"]*"[^>]*>([^<]+)</gi;
  let match;
  while ((match = genreRegex.exec(html)) !== null) {
    data.genres.push(match[1].trim());
  }

  // Extract status
  const statusMatch = html.match(/status["\s:]*(?:ongoing|completed|upcoming)/i);
  if (statusMatch) {
    data.status = statusMatch[0].match(/(ongoing|completed|upcoming)/i)[1];
  }

  // Extract release year
  const yearMatch = html.match(/(?:year|released?)["\s:]*(\d{4})/i);
  if (yearMatch) {
    data.releaseYear = yearMatch[1];
  }

  // Extract rating
  const ratingMatch = html.match(/rating["\s:]*(\d+\.?\d*)/i);
  if (ratingMatch) {
    data.rating = ratingMatch[1];
  }

  // Extract main image
  const imgMatch = html.match(/<img[^>]*class="[^"]*(?:poster|thumbnail|main-image)[^"]*"[^>]*src="([^"]+)"/i);
  if (imgMatch) {
    data.image = imgMatch[1];
  }

  // Extract episodes
  data.episodes = extractEpisodeList(html);

  return data;
}

function extractEpisodeData(html, baseUrl, path) {
  const data = {
    page: 'episode',
    title: '',
    episodeNumber: '',
    videoSources: [],
    nextEpisode: '',
    previousEpisode: '',
    relatedEpisodes: [],
  };

  // Extract episode title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)</i) || html.match(/<title>([^<|]+)/i);
  if (titleMatch) {
    data.title = titleMatch[1].trim();
  }

  // Extract episode number
  const epNumberMatch = data.title.match(/episode[^\d]*(\d+)/i) || 
                       html.match(/episode[^\d]*(\d+)/i) ||
                       path.match(/episode[^\d]*(\d+)/i);
  if (epNumberMatch) {
    data.episodeNumber = epNumberMatch[1];
  }

  // Extract video sources
  const iframeRegex = /<iframe[^>]*src="([^"]+)"/gi;
  let match;
  while ((match = iframeRegex.exec(html)) !== null) {
    data.videoSources.push({
      type: 'iframe',
      url: match[1],
      quality: 'default',
    });
  }

  const videoRegex = /<(?:video|source)[^>]*src="([^"]+)"[^>]*(?:data-quality="([^"]*)")?/gi;
  while ((match = videoRegex.exec(html)) !== null) {
    data.videoSources.push({
      type: 'video',
      url: match[1],
      quality: match[2] || 'default',
    });
  }

  // Extract next/previous episode links
  const nextMatch = html.match(/<a[^>]*class="[^"]*(?:next|forward)[^"]*"[^>]*href="([^"]+)"/i);
  if (nextMatch) {
    data.nextEpisode = nextMatch[1];
  }

  const prevMatch = html.match(/<a[^>]*class="[^"]*(?:prev|previous|back)[^"]*"[^>]*href="([^"]+)"/i);
  if (prevMatch) {
    data.previousEpisode = prevMatch[1];
  }

  // Extract related episodes
  data.relatedEpisodes = extractEpisodeList(html);

  return data;
}

function extractSearchResults(html, baseUrl) {
  const data = {
    page: 'search',
    results: [],
  };

  // Extract search results
  const items = extractAnimeItems(html);
  
  data.results = items.map(item => ({
    title: item.title,
    description: item.description || '',
    image: item.image,
    url: item.url,
    type: item.type || 'anime',
  }));

  return data;
}

// Helper function to extract anime items from HTML
function extractAnimeItems(html) {
  const items = [];
  
  const patterns = [
    /<(?:div|article|li)[^>]*class="[^"]*(?:anime-item|item|card)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article|li)>/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const itemHtml = match[1];
      
      // Extract title
      const titleMatch = itemHtml.match(/<(?:h\d|a|div)[^>]*(?:class="[^"]*title[^"]*"|title="([^"]+)")[^>]*>([^<]+)</i);
      const title = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : null;
      
      // Extract image
      const imgMatch = itemHtml.match(/src="([^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/i);
      
      // Extract link
      const linkMatch = itemHtml.match(/href="([^"]+)"/i);
      
      // Extract description (if available)
      const descMatch = itemHtml.match(/<p[^>]*class="[^"]*(?:desc|synopsis)[^"]*"[^>]*>([^<]+)</i);
      
      if (title || linkMatch) {
        items.push({
          title: title,
          description: descMatch ? descMatch[1].trim() : '',
          image: imgMatch ? imgMatch[1] : null,
          url: linkMatch ? linkMatch[1] : null,
        });
      }
    }
  });

  return items;
}

// Helper function to extract episode list
function extractEpisodeList(html) {
  const episodes = [];
  
  const episodeRegex = /<(?:a|div|li)[^>]*(?:class="[^"]*episode[^"]*"|data-episode)[^>]*>([\s\S]*?)<\/(?:a|div|li)>/gi;
  let match;

  while ((match = episodeRegex.exec(html)) !== null) {
    const episodeHtml = match[0];
    
    const numberMatch = episodeHtml.match(/episode[^\d]*(\d+)/i) || 
                       episodeHtml.match(/ep[^\d]*(\d+)/i);
    const linkMatch = episodeHtml.match(/href="([^"]+)"/i);
    const titleMatch = episodeHtml.match(/>([^<]+)</);
    
    if (numberMatch || linkMatch) {
      episodes.push({
        number: numberMatch ? parseInt(numberMatch[1]) : null,
        title: titleMatch ? titleMatch[1].trim() : null,
        url: linkMatch ? linkMatch[1] : null,
      });
    }
  }

  return removeDuplicates(episodes);
}

// Helper function to remove duplicates
function removeDuplicates(array) {
  const seen = new Set();
  return array.filter(item => {
    const key = item.url || item.title || JSON.stringify(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
