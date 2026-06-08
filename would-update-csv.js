#!/usr/bin/env node
// would-update-csv.js â€” append daily asset analysis row to would/LOG-METRIC-V1.csv
// Usage: GITHUB_TOKEN=... ASSET_ANALYSIS=... node would-update-csv.js

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const QUARTER = getCurrentQuarter(process.env.QUARTER_OVERRIDE);

function getCurrentQuarter(override) {
  if (override) return override;
  const now = new Date();
  return `${now.getFullYear()}Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

const GITHUB_OWNER = 'toiflow';
const GITHUB_REPO  = 'ts-event';
const CSV_PATH     = `would/LOG-METRIC-${QUARTER}.csv`;
const HEADERS      = 'date,asset_analysis\n';

function nzDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function toCsvRow(date, text) {
  const flat = text.replace(/\r?\n/g, ' | ').replace(/"/g, '""');
  return `${date},"${flat}"\n`;
}

async function githubGet(path) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' } }
  );
  if (res.status === 404) return { sha: null, content: HEADERS };
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
}

async function githubPut(path, sha, content, message) {
  const body = { message, content: Buffer.from(content).toString('base64'), committer: { name: 'ts-event', email: 'jayreck996@gmail.com' } };
  if (sha) body.sha = sha;
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
}

async function main() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set');
  const assetAnalysis = process.env.ASSET_ANALYSIS?.trim();
  if (!assetAnalysis) throw new Error('ASSET_ANALYSIS not set');

  const date = nzDate();
  const { sha, content } = await githubGet(CSV_PATH);
  const updated = content + toCsvRow(date, assetAnalysis);
  await githubPut(CSV_PATH, sha, updated, `would-update: log ${date}`);
  console.log(`âœ… ${CSV_PATH} updated`);
}

main().catch(e => { console.error('âŒ', e.message); process.exit(1); });
