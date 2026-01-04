import axios from "axios";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const target = req.query.url;

  if (!target) {
    return res.status(400).json({
      ok: false,
      error: "Missing ?url="
    });
  }

  try {
    const { data } = await axios.get(target, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": target
      }
    });

    const $ = cheerio.load(data);

    // grab iframe src
    let iframe = $("iframe").first().attr("src");

    if (!iframe) {
      return res.json({ ok: false, error: "No iframe found" });
    }

    // absolute fix
    if (iframe.startsWith("//")) iframe = "https:" + iframe;
    if (iframe.startsWith("/")) iframe = new URL(iframe, target).href;

    return res.json({
      ok: true,
      url: iframe
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Scrape failed"
    });
  }
}
