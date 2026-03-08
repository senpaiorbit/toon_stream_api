/**
 * Run this locally: node debug-html.js
 * It will fetch PornHub search + trending pages and save the raw HTML,
 * then print exactly what selectors match and how many results are found.
 */
const https = require("https");
const zlib  = require("zlib");
const fs    = require("fs");

const HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection":      "keep-alive",
  "Cookie":          "accessAgeDisclaimerPH=1; platform=pc",
  "Referer":         "https://www.pornhub.com/",
};

function fetch(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error("Too many redirects"));
    const parsed = new URL(url);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: "GET", headers: { ...HEADERS, Host: parsed.hostname } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).href;
          res.resume();
          return fetch(next, redirects + 1).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const enc = res.headers["content-encoding"];
          const done = (err, buf) => err ? reject(err) : resolve({ html: buf.toString("utf8"), status: res.statusCode, finalUrl: url });
          if (enc === "br") zlib.brotliDecompress(raw, done);
          else if (enc === "gzip") zlib.gunzip(raw, done);
          else if (enc === "deflate") zlib.inflate(raw, (e, b) => e ? zlib.inflateRaw(raw, done) : done(null, b));
          else done(null, raw);
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const urls = [
    { name: "search", url: "https://www.pornhub.com/video/search?search=test&p=1" },
    { name: "trending", url: "https://www.pornhub.com/video?o=tr&page=1" },
    { name: "video", url: "https://www.pornhub.com/view_video.php?viewkey=ph5f4b8ac8cc9c9" },
  ];

  for (const { name, url } of urls) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Fetching: ${name} => ${url}`);
    try {
      const { html, status, finalUrl } = await fetch(url);
      console.log(`Status: ${status}  Final URL: ${finalUrl}  Size: ${html.length} bytes`);

      // Save raw HTML
      fs.writeFileSync(`ph_${name}.html`, html, "utf8");
      console.log(`Saved: ph_${name}.html`);

      // Print first 3000 chars so you can see the structure
      console.log("\n--- HTML PREVIEW (first 3000 chars) ---");
      console.log(html.slice(0, 3000));

      // Quick selector scan (manual grep)
      const checks = [
        "pcVideoListItem",
        "videoSearchResult",
        "js-videoThumb",
        "data-video-vkey",
        "data-thumb_url",
        "data-mediumthumb",
        "linkVideoThumb",
        "mostRecentVideosSection",
        "usernameWrap",
        "duration",
        "accessAgeDisclaimer",
        "age_disclaimer",
        "are you 18",
      ];
      console.log("\n--- SELECTOR MATCH COUNTS ---");
      for (const s of checks) {
        const count = (html.match(new RegExp(s, "gi")) || []).length;
        if (count > 0) console.log(`  "${s}": ${count} occurrences`);
        else           console.log(`  "${s}": NOT FOUND`);
      }
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
    }
  }
}

main();
