export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) return respond({ ok:false, url:null, error:"NO_URL" });

  try {
    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,*/*"
      }
    });

    const html = await res.text();

    // Normalize broken HTML (ScraperAPI/Cloudflare fix)
    const clean = html
      .replace(/[\n\r\t]/g,' ')
      .replace(/\s+/g,' ')
      .toLowerCase();

    // Multi-iframe safe extractor
    const matches = [...clean.matchAll(/<iframe[^>]*src\s*=\s*["']([^"']+)["']/gi)];

    if (!matches.length) return respond({ ok:false, url:null });

    // First real iframe
    let url = matches[0][1];

    // Absolute URL fix
    if (url.startsWith("//")) url = "https:" + url;
    if (url.startsWith("/")) {
      const base = new URL(target);
      url = base.origin + url;
    }

    return respond({ ok:true, url });

  } catch(e) {
    return respond({ ok:false, url:null, error:"FETCH_FAIL" });
  }
}

function respond(data){
  return new Response(JSON.stringify(data),{
    headers:{
      "content-type":"application/json",
      "access-control-allow-origin":"*",
      "cache-control":"no-store"
    }
  });
}
