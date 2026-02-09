export const config = {
  runtime: 'edge',
};

// Fetch CF proxy base URL
async function getCfProxyUrl() {
  try {
    const response = await fetch('https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt');
    const url = await response.text();
    return url.trim();
  } catch (error) {
    return 'https://toonstream-proxy.pqndalol.workers.dev';
  }
}

// Parse HTML to extract data
function parseHTML(html) {
  const data = {
    menu: [],
    footer: [],
    schedule: {},
    randomSeries: [],
    randomMovies: []
  };

  // Extract menu items
  const menuRegex = /<ul class="menu dfxc dv or-1">([\s\S]*?)<\/ul>/;
  const menuMatch = html.match(menuRegex);
  if (menuMatch) {
    const menuItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>([\s\S]*?)<\/li>/g;
    let match;
    while ((match = menuItemRegex.exec(menuMatch[1])) !== null) {
      const [, id, url, title, content] = match;
      const item = { id, title, url, children: [] };
      
      // Extract submenu if exists
      const submenuRegex = /<ul class="sub-menu">([\s\S]*?)<\/ul>/;
      const submenuMatch = content.match(submenuRegex);
      if (submenuMatch) {
        const subItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g;
        let subMatch;
        while ((subMatch = subItemRegex.exec(submenuMatch[1])) !== null) {
          const [, subId, subUrl, subTitle] = subMatch;
          item.children.push({ id: subId, title: subTitle, url: subUrl });
        }
      }
      
      data.menu.push(item);
    }
  }

  // Extract footer menu
  const footerRegex = /<nav class="top dfxc alg-cr">[\s\S]*?<ul class="menu[^"]*">([\s\S]*?)<\/ul>/;
  const footerMatch = html.match(footerRegex);
  if (footerMatch) {
    const footerItemRegex = /<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)">([^<]+)<\/a>/g;
    let match;
    while ((match = footerItemRegex.exec(footerMatch[1])) !== null) {
      const [, id, url, title] = match;
      data.footer.push({ id, title, url });
    }
  }

  // Extract schedule
  const scheduleRegex = /<div class="custom-tab-pane[^"]*"\s+id="(\w+)">([\s\S]*?)<\/div>\s*(?=<div class="custom-tab-pane|<\/div>\s*<\/div>)/g;
  let scheduleMatch;
  while ((scheduleMatch = scheduleRegex.exec(html)) !== null) {
    const [, day, content] = scheduleMatch;
    const scheduleItems = [];
    const itemRegex = /<span class="schedule-time">([^<]+)<\/span>[\s\S]*?<p class="schedule-description">([^<]+)<\/p>/g;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(content)) !== null) {
      const [, time, description] = itemMatch;
      scheduleItems.push({ time, description });
    }
    data.schedule[day] = scheduleItems;
  }

  // Extract random series
  const randomSeriesRegex = /<section id="widget_list_movies_series-4"[\s\S]*?<ul class="post-lst[^"]*">([\s\S]*?)<\/ul>/;
  const randomSeriesMatch = html.match(randomSeriesRegex);
  if (randomSeriesMatch) {
    data.randomSeries = extractMediaItems(randomSeriesMatch[1]);
  }

  // Extract random movies
  const randomMoviesRegex = /<section id="widget_list_movies_series-5"[\s\S]*?<ul class="post-lst[^"]*">([\s\S]*?)<\/ul>/;
  const randomMoviesMatch = html.match(randomMoviesRegex);
  if (randomMoviesMatch) {
    data.randomMovies = extractMediaItems(randomMoviesMatch[1]);
  }

  return data;
}

// Extract media items (series/movies)
function extractMediaItems(html) {
  const items = [];
  const itemRegex = /<li[^>]*id="post-(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  
  while ((match = itemRegex.exec(html)) !== null) {
    const [, id, content] = match;
    
    const titleMatch = content.match(/<h2 class="entry-title">([^<]+)<\/h2>/);
    const voteMatch = content.match(/<span class="vote"><span>TMDB<\/span>\s*([\d.]+)<\/span>/);
    const imgMatch = content.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/);
    const urlMatch = content.match(/<a href="([^"]+)" class="lnk-blk"><\/a>/);
    const typeMatch = content.match(/<span class="watch btn sm">View (Serie|Movie)<\/span>/);
    
    items.push({
      id,
      title: titleMatch ? titleMatch[1] : '',
      rating: voteMatch ? parseFloat(voteMatch[1]) : 0,
      image: imgMatch ? imgMatch[1] : '',
      url: urlMatch ? urlMatch[1] : '',
      type: typeMatch ? typeMatch[1].toLowerCase() : ''
    });
  }
  
  return items;
}

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    
    const html = await response.text();
    const parsedData = parseHTML(html);

    // Handle section query
    if (section) {
      const sectionMap = {
        '1': parsedData.menu,
        'menu': parsedData.menu,
        '2': parsedData.footer,
        'footer': parsedData.footer,
        '3': parsedData.schedule,
        'schedule': parsedData.schedule,
        '4': parsedData.randomSeries,
        'randomSeries': parsedData.randomSeries,
        'random-series': parsedData.randomSeries,
        '5': parsedData.randomMovies,
        'randomMovies': parsedData.randomMovies,
        'random-movies': parsedData.randomMovies
      };

      const sectionData = sectionMap[section.toLowerCase()];
      
      if (sectionData) {
        return new Response(JSON.stringify({
          success: true,
          section,
          data: sectionData
        }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } else {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid section',
          availableSections: ['menu (1)', 'footer (2)', 'schedule (3)', 'randomSeries (4)', 'randomMovies (5)']
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
      data: parsedData
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
