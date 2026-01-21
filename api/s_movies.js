export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") || "1";

    const targetUrl =
      page === "1"
        ? "https://toonstream.one/movies/"
        : `https://toonstream.one/movies/page/${page}/`;

    const res = await fetch(targetUrl, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      return json({ success: false, error: "Fetch failed" }, 500);
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const items = [...doc.querySelectorAll("ul.post-lst > li.movies")];

    const results = items.map((li) => {
      const titleEl = li.querySelector(".entry-title");
      const linkEl = li.querySelector("a.lnk-blk");
      const imgEl = li.querySelector("img");

      const title = titleEl?.textContent.trim() || "";
      const url = linkEl?.getAttribute("href") || "";
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

    // Pagination
    const pageLinks = [...doc.querySelectorAll(".pagination .page-link")]
      .map((a) => Number(a.textContent))
      .filter(Boolean);

    const currentPage = Number(page);
    const totalPages = pageLinks.length ? Math.max(...pageLinks) : 1;

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
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
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
