// extra.js - Additional utilities and enhanced scraping functions

export const config = {
  runtime: 'edge',
};

/**
 * Fetch CF Proxy URL from GitHub
 */
export async function getCfProxyUrl() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt');
    const url = await response.text();
    return url.trim();
  } catch (error) {
    console.error('Failed to fetch CF proxy URL:', error);
    return 'https://toonstream-proxy.pqndalol.workers.dev';
  }
}

/**
 * Extract menu structure from HTML
 */
export function extractMenu(html) {
  const menu = [];
  const menuRegex = /<ul class="menu dfxc dv or-1">([\s\S]*?)<\/ul>/;
  const menuMatch = html.match(menuRegex);
  
  if (!menuMatch) return menu;

  const menuItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/li>(?=\s*(?:<li|<\/ul))/g;
  let match;
  
  while ((match = menuItemRegex.exec(menuMatch[1])) !== null) {
    const [, id, classes, content] = match;
    
    // Extract main link
    const linkMatch = content.match(/<a href="([^"]+)">([^<]+)<\/a>/);
    if (!linkMatch) continue;
    
    const [, url, title] = linkMatch;
    const hasChildren = classes.includes('menu-item-has-children');
    
    const item = {
      id: parseInt(id),
      title: title.trim(),
      url: url.trim(),
      hasChildren,
      children: []
    };
    
    // Extract submenu if exists
    if (hasChildren) {
      const submenuRegex = /<ul class="sub-menu">([\s\S]*?)<\/ul>/;
      const submenuMatch = content.match(submenuRegex);
      
      if (submenuMatch) {
        const subItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g;
        let subMatch;
        
        while ((subMatch = subItemRegex.exec(submenuMatch[1])) !== null) {
          const [, subId, subUrl, subTitle] = subMatch;
          item.children.push({
            id: parseInt(subId),
            title: subTitle.trim(),
            url: subUrl.trim()
          });
        }
      }
    }
    
    menu.push(item);
  }
  
  return menu;
}

/**
 * Extract footer menu from HTML
 */
export function extractFooter(html) {
  const footer = [];
  const footerRegex = /<nav class="top dfxc alg-cr">[\s\S]*?<ul class="menu[^"]*">([\s\S]*?)<\/ul>/;
  const footerMatch = html.match(footerRegex);
  
  if (!footerMatch) return footer;

  const footerItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a(?:[^>]*rel="([^"]*)")?[^>]*href="([^"]+)">([^<]+)<\/a>/g;
  let match;
  
  while ((match = footerItemRegex.exec(footerMatch[1])) !== null) {
    const [, id, rel, url, title] = match;
    footer.push({
      id: parseInt(id),
      title: title.trim(),
      url: url.trim(),
      rel: rel || null
    });
  }
  
  return footer;
}

/**
 * Extract schedule from HTML
 */
export function extractSchedule(html) {
  const schedule = {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const dayRegex = new RegExp(`<div[^>]*class="custom-tab-pane[^"]*"[^>]*id="${day}"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div class="custom-tab-pane|<\\/div>\\s*<\\/div>)`, 'i');
    const dayMatch = html.match(dayRegex);
    
    if (dayMatch) {
      const scheduleItems = [];
      const itemRegex = /<li class="custom-schedule-item">[\s\S]*?<span class="schedule-time">([^<]+)<\/span>[\s\S]*?<p class="schedule-description">([^<]+)<\/p>[\s\S]*?<\/li>/g;
      let itemMatch;
      
      while ((itemMatch = itemRegex.exec(dayMatch[1])) !== null) {
        const [, time, description] = itemMatch;
        scheduleItems.push({
          time: time.trim(),
          description: description.trim()
        });
      }
      
      schedule[day] = {
        day: day.charAt(0).toUpperCase() + day.slice(1),
        items: scheduleItems,
        count: scheduleItems.length
      };
    }
  });
  
  return schedule;
}

/**
 * Extract media items (series or movies)
 */
export function extractMediaItems(html, type = 'unknown') {
  const items = [];
  const itemRegex = /<li[^>]*id="post-(\d+)"[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/li>(?=\s*(?:<li|<\/ul))/g;
  let match;
  
  while ((match = itemRegex.exec(html)) !== null) {
    const [, id, classes, content] = match;
    
    // Extract title
    const titleMatch = content.match(/<h2 class="entry-title">([^<]+)<\/h2>/);
    
    // Extract rating
    const voteMatch = content.match(/<span class="vote"><span>TMDB<\/span>\s*([\d.]+)<\/span>/);
    
    // Extract image
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/);
    
    // Extract URL
    const urlMatch = content.match(/<a href="([^"]+)" class="lnk-blk"><\/a>/);
    
    // Extract type
    const typeMatch = content.match(/<span class="watch btn sm">View (Serie|Movie)<\/span>/);
    
    // Extract categories
    const categories = [];
    const categoryRegex = /category-([a-z0-9-]+)/g;
    let catMatch;
    while ((catMatch = categoryRegex.exec(classes)) !== null) {
      categories.push(catMatch[1]);
    }
    
    // Extract year
    const yearMatch = classes.match(/annee-(\d+)/);
    
    items.push({
      id: parseInt(id),
      title: titleMatch ? titleMatch[1].trim() : 'Unknown',
      rating: voteMatch ? parseFloat(voteMatch[1]) : 0,
      image: imgMatch ? imgMatch[1] : '',
      imageAlt: imgMatch ? imgMatch[2] : '',
      url: urlMatch ? urlMatch[1] : '',
      type: typeMatch ? typeMatch[1].toLowerCase() : type,
      categories: categories,
      year: yearMatch ? parseInt(yearMatch[1]) : null
    });
  }
  
  return items;
}

