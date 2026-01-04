# 💎toon_stream_api
### 9. Search
GET /home/search/{query}
GET /search/{query}
GET /home?s={query}
Scrapes search results pages. Works with multiple URL patterns and query parameters.

**URL Patterns (All Supported):**
- `/home/search/naruto` - Clean URL pattern
- `/search/naruto` - Short URL pattern
- `/home/?s=naruto` - WordPress default pattern
- `/home/search/naruto/` - With trailing slash
- `/search/one%20piece` - URL encoded queries

**Query Parameters:**
- `q` - Search query (alternative to URL path)
- `s` - Search query (WordPress standard)
- `query` - Search query (alternative)

**Example Response:**
```json
{
  "success": true,
  "data": {
    "searchUrl": "https://toonstream.one/home/?s=naruto",
    "pageType": "search",
    "searchQuery": "naruto",
    "searchTitle": "Naruto",
    "hasResults": true,
    "results": [
      {
        "id": "post-3812",
        "title": "Naruto Shippūden",
        "image": "https://image.tmdb.org/t/p/w500/...",
        "url": "https://toonstream.one/series/naruto-shippuden-hindi-dub/",
        "rating": "8.553",
        "contentType": "series",
        "categories": ["action adventure", "animation"],
        "tags": ["naruto shippuden"],
        "cast": ["akira ishida", "chie nakamura"],
        "letters": ["n"],
        "year": "5256"
      },
      {
        "id": "post-4303",
        "title": "Naruto the Movie: Ninja Clash in the Land of Snow",
        "image": "https://image.tmdb.org/t/p/w500/...",
        "url": "https://toonstream.one/movies/...",
        "rating": "7.222",
        "contentType": "movie",
        "categories": ["action", "adventure", "animation"],
        "tags": ["naruto the movie"],
        "cast": ["chie nakamura"],
        "countries": ["japan"],
        "letters": ["n"],
        "year": "3615"
      }
    ],
    "randomSeries": [...],
    "randomMovies": [...],
    "schedule": {...}
  },
  "stats": {
    "resultsCount": 8,
    "seriesCount": 5,
    "moviesCount": 3,
    "postsCount": 0,
    "randomSeriesCount": 6,
    "randomMoviesCount": 6
  }
}
