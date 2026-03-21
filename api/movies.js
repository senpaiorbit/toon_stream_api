// api/movies.js
export const config = { runtime: 'edge' };

import { fetchPage, getBaseUrl } from '../lib/scrape.js';
import { normalizeImage, json, guardMethod } from '../lib/helper.js';

function scrapeMovieDetails(html) {
  const m  = (re) => html.match(re)?.[1] ?? null;
  const ms = (re) => html.match(re)?.[1] ?? '';

  const genresBlock   = m(/<span[^>]*class="[^"]*genres[^"]*"[^>]*>(.*?)<\/span>/s) ?? '';
  const tagsBlock     = m(/<span[^>]*class="[^"]*tag[^"]*"[^>]*>(.*?)<\/span>/s) ?? '';
  const castListBlock = m(/<ul[^>]*class="[^"]*cast-lst[^"]*"[^>]*>([\s\S]*?)<\/ul>/) ?? '';

  const genres = [...genresBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
    .map(lm => ({ name: lm[2].trim(), url: lm[1] }));
  const tags = [...tagsBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)]
    .map(lm => ({ name: lm[2].trim(), url: lm[1] }));

  const dirBlock = castListBlock.match(/<li[^>]*>[\s\S]*?<span>Director<\/span>[\s\S]*?<p[^>]*>(.*?)<\/p>/s)?.[1] ?? '';
  const cstBlock = castListBlock.match(/<li[^>]*>[\s\S]*?<span>Cast<\/span>[\s\S]*?<p[^>]*>(.*?)<\/p>/s)?.[1] ?? '';
  const directors = [...dirBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(lm => ({ name: lm[2].trim(), url: lm[1] }));
  const cast      = [...cstBlock.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map(lm => ({ name: lm[2].trim(), url: lm[1] }));

  // description paragraphs
  const descBlock = m(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/) ?? '';
  let description = '', language = '', quality = '', runningTime = '';
  const additionalInfo = [];
  for (const p of [...descBlock.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]) {
    const text = p[1].replace(/<[^>]+>/g, '').trim();
    if (!text) continue;
    if (text.startsWith('Language:'))     { language     = text.replace('Language:', '').trim();     additionalInfo.push(text); }
    else if (text.startsWith('Quality:')) { quality      = text.replace('Quality:', '').trim();      additionalInfo.push(text); }
    else if (text.startsWith('Running time:')) { runningTime = text.replace('Running time:', '').trim(); additionalInfo.push(text); }
    else if (!description) description = text;
  }

  return {
    title:       m(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h1>/)?.trim() ?? '',
    posterImage: normalizeImage(m(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)),
    posterAlt:   m(/<div[^>]*class="[^"]*post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]+alt="([^"]+)"/) ?? '',
    backdrop: {
      header: normalizeImage(m(/<div[^>]*class="[^"]*bghd[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)),
      footer: normalizeImage(m(/<div[^>]*class="[^"]*bgft[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)),
    },
    genres, tags,
    duration:    ms(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(.*?)<\/span>/).replace(/<[^>]+>/g, '').trim(),
    year:        ms(/<span[^>]*class="[^"]*year[^"]*"[^>]*>(\d{4})<\/span>/),
    description, language, quality, runningTime, additionalInfo,
    directors, cast,
    rating: ms(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*num[^"]*"[^>]*>([\d.]+)<\/span>/),
    ratingSource: 'TMDB',
  };
}

function scrapeVideoOptions(html, apiBase) {
  const languages = [...html.matchAll(
    /<span[^>]+tab="(ln\d+)"[^>]*class="[^"]*btn([^"]*)"[^>]*>(.*?)<\/span>/g
  )].map(m => ({ language: m[3].trim(), tabId: m[1], active: m[2].includes('active') }));

  const servers = [...html.matchAll(
    /<div[^>]+id="(ln\d+)"[^>]*class="[^"]*lrt([^"]*)"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]+id="ln\d+"|<\/div>)/g
  )].map(sec => ({
    languageId: sec[1],
    active:     sec[2].includes('active'),
    servers: [...sec[3].matchAll(
      /<a[^>]+class="[^"]*btn([^"]*)"[^>]+href="#(options-\d+)"[^>]*>[\s\S]*?Sever\s*<span>(\d+)<\/span>[\s\S]*?<span[^>]*class="[^"]*server[^"]*"[^>]*>([\s\S]*?)<\/span>/g
    )].map(s => ({
      serverNumber:  s[3].trim(),
      serverName:    s[4].replace(/-Hindi-Eng-Jap|-Hindi-Eng/g, '').trim(),
      targetId:      s[2],
      active:        s[1].includes('on'),
    })),
  }));

  const iframes = [...html.matchAll(
    /<div[^>]+id="(options-\d+)"[^>]*class="[^"]*video([^"]*)"[^>]*>[\s\S]*?<iframe[^>]+(?:src|data-src)="([^"]+)"/g
  )].map(m => ({
    optionId:    m[1],
    active:      m[2].includes('on'),
    originalSrc: m[3],
    src:         `${apiBase}/api/embed?url=${encodeURIComponent(m[3])}`,
  }));

  return { languages, servers, iframes };
}