/**
 * Extract random series from sidebar
 */
export function extractRandomSeries(html) {
  const randomSeriesRegex = /<section id="widget_list_movies_series-4"[\s\S]*?<ul class="post-lst[^"]*">([\s\S]*?)<\/ul>/;
  const randomSeriesMatch = html.match(randomSeriesRegex);
  
  if (!randomSeriesMatch) return [];
  
  return extractMediaItems(randomSeriesMatch[1], 'series');
}

/**
 * Extract random movies from sidebar
 */
export function extractRandomMovies(html) {
  const randomMoviesRegex = /<section id="widget_list_movies_series-5"[\s\S]*?<ul class="post-lst[^"]*">([\s\S]*?)<\/ul>/;
  const randomMoviesMatch = html.match(randomMoviesRegex);
  
  if (!randomMoviesMatch) return [];
  
  return extractMediaItems(randomMoviesMatch[1], 'movie');
}

/**
 * Extract logo information
 */
export function extractLogo(html) {
  const logoRegex = /<figure class="logo[^"]*">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/;
  const logoMatch = html.match(logoRegex);
  
  if (!logoMatch) return null;
  
  return {
    url: logoMatch[1],
    image: logoMatch[2],
    alt: logoMatch[3]
  };
}

/**
 * Extract copyright information
 */
export function extractCopyright(html) {
  const copyrightRegex = /<center>[\s\S]*?<p>\s*([^<]+)\s*<\/p>[\s\S]*?<p>\s*(Copyright[^<]+)\s*<\/p>/;
  const copyrightMatch = html.match(copyrightRegex);
  
  if (!copyrightMatch) return null;
  
  return {
    disclaimer: copyrightMatch[1].trim(),
    copyright: copyrightMatch[2].trim()
  };
}

/**
 * Main parsing function
 */
export function parseFullHTML(html) {
  return {
    logo: extractLogo(html),
    menu: extractMenu(html),
    footer: extractFooter(html),
    schedule: extractSchedule(html),
    randomSeries: extractRandomSeries(html),
    randomMovies: extractRandomMovies(html),
    copyright: extractCopyright(html),
    metadata: {
      totalMenuItems: extractMenu(html).length,
      totalFooterItems: extractFooter(html).length,
      scheduleDays: Object.keys(extractSchedule(html)).length,
      randomSeriesCount: extractRandomSeries(html).length,
      randomMoviesCount: extractRandomMovies(html).length
    }
  };
}

/**
 * API Handler
 */
export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get('section');
  const query = searchParams.get('s') || '';

  try {
    // Get CF proxy URL
    const cfProxy = await getCfProxyUrl();
    
    // Construct the scrape URL
    const scrapeUrl = `${cfProxy}/?path=/home/?s=${encodeURIComponent(query)}`;
    
    // Fetch the page
    const response = await fetch(scrapeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    const parsedData = parseFullHTML(html);

    // Section mapping
    const sectionMap = {
      '1': { key: 'menu', data: parsedData.menu },
      'menu': { key: 'menu', data: parsedData.menu },
      '2': { key: 'footer', data: parsedData.footer },
      'footer': { key: 'footer', data: parsedData.footer },
      '3': { key: 'schedule', data: parsedData.schedule },
      'schedule': { key: 'schedule', data: parsedData.schedule },
      '4': { key: 'randomSeries', data: parsedData.randomSeries },
      'randomseries': { key: 'randomSeries', data: parsedData.randomSeries },
      'random-series': { key: 'randomSeries', data: parsedData.randomSeries },
      '5': { key: 'randomMovies', data: parsedData.randomMovies },
      'randommovies': { key: 'randomMovies', data: parsedData.randomMovies },
      'random-movies': { key: 'randomMovies', data: parsedData.randomMovies },
      'logo': { key: 'logo', data: parsedData.logo },
      'copyright': { key: 'copyright', data: parsedData.copyright },
      'metadata': { key: 'metadata', data: parsedData.metadata }
    };

    // Handle section query
    if (section) {
      const sectionData = sectionMap[section.toLowerCase()];
      
      if (sectionData) {
        return new Response(JSON.stringify({
          success: true,
          section: sectionData.key,
          query: query || null,
          data: sectionData.data,
          timestamp: new Date().toISOString()
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300'
          }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid section',
          availableSections: {
            '1 or menu': 'Navigation menu items',
            '2 or footer': 'Footer links',
            '3 or schedule': 'Weekly schedule',
            '4 or randomSeries': 'Random series from sidebar',
            '5 or randomMovies': 'Random movies from sidebar',
            'logo': 'Site logo information',
            'copyright': 'Copyright and disclaimer',
            'metadata': 'Summary metadata'
          }
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // Return all data if no section specified
    return new Response(JSON.stringify({
      success: true,
      query: query || null,
      data: parsedData,
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
