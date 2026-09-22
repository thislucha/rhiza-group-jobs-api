# Rhiza Jobs API

A climate & sustainability job board for the EU, UK, and remote-friendly
roles, built for Rhiza Group (rhizagroup.com/resources/jobs/).

**Status: active development.**

## What it does

The system scrapes job listings from several climate/sustainability-focused
sources (RSS feeds and one HTML career page), classifies each listing with
a rule-based classifier, and serves them through an API consumed by a
static frontend.

## Architecture

- **`worker.js`** — Cloudflare Worker exposing the API (`GET /api/jobs`,
  `POST /api/jobs/ingest`, `POST /api/jobs/scrape`, `DELETE /api/jobs/:id`)
  and a scheduled handler that triggers scraping on a cron.
- **`scraper.js`** — Pulls listings from each configured source, parses
  them (RSS or HTML depending on the source), and saves new jobs to
  Cloudflare KV.
- **`classifier.js`** — Rule-based classifier (no external API calls, no
  cost). Determines sector, seniority level, job type, work mode, and
  tags from keyword matching.
- **`index.html`** — Static frontend: filterable, sortable job listing UI
  with EU-institution highlighting, source filters, and territory tabs.

## Why rule-based, not LLM-based

The classifier runs entirely on regex/keyword rules — no Anthropic API
dependency, no per-job cost. Trades some nuance for zero marginal cost at
scale.

## Data sources

| Source | Type | Status |
|---|---|---|
| EEA (European Environment Agency) | HTML scrape | Active |
| IISD | RSS | Active |
| Remotive | RSS | Active |
| WeWorkRemotely | RSS | Active |
| ENDS Jobs | RSS | Active |
| CharityJob | RSS | Disabled — feed URL returned 404 as of Sept 2026 |
| EuroBrussels | RSS | Disabled — feed URL returned 404 as of Sept 2026 |
| Climatebase | RSS | Disabled — feed URL returned 404 as of Sept 2026 |

Disabled sources are commented out in `scraper.js` with the date they
were found broken. Re-enable once a working feed URL is confirmed.

## Known limitations

- The EEA parser extracts vacancy links by keyword-matching link text
  and hrefs — it's inherently more fragile than RSS parsing. If EEA
  changes their page structure, this is the first place to check.
- No test coverage yet against live production data — the scraper logic
  has been validated against each source's actual feed/page structure,
  but not run end-to-end inside the deployed Worker.

## Tech stack

Cloudflare Workers, Cloudflare KV (storage), vanilla JS frontend — no
frameworks, no build step.

---
Built by [Luchi López Noriega](https://github.com/thislucha) for Rhiza Group.
