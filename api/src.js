export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const q = new URL(req.url).searchParams;
    const target = q.get("url");
    if (!target) return j({ ok:false, error:"NO_URL" });

    const r = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Referer": target
      }
    });

    let html = await r.text();

    // Decode escaped HTML if any
    html = html.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");

    // All possible iframe locations
    let m =
      html.match(/<iframe[^>]+src=["']([^"']+)["']/i) ||
      html.match(/data-src=["']([^"']+)["']/i) ||
      html.match(/embedUrl["']?\s*:\s*["']([^"']+)["']/i) ||
      html.match(/src:\s*["']([^"']+)["']/i);

    if (!m) return j({ ok:false, url:null });

    // Resolve redirect (short.icu, etc.)
    let real = m[1];
    if (real.startsWith("//")) real = "https:" + real;

    try {
      const head = await fetch(real, { redirect:"follow" });
      real = head.url;
    } catch {}

    return j({ ok:true, url: real });

  } catch (e) {
    return j({ ok:false, error:"FAILED" });
  }
}

function j(d){
  return new Response(JSON.stringify(d),{
    headers:{
      "content-type":"application/json",
      "access-control-allow-origin":"*"
    }
  });
}
