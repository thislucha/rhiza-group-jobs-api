// Rule-based classifier — no external API calls, no cost.
// Keeps the same output shape the worker/scraper expect.

const CLIMATE_KEYWORDS = /climat|environ|sustain|green|energy|biodiver|nature|carbon|esg|renewable|circular|net.?zero|decarbon|emission|ecology|conservation|impact/i;

const SECTOR_RULES = [
  { sector: 'Policy & Advocacy', re: /policy|advoc|regulat|lobby|public affairs|legislat/i },
  { sector: 'Climate Tech', re: /climate tech|cleantech|carbon capture|battery|hydrogen|software engineer|developer|data scientist|ai\b/i },
  { sector: 'Green Finance', re: /finance|investment|esg fund|asset manag|banking|fintech|capital|impact invest/i },
  { sector: 'NGO / Nonprofit', re: /ngo|nonprofit|non-profit|charity|foundation|humanitarian/i },
  { sector: 'Research', re: /research|scientist|phd|postdoc|academic|study/i },
  { sector: 'Consulting', re: /consult|advisory|strategy/i },
  { sector: 'Renewable Energy', re: /solar|wind|renewable|energy transition|power plant|grid/i },
  { sector: 'ESG / Corporate', re: /esg|corporate sustainab|csrd|reporting|compliance/i },
  { sector: 'Nature & Biodiversity', re: /biodiversity|nature|conservation|forest|ocean|wildlife|ecosystem/i },
  { sector: 'Communications & Marketing', re: /communicat|marketing|pr\b|brand|content|social media|copywrit/i },
];

const LEVEL_RULES = [
  { lvl: 'Director+', re: /director|head of|vp\b|vice president|chief|executive/i },
  { lvl: 'Senior', re: /senior|sr\.|lead\b|principal|manager/i },
  { lvl: 'Entry', re: /intern|trainee|junior|graduate|entry.?level|assistant/i },
];

const TYPE_RULES = [
  { type: 'Internship', re: /intern(ship)?/i },
  { type: 'Traineeship', re: /trainee/i },
  { type: 'Part-time', re: /part.?time/i },
  { type: 'Contract', re: /contract|temporary|fixed.?term|freelance/i },
];

const MODE_RULES = [
  { mode: 'Remote', re: /remote|work from home|wfh|anywhere/i },
  { mode: 'Hybrid', re: /hybrid/i },
];

const COLOR_PALETTE = [
  { lc: '#E8F0E6', lt: '#1F4D2C' },
  { lc: '#D8E5F2', lt: '#163A7A' },
  { lc: '#F2EAE0', lt: '#6A3010' },
  { lc: '#FBE9D9', lt: '#8A4B00' },
  { lc: '#EFE6F4', lt: '#4B2E73' },
  { lc: '#FFF6D6', lt: '#7A5A00' },
];

function pickFirst(rules, text, fallback) {
  for (const r of rules) {
    const key = Object.keys(r)[0];
    if (r.re.test(text)) return r[key];
  }
  return fallback;
}

function extractTitle(rawText) {
  const firstLine = rawText.split('\n')[0].trim();
  return firstLine.slice(0, 120) || 'Untitled role';
}

function extractCompany(rawText, sourceUrl) {
  const m = rawText.match(/\bat ([A-Z][\w&.,'\- ]{2,40})/);
  if (m) return m[1].trim();
  try {
    const host = new URL(sourceUrl).hostname.replace('www.', '');
    return host.split('.')[0].replace(/^\w/, c => c.toUpperCase());
  } catch {
    return 'Unknown';
  }
}

function extractLocation(rawText) {
  const m = rawText.match(/\b(Remote|[A-Z][a-zA-Z]+(?:,\s*[A-Z][a-zA-Z]+)?)\b,?\s*(EU|UK|Europe|Remote)?/);
  return m ? m[0].trim() : 'Europe';
}

function guessTerritory(rawText, loc) {
  if (/remote/i.test(rawText) || /remote/i.test(loc)) return 'Remote';
  if (/\bUK\b|United Kingdom|London|Manchester|Edinburgh|Bristol/i.test(rawText)) return 'UK';
  return 'EU';
}

function hashColor(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function extractTags(rawText, sector) {
  const tags = new Set();
  const words = rawText.toLowerCase().match(/[a-z][a-z\-]{3,}/g) || [];
  const KEYWORD_TAGS = [
    'sustainability', 'climate', 'esg', 'policy', 'carbon', 'renewable',
    'biodiversity', 'strategy', 'reporting', 'net-zero', 'circular',
    'communications', 'finance', 'energy', 'research', 'consulting',
  ];
  for (const w of words) {
    for (const kw of KEYWORD_TAGS) {
      if (w.includes(kw.replace('-', '')) || w === kw) tags.add(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
    if (tags.size >= 6) break;
  }
  if (sector) tags.add(sector.split(' ')[0]);
  return [...tags].slice(0, 6);
}

export async function classifyJob(rawText, sourceUrl) {
  if (!rawText || !CLIMATE_KEYWORDS.test(rawText)) return null;

  const title = extractTitle(rawText);
  const co = extractCompany(rawText, sourceUrl);
  const loc = extractLocation(rawText);
  const territory = guessTerritory(rawText, loc);
  const mode = pickFirst(MODE_RULES, rawText, territory === 'Remote' ? 'Remote' : 'On-site');
  const sector = pickFirst(SECTOR_RULES, rawText, 'NGO / Nonprofit');
  const lvl = pickFirst(LEVEL_RULES, rawText, 'Mid');
  const type = pickFirst(TYPE_RULES, rawText, 'Full-time');
  const colors = hashColor(title + co);

  return {
    title,
    co,
    loc,
    territory,
    mode,
    type,
    sector,
    lvl,
    tags: extractTags(rawText, sector),
    inst: null,
    eu: territory === 'EU',
    feat: false,
    isNew: true,
    deadline: null,
    lc: colors.lc,
    lt: colors.lt,
  };
}