function scrapeComments(html) {
  return [...html.matchAll(
    /<li[^>]+id="(comment-\d+)"[^>]*>[\s\S]*?<article[^>]*>([\s\S]*?)<\/article>/g
  )].map(m => {
    const c = m[2];
    return {
      id:          m[1],
      author:      c.match(/<b[^>]*class="[^"]*fn[^"]*"[^>]*>(.*?)<\/b>/)?.[1]?.trim() ?? '',
      avatar:      c.match(/<img[^>]+src='([^']+)'/)?.[1] ?? '',
      date:        c.match(/<time[^>]+datetime="([^"]+)"/)?.[1] ?? '',
      dateText:    c.match(/<time[^>]+datetime="[^"]+"[^>]*>(.*?)<\/time>/)?.[1]?.trim() ?? '',
      content:     c.match(/<div[^>]*class="[^"]*comment-content[^"]*"[^>]*>[\s\S]*?<p[^>]*>(.*?)<\/p>/)?.[1]?.trim() ?? '',
      url:         c.match(/<a[^>]+href="([^"#]+#comment-\d+)"/)?.[1] ?? '',
    };
  });
}

function scrapeRelatedMovies(html) {
  const block = html.match(
    /<section[^>]*class="[^"]*section episodes[^"]*"[^>]*>[\s\S]*?<h3[^>]*>Related movies<\/h3>[\s\S]*?<div[^>]*class="[^"]*owl-carousel[^"]*"[^>]*>([\s\S]*?)<\/div>/
  )?.[1];
  if (!block) return [];
  return [...block.matchAll(/<article[^>]*class="[^"]*post dfx fcl movies[^"]*"[^>]*>([\s\S]*?)<\/article>/g)].map(a => {
    const c = a[1];
    return {
      title:    c.match(/<h2[^>]*class="[^"]*entry-title[^"]*"[^>]*>(.*?)<\/h2>/)?.[1]?.replace(/&#038;/g,'&').trim() ?? '',
      image:    normalizeImage(c.match(/<img[^>]+src="([^"]+)"/)?.[1]),
      imageAlt: c.match(/<img[^>]+alt="([^"]+)"/)?.[1] ?? '',
      url:      c.match(/<a[^>]+href="([^"]+)"[^>]*class="lnk-blk"/)?.[1] ?? '',
      rating:   c.match(/<span[^>]*class="[^"]*vote[^"]*"[^>]*>[\s\S]*?<span>TMDB<\/span>\s*([\d.]+)/)?.[1] ?? '',
    };
  });
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const url  = new URL(request.url);
    const path = url.searchParams.get('path');
    if (!path) return json({ success: false, error: 'Parameter "path" is required.' }, 400);

    const { html, baseUrl } = await fetchPage(`/movies/${path}/`);
    const apiBase    = `${url.protocol}//${url.host}`;
    const postId     = html.match(/postid-(\d+)/)?.[1] ?? null;
    const details    = scrapeMovieDetails(html);
    const video      = scrapeVideoOptions(html, apiBase);
    const comments   = scrapeComments(html);
    const related    = scrapeRelatedMovies(html);

    return json({
      success: true,
      data: {
        baseUrl,
        movieUrl:      `${baseUrl}/movies/${path}/`,
        moviePath:     path,
        postId,
        scrapedAt:     new Date().toISOString(),
        movieDetails:  details,
        videoOptions:  video,
        comments,
        relatedMovies: related,
      },
      stats: {
        hasMovieDetails:   true,
        hasBackdrop:       !!(details.backdrop.header || details.backdrop.footer),
        videoOptionsCount: video.iframes.length,
        commentsCount:     comments.length,
        relatedMoviesCount: related.length,
      },
    });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
