// api/extra.js
export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scrape.js';
import { scrapePostList, json, guardMethod } from '../lib/helper.js';

function extractMenu(html) {
  const menu = [];
  const block = html.match(/<ul class="menu dfxc dv or-1">([\s\S]*?)<\/ul>/)?.[1];
  if (!block) return menu;
  for (const m of block.matchAll(
    /<li[^>]*id="menu-item-(\d+)"[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/li>(?=\s*(?:<li|<\/ul))/g
  )) {
    const [, id, classes, content] = m;
    const link = content.match(/<a href="([^"]+)">([^<]+)<\/a>/);
    if (!link) continue;
    const item = {
      id: parseInt(id), title: link[2].trim(), url: link[1].trim(),
      hasChildren: classes.includes('menu-item-has-children'), children: [],
    };
    if (item.hasChildren) {
      const sub = content.match(/<ul class="sub-menu">([\s\S]*?)<\/ul>/)?.[1];
      if (sub) {
        for (const sm of sub.matchAll(/<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/g))
          item.children.push({ id: parseInt(sm[1]), title: sm[3].trim(), url: sm[2].trim() });
      }
    }
    menu.push(item);
  }
  return menu;
}

function extractFooter(html) {
  const block = html.match(/<nav class="top dfxc alg-cr">[\s\S]*?<ul class="menu[^"]*">([\s\S]*?)<\/ul>/)?.[1];
  if (!block) return [];
  return [...block.matchAll(/<li[^>]*id="menu-item-(\d+)"[^>]*>[\s\S]*?<a(?:[^>]*rel="([^"]*)")?[^>]*href="([^"]+)">([^<]+)<\/a>/g)]
    .map(m => ({ id: parseInt(m[1]), rel: m[2] || null, url: m[3].trim(), title: m[4].trim() }));
}

function extractSchedule(html) {
  const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const schedule = {};
  for (const day of days) {
    const dayRe = new RegExp(
      `<div[^>]*class="custom-tab-pane[^"]*"[^>]*id="${day}"[^>]*>([\\s\\S]*?)<\\/div>\\s*(?=<div class="custom-tab-pane|<\\/div>\\s*<\\/div>)`, 'i'
    );
    const block = html.match(dayRe)?.[1] ?? '';
    const items = [...block.matchAll(
      /<li class="custom-schedule-item">[\s\S]*?<span class="schedule-time">([^<]+)<\/span>[\s\S]*?<p class="schedule-description">([^<]+)<\/p>[\s\S]*?<\/li>/g
    )].map(m => ({ time: m[1].trim(), description: m[2].trim() }));
    schedule[day] = { day: day.charAt(0).toUpperCase() + day.slice(1), items, count: items.length };
  }
  return schedule;
}

function extractLogo(html) {
  const m = html.match(/<figure class="logo[^"]*">[\s\S]*?<a href="([^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]+)"/);
  return m ? { url: m[1], image: m[2], alt: m[3] } : null;
}

function extractCopyright(html) {
  const m = html.match(/<center>[\s\S]*?<p>\s*([^<]+)\s*<\/p>[\s\S]*?<p>\s*(Copyright[^<]+)\s*<\/p>/);
  return m ? { disclaimer: m[1].trim(), copyright: m[2].trim() } : null;
}

export default async function handler(request) {
  const guard = guardMethod(request);
  if (guard) return guard;

  try {
    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section');
    const query   = searchParams.get('s') || '';

    // Root path — not /home
    const path = query ? `/?s=${encodeURIComponent(query)}` : '/';
    const { html } = await fetchPage(path);

    const parsed = {
      logo:         extractLogo(html),
      menu:         extractMenu(html),
      footer:       extractFooter(html),
      schedule:     extractSchedule(html),
      randomSeries: scrapePostList(html, 'widget_list_movies_series-4'),
      randomMovies: scrapePostList(html, 'widget_list_movies_series-5'),
      copyright:    extractCopyright(html),
    };

    const sectionMap = {
      '1': 'menu',       menu: 'menu',
      '2': 'footer',     footer: 'footer',
      '3': 'schedule',   schedule: 'schedule',
      '4': 'randomSeries', randomseries: 'randomSeries', 'random-series': 'randomSeries',
      '5': 'randomMovies', randommovies: 'randomMovies', 'random-movies': 'randomMovies',
      logo: 'logo', copyright: 'copyright',
    };

    if (section) {
      const key = sectionMap[section.toLowerCase()];
      if (!key) return json({
        success: false,
        error: 'Invalid section.',
        availableSections: Object.keys(sectionMap).filter(k => isNaN(k)),
      }, 400);
      return json({ success: true, section: key, query: query || null, data: parsed[key], timestamp: new Date().toISOString() });
    }

    return json({ success: true, query: query || null, data: parsed, timestamp: new Date().toISOString() });
  } catch (err) {
    return json({ success: false, error: err.message }, 500);
  }
}
