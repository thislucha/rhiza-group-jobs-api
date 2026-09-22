import { classifyJob } from './classifier.js';

const SOURCES = [
  {
    name: 'EEA',
    url: 'https://www.eea.europa.eu/en/about/careers/vacancies',
    parse: parseEEA,
    filter: false,
  },
  {
    name: 'IISD',
    url: 'https://community.iisd.org/feed/',
    parse: parseRSS,
    filter: true,
  },
  {
    name: 'Remotive',
    url: 'https://remotive.com/remote-jobs/feed',
    parse: parseRSS,
    filter: true,
  },
  {
    name: 'WeWorkRemotely',
    url: 'https://weworkremotely.com/categories/remote-nonprofit-and-environment-jobs.rss',
    parse: parseRSS,
    filter: false,
  },
  {
    name: 'ENDS Jobs',
    url: 'https://jobs.endsreport.com/feed',
    parse: parseRSS,
    filter: true,
  },

  // ── Disabled: URLs returned 404 / no longer serve RSS as of
  // 22 Sept 2026. Re-enable once a working feed URL is confirmed.
  // {
  //   name: 'CharityJob',
  //   url: 'https://www.charityjob.co.uk/rss/jobs?keywords=sustainability+OR+climate+OR+environment',
  //   parse: parseRSS,
  //   filter: false,
  // },
  // {
  //   name: 'EuroBrussels',
  //   url: 'https://www.eurobrussels.com/rss/jobs',
  //   parse: parseRSS,
  //   filter: true,
  // },
  // {
  //   name: 'Climatebase',
  //   url: 'https://climatebase.org/feed',
  //   parse: parseRSS,
  //   filter: true,
  // },
];

export async function scrapeAllSources(env) {
  const results = { scraped: 0, saved: 0, skipped: 0, errors: [] };

  for (const source of SOURCES) {
    try {
      const res = await fetch(source.url, {
        headers: { 'User-Agent': 'RhizaJobsBot/1.0' },
      });
      if (!res.ok) {
        results.errors.push(`${source.name}: HTTP ${res.status}`);
        continue;
      }
      const raw = await res.text();
      const items = await source.parse(raw, source);
      results.scraped += items.length;

      for (const item of items) {
        // Sources marked filter:true only keep items that pass the
        // climate/sustainability keyword check inside classifyJob.
        const classified = source.filter
          ? await classifyJob(item.text, item.url)
          : await classifyJob(item.text, item.url) || fallbackClassify(item, source);

        if (!classified) {
          results.skipped++;
          continue;
        }

        const job = {
          ...classified,
          url: item.url,
          src: source.name,
          date: item.date || new Date().toISOString(),
          addedAt: new Date().toISOString(),
        };

        await saveJob(env.JOBS_KV, job);
        results.saved++;
      }
    } catch (err) {
      results.errors.push(`${source.name}: ${err.message}`);
    }
  }

  return results;
}

// ── RSS PARSER ──
// Works for standard RSS 2.0 feeds (title, link, pubDate, description).
async function parseRSS(raw) {
  const items = [];
  const itemBlocks = raw.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');

    if (!title || !link) continue;

    const text = `${title}\n${stripHtml(description || '')}`.slice(0, 4000);

    items.push({
      url: link.trim(),
      date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      text,
    });
  }

  return items;
}

// ── EEA PARSER ──
// EEA's careers page is plain HTML, not RSS, so this extracts links
// that look like vacancy entries. More fragile than RSS by nature —
// if EEA changes their page structure, this is the first thing to check.
//
// Only scrapes the "Vacancies open for applications" section — stops
// at "Ongoing procedures" (selection already underway, no longer
// accepting applications — confirmed these still show a "Closed: ..."
// date even though they're not in "Previous vacancies") and well
// before "Previous vacancies" (years of expired postings). Confirmed
// against the live page on 22 Sept 2026.
async function parseEEA(raw, source) {
  const items = [];

  const ongoingIdx = raw.search(/Ongoing procedures/i);
  const previousIdx = raw.search(/Previous vacancies/i);
  const candidates = [ongoingIdx, previousIdx].filter(i => i > -1);
  const cutoffIdx = candidates.length ? Math.min(...candidates) : -1;
  const scope = cutoffIdx > -1 ? raw.slice(0, cutoffIdx) : raw;

  const linkBlocks = scope.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) || [];

  for (const block of linkBlocks) {
    const hrefMatch = block.match(/href="([^"]+)"/i);
    const textMatch = block.match(/>([\s\S]*?)<\/a>/i);
    if (!hrefMatch || !textMatch) continue;

    const label = stripHtml(textMatch[1]).trim();
    if (label.length < 8) continue;
    if (!/vacan|job|career|position/i.test(hrefMatch[1]) && !/officer|expert|manager|assistant/i.test(label)) continue;

    let href = hrefMatch[1];
    if (href.startsWith('/')) {
      const base = new URL(source.url);
      href = `${base.origin}${href}`;
    }

    items.push({
      url: href,
      date: new Date().toISOString(),
      text: label,
    });
  }

  // De-duplicate by URL — the EEA page tends to link the same
  // vacancy from more than one place (nav + list).
  const seen = new Set();
  return items.filter(i => (seen.has(i.url) ? false : seen.add(i.url)));
}

// ── FALLBACK CLASSIFICATION ──
// Used for sources marked filter:false, when classifyJob's own
// keyword check rejects an item but the source is already
// climate/sustainability-scoped by nature (e.g. WeWorkRemotely's
// environment category).
function fallbackClassify(item, source) {
  return {
    title: item.text.split('\n')[0].slice(0, 120) || 'Untitled role',
    co: source.name,
    loc: 'Europe',
    territory: 'EU',
    mode: 'Remote',
    type: 'Full-time',
    sector: 'NGO / Nonprofit',
    lvl: 'Mid',
    tags: [source.name],
    inst: null,
    eu: false,
    feat: false,
    isNew: true,
    deadline: null,
    lc: '#EFE6F4',
    lt: '#4B2E73',
  };
}

// ── HELPERS ──
function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
}

function stripHtml(str) {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── SAVE ──
// Duplicated from worker.js rather than imported, to avoid a
// circular import between scraper.js and worker.js.
async function saveJob(kv, job) {
  const id = btoa(job.url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  job.id = id;
  await kv.put(`job:${id}`, JSON.stringify(job), { expirationTtl: 60 * 60 * 24 * 60 });
  const index = (await kv.get('index', { type: 'json' })) || { ids: [] };
  if (!index.ids.includes(id)) {
    index.ids.unshift(id);
    index.ids = index.ids.slice(0, 500);
  }
  await kv.put('index', JSON.stringify(index));
}
