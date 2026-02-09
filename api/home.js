// /api/home.js

export const config = { runtime: "edge" };

const BASE_URL = "https://toonstream.one/home";
let cachedProxyUrl = null;

async function getProxyUrl() {
  if (cachedProxyUrl) return cachedProxyUrl;
  
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt"
    );
    cachedProxyUrl = (await response.text()).trim();
    return cachedProxyUrl;
  } catch (error) {
    throw new Error("Failed to fetch proxy URL");
  }
}

function normalizeImage(url) {
  if (!url) return null;
  let normalized = url.replace(/^\/\//, "https://");
  normalized = normalized.replace(/\/w\d+\//, "/w500/");
  return normalized;
}

function extractSlug(url) {
  if (!url) return null;
  const match = url.match(/\/series\/([^\/]+)/);
  return match ? match[1] : null;
}

function parseSeriesCard(html) {
  const items = [];
  const cardPattern = /<article[^>]*class="[^"]*item\s+movies[^"]*"[^>]*>(.*?)<\/article>/gs;
  const cards = [...html.matchAll(cardPattern)];

  for (const card of cards) {
    const content = card[1];
    
    const linkMatch = content.match(/<a[^>]+href="([^"]+)"/);
    const titleMatch = content.match(/<h3[^>]*>(.*?)<\/h3>/s);
    const imageMatch = content.match(/<img[^>]+src="([^"]+)"/);
    const yearMatch = content.match(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/);
    const qualityMatch = content.match(/<span[^>]*class="[^"]*quality[^"]*"[^>]*>(.*?)<\/span>/);
    
    if (linkMatch && titleMatch) {
      items.push({
        title: titleMatch[1].replace(/<[^>]+>/g, "").trim(),
        slug: extractSlug(linkMatch[1]),
        url: linkMatch[1],
        image: normalizeImage(imageMatch ? imageMatch[1] : null),
        year: yearMatch ? parseInt(yearMatch[1]) : null,
        quality: qualityMatch ? qualityMatch[1].trim() : null
      });
    }
  }
  
  return items;
}

function parseSlider(html) {
  const items = [];
  const slidePattern = /<div[^>]*class="[^"]*swiper-slide[^"]*"[^>]*>(.*?)<\/div>/gs;
  const slides = [...html.matchAll(slidePattern)];

  for (const slide of slides) {
    const content = slide[1];
    
    const linkMatch = content.match(/<a[^>]+href="([^"]+)"/);
    const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/s);
    const imageMatch = content.match(/url\(['"]?([^'"]+)['"]?\)/);
    const descMatch = content.match(/<p[^>]*class="[^"]*desc[^"]*"[^>]*>(.*?)<\/p>/s);
    
    if (linkMatch && titleMatch) {
      items.push({
        title: titleMatch[1].replace(/<[^>]+>/g, "").trim(),
        slug: extractSlug(linkMatch[1]),
        url: linkMatch[1],
        image: normalizeImage(imageMatch ? imageMatch[1] : null),
        description: descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : null
      });
    }
  }
  
  return items;
}

function parseSections(html) {
  const sections = [];
  const sectionPattern = /<section[^>]*id="([^"]*)"[^>]*>(.*?)<\/section>/gs;
  const sectionMatches = [...html.matchAll(sectionPattern)];

  for (const section of sectionMatches) {
    const sectionId = section[1];
    const sectionContent = section[2];
    
    const titleMatch = sectionContent.match(/<h2[^>]*>(.*?)<\/h2>/);
    const sectionTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : null;
    
    if (sectionId === 'featured') {
      sections.push({
        id: sectionId,
        title: sectionTitle,
        type: 'slider',
        items: parseSlider(sectionContent)
      });
    } else {
      sections.push({
        id: sectionId,
        title: sectionTitle,
        type: 'grid',
        items: parseSeriesCard(sectionContent)
      });
    }
  }
  
  return sections;
}

export default async function handler(request) {
  try {
    const proxyUrl = await getProxyUrl();
    const targetUrl = `${proxyUrl}?url=${encodeURIComponent(BASE_URL)}`;
    
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch homepage" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    
    const html = await response.text();
    const sections = parseSections(html);
    
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          sections
        },
        stats: {
          total_sections: sections.length,
          total_items: sections.reduce((sum, s) => sum + s.items.length, 0)
        }
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          "Cache-Control": "s-maxage=300, stale-while-revalidate"
        } 
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
