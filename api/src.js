export const config = { runtime: "edge" };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) return respond({ ok:false, url:null, error:"NO_URL" });

  try {
    const res = await fetch(target, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache",
        "upgrade-insecure-requests": "1",
        "sec-fetch-site": "none",
        "sec-fetch-mode": "navigate",
        "sec-fetch-user": "?1",
        "sec-fetch-dest": "document"
      }
    });

    let html = await res.text();

    // HARD decode & normalize (Cloudflare + ScraperAPI safe)
    html = decodeURIComponent(escape(html))
      .replace(/<!--[\s\S]*?-->/g,'')
      .replace(/\s+/g,' ');

    // iframe src extractor (super tolerant)
    const m = html.match(/<iframe[\s\S]*?src\s*=\s*["']([^"']+)["']/i);

    return respond({
      ok: !!m,
      url: m ? absolutize(m[1], target) : null
    });

  } catch(e) {
    return respond({ ok:false, url:null, error:"FETCH_FAIL" });
  }
}

function absolutize(u, base){
  if(u.startsWith("//")) return "https:"+u;
  if(u.startsWith("/")) return new URL(base).origin + u;
  return u;
}

function respond(data){
  return new Response(JSON.stringify(data),{
    headers:{
      "content-type":"application/json",
      "access-control-allow-origin":"*"
    }
  });
}
