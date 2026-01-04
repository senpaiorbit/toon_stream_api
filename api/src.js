export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) return res.json({ ok:false, url:null });

  try {
    const r = await fetch(target, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        "pragma": "no-cache"
      }
    });

    let html = await r.text();

    // Normalize polluted HTML
    html = html.replace(/\s+/g," ").replace(/<!--.*?-->/g,"");

    const m = html.match(/<iframe[\s\S]*?src\s*=\s*["']([^"']+)["']/i);

    if(!m) return res.json({ ok:false, url:null });

    let url = m[1];
    if(url.startsWith("//")) url = "https:"+url;
    if(url.startsWith("/")) url = new URL(target).origin + url;

    return res.json({ ok:true, url });

  } catch(e){
    return res.json({ ok:false, url:null });
  }
}
