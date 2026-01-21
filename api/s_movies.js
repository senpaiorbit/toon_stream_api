export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") || "1";

    const target =
      page === "1"
        ? "https://toonstream.one/movies/"
        : `https://toonstream.one/movies/page/${page}/`;

    const res = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0",
        "accept": "text/html",
      },
    });

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    /* 🔥 FIXED SELECTOR */
    const list = doc.querySelector("ul.post-lst");
    const items = list
      ? [...list.querySelectorAll("li[class*='movies']")]
      : [];

    const results = items.map((li) => {
      const titleEl = li.querySelector("h2.entry-title");
      const linkEl = li.querySelector("a.lnk-blk");
      const imgEl = li.querySelector("img");

      const title = titleEl?.textContent?.trim() || "";
      const url = linkEl?.href || "";
      const posterRaw = imgEl?.getAttribute("src") || "";

      const poster = posterRaw.startsWith("//")
        ? "https:" + posterRaw
        : posterRaw;

      const id = url
        .replace("https://toonstream.one/", "")
        .replace(/\/$/, "")
        .split("/")
        .pop();

      return {
        id,
        title,
        url,
        poster,
      };
    });

    /* Pagination */
    const pages = [...doc.querySelectorAll(".pagination .page-link")]
      .map((a) => parseInt(a.textContent))
      .filter(Boolean);

    const totalPages = pages.length ? Math.max(...pages) : 1;
    const currentPage = Number(page);

    return json({
      success: true,
      category: "anime-movies",
      categoryName: "Anime Movies",
      results,
      pagination: {
        currentPage,
        totalPages,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
      },
    });
  } catch (e) {
    return json({ success: false, error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
