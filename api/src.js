import axios from "axios";
import cheerio from "cheerio";

export default async function handler(req, res) {
  try {
    const target = req.query.url;
    if (!target) return res.json({ ok: false, error: "NO_URL" });

    const response = await axios.get(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      },
      timeout: 20000
    });

    const $ = cheerio.load(response.data);

    let finalUrl = null;

    $("iframe").each((i, el) => {
      const src = $(el).attr("src");
      if (src && !finalUrl) finalUrl = src;
    });

    if (!finalUrl) {
      // Try fallback: JS embedded iframe
      const html = response.data;
      const jsMatch = html.match(/src\s*:\s*["']([^"']+)["']/i);
      if (jsMatch) finalUrl = jsMatch[1];
    }

    res.json({
      ok: !!finalUrl,
      url: finalUrl
    });

  } catch (e) {
    res.json({ ok: false, error: "FETCH_FAILED" });
  }
}
