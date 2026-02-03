export const config = {
  runtime: 'edge',
};

// Fallback base URL if GitHub fetch fails
const FALLBACK_BASE_URL = 'https://toonstream.one';

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';
  const extract = searchParams.get('extract'); // anime, episode, search, etc.

  try {
    // Fetch base URL from GitHub with timeout and fallback
    let baseUrl = FALLBACK_BASE_URL;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const baseUrlResponse = await fetch(
        'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt',
        { 
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EdgeScraper/1.0)',
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (baseUrlResponse.ok) {
        const fetchedUrl = (await baseUrlResponse.text()).trim();
        if (fetchedUrl && fetchedUrl.startsWith('http')) {
          baseUrl = fetchedUrl;
        }
      }
    } catch (githubError) {
      console.error('GitHub fetch failed, using fallback URL:', githubError.message);
      // Continue with fallback URL
    }

    const targetUrl = `${baseUrl}${path}`;

    // Fetch the target page with better error handling
    const pageResponse = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': baseUrl,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    if (!pageResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch page: ${pageResponse.status} ${pageResponse.statusText}`,
          url: targetUrl,
          baseUrl: baseUrl,
          timestamp: new Date().toISOString(),
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

    // Extract data based on requested type
    let data;
    switch (extract) {
      case 'anime':
        data = extractAnimeList(html, baseUrl);
        break;
      case 'episode':
        data = extractEpisodeData(html, baseUrl);
        break;
      case 'search':
        data = extractSearchResults(html, baseUrl);
        break;
      case 'metadata':
        data = extractMetadata(html, baseUrl);
        break;
      case 'raw':
        // Return raw HTML
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        });
      default:
        data = parseHTML(html, baseUrl);
    }

    // Add success flag
    data.success = true;

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
        stack: error.stack,
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

function extractMetadata(html, baseUrl) {
  const data = {
    baseUrl,
    timestamp: new Date().toISOString(),
  };

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    data.title = titleMatch[1].trim();
  }

  // Extract all meta tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  const metas = {};
  let match;

  while ((match = metaRegex.exec(html)) !== null) {
    const nameMatch = match[1].match(/name=["']([^"']+)["']/);
    const propertyMatch = match[1].match(/property=["']([^"']+)["']/);
    const contentMatch = match[1].match(/content=["']([^"']+)["']/);

    if (contentMatch) {
      if (nameMatch) {
        metas[nameMatch[1]] = contentMatch[1];
      } else if (propertyMatch) {
        metas[propertyMatch[1]] = contentMatch[1];
      }
    }
  }

  data.metadata = metas;

  return data;
}

function extractAnimeList(html, baseUrl) {
  const animeList = [];
  
  // Multiple patterns to catch different HTML structures
  const patterns = [
    // Pattern 1: div with anime-item class
    /<div[^>]*class="[^"]*anime-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Pattern 2: div with item class containing links
    /<div[^>]*class="[^"]*item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Pattern 3: article tags
    /<article[^>]*>([\s\S]*?)<\/article>/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    const regex = new RegExp(pattern);
    
    while ((match = regex.exec(html)) !== null) {
      const itemHtml = match[1];
      
      // Extract title - try multiple patterns
      const titlePatterns = [
        /<(?:h\d|div|span|a)[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i,
        /<a[^>]*title=["']([^"']+)["']/i,
        /<img[^>]*alt=["']([^"']+)["']/i,
      ];
      
      let title = null;
      for (const titlePattern of titlePatterns) {
        const titleMatch = itemHtml.match(titlePattern);
        if (titleMatch) {
          title = titleMatch[1].trim();
          break;
        }
      }
      
      // Extract image
      const imgMatch = itemHtml.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
      
      // Extract link
      const linkMatch = itemHtml.match(/href=["']([^"']+)["']/);
      
      if (title || linkMatch) {
        const anime = {
          title: title,
          image: imgMatch ? imgMatch[1] : null,
          url: linkMatch ? linkMatch[1] : null,
        };
        
        // Avoid duplicates
        const isDuplicate = animeList.some(item => 
          item.url === anime.url || 
          (item.title && item.title === anime.title)
        );
        
        if (!isDuplicate && (anime.title || anime.url)) {
          animeList.push(anime);
        }
      }
    }
  });

  return {
    baseUrl,
    timestamp: new Date().toISOString(),
    count: animeList.length,
    anime: animeList,
  };
}

