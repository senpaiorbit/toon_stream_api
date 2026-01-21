export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get("page") || "1";

    const target =
      page === "1"
        ? "https://toonstream.one/movies/"
        : `https://toonstream.one/movies/page/${page}/`;

    const res = await fetch(target, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      return respond({ success: false, error: "Fetch failed" }, 500);
    }

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    // 🔥 FIXED SELECTOR
    const liNodes = [...doc.querySelectorAll("ul.post-lst > li")];

    const results = liNodes
      .map((li) => {
        const titleEl = li.querySelector(".entry-title");
        const linkEl = li.querySelector("a.lnk-blk");
        const imgEl = li.querySelector("img");

        if (!titleEl || !linkEl || !imgEl) return null;

        const title = titleEl.textContent.trim();
        const url = linkEl.href;

        const posterRaw = imgEl.getAttribute("src");
        const poster = posterRaw.startsWith("//")
          ? "https:" + posterRaw
          : posterRaw;

        const id = url
          .replace("https://toonstream.one/", "")
          .replace(/\/$/, "")
          .split("/")
          .pop();

        return { id, title, url, poster };
      })
      .filter(Boolean); // 🔥 remove nulls

    // Pagination
    const pages = [...doc.querySelectorAll(".pagination .page-link")]
      .map((a) => Number(a.textContent))
      .filter(Boolean);

    const currentPage = Number(page);
    const totalPages = pages.length ? Math.max(...pages) : 1;

    return respond({
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
    return respond({ success: false, error: e.message }, 500);
  }
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
