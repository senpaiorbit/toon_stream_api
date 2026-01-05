# ToonStream API Scraper

A comprehensive Vercel serverless API for scraping anime and cartoon content from ToonStream. This API provides structured data for series, movies, episodes, categories, cast members, and search functionality.

## 🚀 Features

- **Homepage Scraping** - Latest series, movies, and trending content
- **Series Details** - Complete series information with flexible season/episode queries
- **Episode Details** - Episode metadata with streaming server sources
- **Movies** - Individual movie details and movie listings
- **Search** - Full-text search across all content
- **Categories** - Browse by networks, genres, and languages
- **Cast Pages** - Content filtered by cast members
- **Alphabetical Browsing** - Browse content by letter (A-Z)
- **Server Filtering** - Get specific streaming servers or all available sources
- **Pagination Support** - Navigate through paginated content
- **CORS Enabled** - Ready for frontend integration

## 📋 Table of Contents

- [Installation](#installation)
- [Deployment](#deployment)
- [API Endpoints](#api-endpoints)
  - [Homepage](#1-homepage)
  - [Series](#2-series)
  - [Episode](#3-episode)
  - [Movies](#4-movies)
  - [Search](#5-search)
  - [Categories](#6-categories)
  - [Cast](#7-cast)
  - [Alphabetical](#8-alphabetical-browsing)
- [Query Parameters](#query-parameters)
- [Response Format](#response-format)
- [Examples](#examples)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

## 🛠 Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/toonstream-api.git
cd toonstream-api
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure base URL**

Create `src/baseurl.txt` and add the base URL:
```
https://toonstream.one
```

4. **Test locally**
```bash
vercel dev
```

## 🚢 Deployment

### Deploy to Vercel

1. **Install Vercel CLI**
```bash
npm install -g vercel
```

2. **Login to Vercel**
```bash
vercel login
```

3. **Deploy**
```bash
vercel
```

4. **Production deployment**
```bash
vercel --prod
```

Your API will be live at: `https://your-project.vercel.app`

## 📡 API Endpoints

### 1. Homepage

Scrapes the homepage with latest content, featured series, and trending items.

**Endpoint:**
```
GET /home
GET /
```

**Response includes:**
- Latest series
- Latest movies
- Featured content
- Trending shows
- Random series/movies
- Weekly schedule

**Example:**
```bash
curl https://your-api.vercel.app/home
```

---

### 2. Series

Get detailed series information with flexible season and episode queries.

**Endpoint:**
```
GET /series/{slug}
GET /api/series?slug={slug}
```

**Query Parameters:**
- `slug` (required) - Series slug (e.g., `attack-on-titan`)
- `seasons` (optional) - Season selection:
  - Single: `?seasons=1`
  - Multiple: `?seasons=1,2,3`
  - Range: `?seasons=2-4`
  - All: `?seasons=all`
  - Default: `1`
- `src` (optional) - Include server sources:
  - `?src=true` - Include iframe sources for all episodes
  - `?src=false` - Exclude server sources (default)
- `server` (optional) - Filter specific servers:
  - By number: `?server=0,1,2`
  - By range: `?server=0-4`
  - All servers: `?server=all`

**Examples:**
```bash
# Basic series info (season 1 only)
GET /series/attack-on-titan

# Multiple seasons
GET /series/attack-on-titan?seasons=1,2,3

# All seasons
GET /series/attack-on-titan?seasons=all

# With server sources
GET /series/attack-on-titan?seasons=1&src=true&server=all

# Specific servers
GET /series/attack-on-titan?seasons=1,2&src=true&server=0,1,2

# Season range with server range
GET /series/attack-on-titan?seasons=2-4&src=true&server=0-3
```

**Response:**
```json
{
  "success": true,
  "data": {
    "seriesSlug": "attack-on-titan",
    "title": "Attack on Titan",
    "image": "https://image.tmdb.org/t/p/w185/...",
    "rating": "8.658",
    "year": "2013",
    "totalSeasons": 6,
    "totalEpisodes": 97,
    "requestedSeasons": [1, 2],
    "includeServerSources": true,
    "availableSeasons": [
      {"seasonNumber": 0, "name": "Season 0"},
      {"seasonNumber": 1, "name": "Season 1"}
    ],
    "categories": [...],
    "tags": [...],
    "cast": [...],
    "seasons": [
      {
        "seasonNumber": 1,
        "year": "2013",
        "rating": "8.658",
        "episodes": [
          {
            "episodeNumber": "1x1",
            "title": "Attack on Titan 1x1",
            "image": "https://...",
            "time": "13 years ago",
            "url": "https://toonstream.one/episode/attack-on-titan-1x1/",
            "servers": [
              {
                "serverNumber": 0,
                "displayNumber": 1,
                "name": "X",
                "src": "https://toonstream.one/home/?trembed=0&trid=35148&trtype=2"
              }
            ]
          }
        ]
      }
    ]
  },
  "stats": {
    "totalSeasons": 6,
    "requestedSeasons": 2,
    "fetchedEpisodes": 37,
    "includesServerSources": true
  }
}
```

---

### 3. Episode

Get episode details with streaming server sources.

**Endpoint:**
```
GET /episode/{slug}
GET /api/episode?slug={slug}
```

**Query Parameters:**
- `slug` (required) - Episode slug (e.g., `attack-on-titan-2x1`)
- `server` (optional) - Filter servers:
  - By number: `?server=0,1,2`
  - By range: `?server=0-4`
  - By name: `?server=x,short,ruby`
  - All: `?server=all`

**Examples:**
```bash
# All servers
GET /episode/attack-on-titan-2x1

# Specific servers by number
GET /episode/attack-on-titan-2x1?server=0,1,2

# Server range
GET /episode/attack-on-titan-2x1?server=0-4

# Specific servers by name
GET /episode/attack-on-titan-2x1?server=x,short,ruby

# All servers explicitly
GET /episode/attack-on-titan-2x1?server=all
```

**Response:**
```json
{
  "success": true,
  "data": {
    "episodeSlug": "attack-on-titan-2x1",
    "title": "Attack on Titan 2x1",
    "image": "https://...",
    "description": "Episode description...",
    "year": "2017",
    "rating": "8.658",
    "categories": [...],
    "cast": [...],
    "navigation": {
      "previousEpisode": "https://toonstream.one/episode/attack-on-titan-1x25/",
      "nextEpisode": "https://toonstream.one/episode/attack-on-titan-2x2/",
      "seriesPage": "https://toonstream.one/series/attack-on-titan/"
    },
    "servers": [
      {
        "serverNumber": 0,
        "displayNumber": 1,
        "name": "X",
        "src": "https://toonstream.one/home/?trembed=0&trid=35148&trtype=2",
        "isActive": true
      },
      {
        "serverNumber": 1,
        "displayNumber": 2,
        "name": "Vidstream",
        "src": "https://toonstream.one/home/?trembed=1&trid=35148&trtype=2",
        "isActive": false
      }
    ]
  },
  "stats": {
    "totalServersAvailable": 10,
    "serversReturned": 2
  }
}
```

---

### 4. Movies

#### Individual Movie Details
```
GET /movies/{slug}
GET /api/movies?path={slug}
```

**Example:**
```bash
GET /movies/naruto-the-movie
```

**Response includes:**
- Movie metadata
- Streaming servers
- Cast & crew
- Similar movies
- Download links

#### Movies Listing
```
GET /movies
GET /movies/page/{page}
```

**Examples:**
```bash
GET /movies
GET /movies/page/2
```

---

### 5. Search

Search across all content types.

**Endpoint:**
```
GET /search/{query}
GET /home/search/{query}
GET /home?s={query}
```

**Query Parameters:**
- `q`, `s`, or `query` - Search term (min 2 characters)

**Examples:**
```bash
# URL path
GET /search/naruto

# Query parameter
GET /home?s=naruto

# Multi-word search
GET /search/one%20piece
```

**Response:**
```json
{
  "success": true,
  "data": {
    "searchQuery": "naruto",
    "hasResults": true,
    "results": [
      {
        "id": "post-3812",
        "title": "Naruto Shippūden",
        "image": "https://...",
        "url": "https://...",
        "rating": "8.553",
        "contentType": "series",
        "categories": [...],
        "tags": [...]
      }
    ]
  },
  "stats": {
    "resultsCount": 8,
    "seriesCount": 5,
    "moviesCount": 3
  }
}
```

---

### 6. Categories

Browse content by categories (networks, genres, languages).

**Endpoint:**
```
GET /category/{path}
GET /category/{parent}/{category}
GET /category/{path}/page/{page}
```

**Query Parameters:**
- `path` (required) - Category path
- `page` (optional) - Page number (default: 1)
- `type` (optional) - Filter by type: `movies`, `series`, `post`

**Examples:**
```bash
# Single-level category
GET /category/crunchyroll
GET /category/action
GET /category/anime

# Nested category
GET /category/language/hindi-language
GET /category/language/tamil-language

# With pagination
GET /category/crunchyroll/page/2

# With type filter
GET /category/action?type=movies
```

**Common Categories:**
- **Networks:** `crunchyroll`, `netflix`, `disney`, `cartoon-network`
- **Genres:** `action`, `comedy`, `horror`, `sci-fi`, `romance`
- **Languages:** `language/hindi-language`, `language/english`, `language/japaneses`

---

### 7. Cast

Browse content by cast members.

**Endpoint:**
```
GET /cast/{name}
GET /home/cast_tv/{name}
GET /home/cast/{name}/page/{page}
```

**Examples:**
```bash
GET /cast/saori-hayami
GET /home/cast_tv/saori-hayami
GET /cast/saori-hayami/page/2
```

---

### 8. Alphabetical Browsing

Browse content alphabetically.

**Endpoint:**
```
GET /home/letter/{letter}
GET /home/letter/{letter}/page/{page}
```

**Examples:**
```bash
GET /home/letter/A
GET /home/letter/N/page/2
GET /home/letter/0-9
```

## 🔧 Query Parameters

### Season Selection
- `seasons=1` - Single season
- `seasons=1,2,3` - Multiple seasons
- `seasons=2-4` - Season range
- `seasons=all` - All available seasons

### Server Selection
- `server=0,1,2` - Specific servers by number
- `server=0-4` - Server range
- `server=x,short,ruby` - By server name
- `server=all` - All servers

### Pagination
- `page=2` - Page number (default: 1)

### Content Type Filtering
- `type=movies` - Only movies
- `type=series` - Only series
- `type=post` - Only posts

### Server Sources
- `src=true` - Include iframe sources
- `src=false` - Exclude sources (default)

## 📦 Response Format

All successful responses follow this structure:

```json
{
  "success": true,
  "data": {
    // Endpoint-specific data
  },
  "stats": {
    // Statistics about the response
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 404
}
```

## 💡 Examples

### Get Series with All Episodes and Servers
```javascript
const response = await fetch(
  'https://your-api.vercel.app/series/attack-on-titan?seasons=all&src=true&server=all'
);
const data = await response.json();

// Access all episodes with servers
data.data.seasons.forEach(season => {
  season.episodes.forEach(episode => {
    console.log(`${episode.title} has ${episode.servers.length} servers`);
  });
});
```

### Get Specific Episode Servers
```javascript
const response = await fetch(
  'https://your-api.vercel.app/episode/attack-on-titan-2x1?server=0,1,2'
);
const data = await response.json();

// Access first 3 servers
data.data.servers.forEach(server => {
  console.log(`${server.name}: ${server.src}`);
});
```

### Search and Filter
```javascript
const response = await fetch(
  'https://your-api.vercel.app/search/naruto'
);
const data = await response.json();

// Filter by content type
const series = data.data.results.filter(item => item.contentType === 'series');
const movies = data.data.results.filter(item => item.contentType === 'movie');
```

### Category with Pagination
```javascript
const response = await fetch(
  'https://your-api.vercel.app/category/action/page/2?type=movies'
);
const data = await response.json();

// Access pagination
console.log(`Current page: ${data.data.pagination.currentPage}`);
console.log(`Total pages: ${data.data.pagination.totalPages}`);
```

## ⚠️ Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (missing required parameters)
- `404` - Not Found (content doesn't exist)
- `405` - Method Not Allowed (use GET)
- `500` - Internal Server Error

Always check the `success` field:

```javascript
const response = await fetch('https://your-api.vercel.app/series/invalid-slug');
const data = await response.json();

if (!data.success) {
  console.error(`Error: ${data.error}`);
  // Handle error
}
```

## 🗂 Project Structure

```
toonstream-api/
├── api/
│   ├── index.js          # Homepage scraper
│   ├── series.js         # Series details with seasons
│   ├── episode.js        # Episode details with servers
│   ├── series_page.js    # Series listing
│   ├── movies.js         # Individual movie details
│   ├── movies_page.js    # Movies listing
│   ├── search.js         # Search functionality
│   ├── category.js       # Category pages
│   ├── cast.js           # Cast member pages
│   ├── letter.js         # Alphabetical browsing
│   └── proxy.js          # Dynamic URL proxy
├── src/
│   └── baseurl.txt       # Base URL configuration
├── package.json
├── vercel.json           # Vercel configuration
├── .gitignore
└── README.md
```

## 📦 Dependencies

```json
{
  "dependencies": {
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12"
  }
}
```

## 🔐 Rate Limiting

Consider implementing rate limiting for production use:

```javascript
// Example using vercel.json
{
  "functions": {
    "api/**/*.js": {
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

## 🌐 CORS Configuration

CORS is enabled by default for all origins. To restrict:

```javascript
res.setHeader('Access-Control-Allow-Origin', 'https://yourdomain.com');
```

## 🚀 Performance Tips

1. **Use specific queries** - Request only what you need
2. **Cache responses** - Implement caching on your frontend
3. **Pagination** - Use pagination for large datasets
4. **Filter servers** - Request specific servers instead of all
5. **Parallel requests** - Use `Promise.all()` for multiple endpoints

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚖️ Disclaimer

This API is for educational purposes only. Please respect copyright laws and the terms of service of the source website.

## 📧 Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/senpaiorbit/toon_stream_api/issues)
- Contact: tanbirst2st2@gmail.com

## 🙏 Acknowledgments

- Built with [Vercel](https://vercel.com)
- Powered by [Cheerio](https://cheerio.js.org)
- HTTP requests via [Axios](https://axios-http.com)

---

Made with ❤️ by tanbirst1st1 
(https://github.com/senpaiorbit)
