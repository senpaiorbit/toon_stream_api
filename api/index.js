export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '';
  const extract = searchParams.get('extract'); // anime, episode, search, etc.

  try {
    // Fetch base URL from GitHub
    const baseUrlResponse = await fetch(
      'https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt'
    );
    
    if (!baseUrlResponse.ok) {
      throw new Error('Failed to fetch base URL');
    }

    const baseUrl = (await baseUrlResponse.text()).trim();
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
      throw new Error(`Failed to fetch page: ${pageResponse.status}`);
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
      default:
        data = parseHTML(html, baseUrl);
    }

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
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
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
  
  // Extract anime items (adjust regex based on actual HTML structure)
  // This is a generic example - adjust selectors based on actual page structure
  const animeRegex = /<div[^>]*class="[^"]*anime-item[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = animeRegex.exec(html)) !== null) {
    const itemHtml = match[1];
    
    // Extract title
    const titleMatch = itemHtml.match(/<(?:h\d|div)[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
    
    // Extract image
    const imgMatch = itemHtml.match(/src=["']([^"']+)["']/);
    
    // Extract link
    const linkMatch = itemHtml.match(/href=["']([^"']+)["']/);
    
    if (titleMatch || linkMatch) {
      animeList.push({
        title: titleMatch ? titleMatch[1].trim() : null,
        image: imgMatch ? imgMatch[1] : null,
        url: linkMatch ? linkMatch[1] : null,
      });
    }
  }

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

  // Extract episode list
  const episodeRegex = /<(?:a|div)[^>]*class="[^"]*episode[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;
  let match;

  while ((match = episodeRegex.exec(html)) !== null) {
    const episodeHtml = match[0];
    const numberMatch = episodeHtml.match(/episode[^\d]*(\d+)/i);
    const linkMatch = episodeHtml.match(/href=["']([^"']+)["']/);
    
    if (numberMatch || linkMatch) {
      data.episodes.push({
        number: numberMatch ? parseInt(numberMatch[1]) : null,
        url: linkMatch ? linkMatch[1] : null,
      });
    }
  }

  // Extract video sources (iframe, video tags, etc.)
  const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/gi;
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

  return data;
}

function extractSearchResults(html, baseUrl) {
  const results = [];
  
  // Extract search results (adjust based on actual structure)
  const resultRegex = /<div[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null) {
    const resultHtml = match[1];
    
    const titleMatch = resultHtml.match(/<(?:h\d|div)[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</i);
    const imgMatch = resultHtml.match(/src=["']([^"']+)["']/);
    const linkMatch = resultHtml.match(/href=["']([^"']+)["']/);
    
    if (titleMatch || linkMatch) {
      results.push({
        title: titleMatch ? titleMatch[1].trim() : null,
        image: imgMatch ? imgMatch[1] : null,
        url: linkMatch ? linkMatch[1] : null,
      });
    }
  }

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
    links.push({
      url: match[1],
      text: match[2].trim(),
    });
  }
  
  if (links.length > 0) {
    data.content.links = links.slice(0, 50); // Limit to first 50 links
  }

  // Extract images
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi;
  const images = [];
  while ((match = imgRegex.exec(html)) !== null) {
    images.push({
      src: match[1],
      alt: match[2],
    });
  }
  
  if (images.length > 0) {
    data.content.images = images.slice(0, 20); // Limit to first 20 images
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