function extractEpisodeData(html, baseUrl) {
  const data = {
    baseUrl,
    timestamp: new Date().toISOString(),
    episodes: [],
    videoSources: [],
  };

  // Extract episode list - multiple patterns
  const episodePatterns = [
    /<(?:a|div|li)[^>]*class="[^"]*episode[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|li)>/gi,
    /<(?:a|div|li)[^>]*data-episode[^>]*>([\s\S]*?)<\/(?:a|div|li)>/gi,
  ];

  episodePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const episodeHtml = match[0];
      const numberMatch = episodeHtml.match(/episode[^\d]*(\d+)/i) || 
                         episodeHtml.match(/ep[^\d]*(\d+)/i) ||
                         episodeHtml.match(/data-episode=["'](\d+)["']/i);
      const linkMatch = episodeHtml.match(/href=["']([^"']+)["']/);
      
      if (numberMatch || linkMatch) {
        const episode = {
          number: numberMatch ? parseInt(numberMatch[1]) : null,
          url: linkMatch ? linkMatch[1] : null,
        };
        
        // Avoid duplicates
        const isDuplicate = data.episodes.some(ep => 
          ep.number === episode.number || ep.url === episode.url
        );
        
        if (!isDuplicate) {
          data.episodes.push(episode);
        }
      }
    }
  });

  // Extract video sources (iframe, video tags, etc.)
  const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = iframeRegex.exec(html)) !== null) {
    data.videoSources.push({
      type: 'iframe',
      url: match[1],
    });
  }

  const videoRegex = /<video[^>]*src=["']([^"']+)["'][^>]*>/gi;
  while ((match = videoRegex.exec(html)) !== null) {
    data.videoSources.push({
      type: 'video',
      url: match[1],
    });
  }

  // Extract from source tags inside video
  const sourceRegex = /<source[^>]*src=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceRegex.exec(html)) !== null) {
    data.videoSources.push({
      type: 'source',
      url: match[1],
    });
  }

  return data;
}

function extractSearchResults(html, baseUrl) {
  const results = [];
  
  // Multiple patterns for search results
  const patterns = [
    /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<li[^>]*class="[^"]*search[^"]*"[^>]*>([\s\S]*?)<\/li>/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const resultHtml = match[1];
      
      const titleMatch = resultHtml.match(/<(?:h\d|div|span|a)[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i) ||
                        resultHtml.match(/<a[^>]*title=["']([^"']+)["']/i);
      const imgMatch = resultHtml.match(/src=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
      const linkMatch = resultHtml.match(/href=["']([^"']+)["']/);
      
      if (titleMatch || linkMatch) {
        const result = {
          title: titleMatch ? titleMatch[1].trim() : null,
          image: imgMatch ? imgMatch[1] : null,
          url: linkMatch ? linkMatch[1] : null,
        };
        
        const isDuplicate = results.some(item => 
          item.url === result.url || 
          (item.title && item.title === result.title)
        );
        
        if (!isDuplicate && (result.title || result.url)) {
          results.push(result);
        }
      }
    }
  });

  return {
    baseUrl,
    timestamp: new Date().toISOString(),
    count: results.length,
    results,
  };
}

function parseHTML(html, baseUrl) {
  const data = {
    baseUrl,
    timestamp: new Date().toISOString(),
    metadata: {},
    content: {},
  };

  // Extract meta tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  const metas = [];
  let match;

  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = {};
    const attrRegex = /(\w+)=["']([^"']+)["']/g;
    let attrMatch;
    
    while ((attrMatch = attrRegex.exec(match[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    
    if (Object.keys(attrs).length > 0) {
      metas.push(attrs);
    }
  }

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    data.metadata.title = titleMatch[1];
  }

  // Extract meta description
  const descMeta = metas.find(m => m.name === 'description');
  if (descMeta) {
    data.metadata.description = descMeta.content;
  }

  // Extract meta keywords
  const keywordsMeta = metas.find(m => m.name === 'keywords');
  if (keywordsMeta) {
    data.metadata.keywords = keywordsMeta.content;
  }

  // Extract OG tags
  const ogTags = {};
  metas.forEach(meta => {
    if (meta.property && meta.property.startsWith('og:')) {
      const key = meta.property.replace('og:', '');
      ogTags[key] = meta.content;
    }
  });
  
  if (Object.keys(ogTags).length > 0) {
    data.metadata.openGraph = ogTags;
  }

  data.metadata.allMetas = metas;

  // Extract links
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  const links = [];
  while ((match = linkRegex.exec(html)) !== null) {
    if (match[1] && !match[1].startsWith('#')) {
      links.push({
        url: match[1],
        text: match[2].trim(),
      });
    }
  }
  
  if (links.length > 0) {
    data.content.links = links.slice(0, 100); // Increased limit
  }

  // Extract images
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  const images = [];
  while ((match = imgRegex.exec(html)) !== null) {
    images.push({
      src: match[1],
      alt: match[2] || '',
    });
  }
  
  if (images.length > 0) {
    data.content.images = images.slice(0, 50); // Increased limit
  }

  // Extract scripts
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
  const scripts = [];
  while ((match = scriptRegex.exec(html)) !== null) {
    scripts.push(match[1]);
  }
  if (scripts.length > 0) {
    data.content.scripts = scripts;
  }

  // Extract stylesheets
  const styleRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const stylesheets = [];
  while ((match = styleRegex.exec(html)) !== null) {
    stylesheets.push(match[1]);
  }
  if (stylesheets.length > 0) {
    data.content.stylesheets = stylesheets;
  }

  return data;
}
