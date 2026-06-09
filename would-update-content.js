#!/usr/bin/env node
// would-update-content.js — insert event analyses into GitHub could/ files, then email
// Usage: GITHUB_TOKEN=... GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_REFRESH_TOKEN=... ISSUE_ANALYSIS=... ASSET_ANALYSIS=... node would-update-content.js

const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_OWNER  = 'toiflow';
const GITHUB_REPO   = 'ts-event';
const ANCHOR        = '####### <!-- ANCHOR MARKER - ADD ALL NEW ENTRIES DIRECTLY BELOW THIS LINE, NEVER DELETE OR EDIT PREVIOUS ENTRIES-->';
const QUARTER       = (() => { const o = process.env.QUARTER_OVERRIDE; if (o) return o; const m = new Date().getMonth() + 1; return new Date().getFullYear() + 'Q' + Math.ceil(m / 3); })();

const ISSUE_HEADER = `ISSUE LOG
INSTRUCTION FOR AI MODEL:

ALWAYS ADD NEW ISSUE ENTRIES AT THE TOP, DIRECTLY BELOW THIS HEADER.

NEVER DELETE OR EDIT PREVIOUS ISSUE ENTRIES.

REQUIRED FORMAT FOR EACH ISSUE ENTRY:

## ISSUE:{NAME OF ENVIRONMENT} {YYYY-MM-DD HH:MM} → {CONTENT}

${ANCHOR}`;

const ASSET_HEADER = `ASSET LOG
INSTRUCTION FOR AI MODEL:

ALWAYS ADD NEW ASSET ENTRIES AT THE TOP, DIRECTLY BELOW THIS HEADER.

NEVER DELETE OR EDIT PREVIOUS ASSET ENTRIES.

REQUIRED FORMAT FOR EACH ASSET ENTRY:

## ASSET:{NAME OF ENVIRONMENT} {YYYY-MM-DD HH:MM} → {CONTENT}

${ANCHOR}`;

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_TO      = 'jayreck996@gmail.com';

function nzTimestamp() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function nzDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

async function githubGetOrCreate(path, header) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json' } }
  );
  if (res.status === 404) return { sha: null, content: header };
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status}`);
  const data = await res.json();
  return { sha: data.sha, content: Buffer.from(data.content, 'base64').toString('utf8') };
}

async function githubPut(path, sha, content, message) {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message, ...(sha ? { sha } : {}),
        content: Buffer.from(content).toString('base64'),
        committer: { name: 'ts-event', email: 'jayreck996@gmail.com' }
      })
    }
  );
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${await res.text()}`);
}

function insertEntry(fileContent, entry) {
  const idx = fileContent.indexOf(ANCHOR);
  if (idx === -1) throw new Error('Anchor marker not found');
  const at = idx + ANCHOR.length;
  return fileContent.slice(0, at) + '\n' + entry + '\n' + fileContent.slice(at);
}

async function refreshAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function buildMime(date, issueAnalysis, assetAnalysis) {
  const boundary = 'must_event_boundary_001';
  const filename  = `must-event-${date}.md`;
  const mdContent = `# must-event ${date}\n\n## Issues\n\n${issueAnalysis}\n\n## Assets\n\n${assetAnalysis}\n`;
  const mdBase64  = Buffer.from(mdContent).toString('base64');

  const raw = [
    `MIME-Version: 1.0`,
    `To: ${EMAIL_TO}`,
    `Subject: must-event`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `Tomorrow's calendar analysis — see attached ${filename}`,
    ``,
    `--${boundary}`,
    `Content-Type: text/markdown; charset=utf-8`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    mdBase64,
    ``,
    `--${boundary}--`
  ].join('\r\n');

  return Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sendEmail(date, issueAnalysis, assetAnalysis) {
  const token = await refreshAccessToken();
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: buildMime(date, issueAnalysis, assetAnalysis) })
  });
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`✅ Email sent: ${data.id}`);
}

async function main() {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set');
  const issueAnalysis = process.env.ISSUE_ANALYSIS?.trim();
  const assetAnalysis = process.env.ASSET_ANALYSIS?.trim();
  if (!issueAnalysis) throw new Error('ISSUE_ANALYSIS not set');
  if (!assetAnalysis) throw new Error('ASSET_ANALYSIS not set');

  const ts   = nzTimestamp();
  const date = nzDate();
  console.log(`📅 ${ts}`);

  const issueFile = await githubGetOrCreate(`could/CONTENT-ISSUE-${QUARTER}.md`, ISSUE_HEADER);
  await githubPut(
    `could/CONTENT-ISSUE-${QUARTER}.md`, issueFile.sha,
    insertEntry(issueFile.content, `## EVENT:ISSUE ${ts}\n${issueAnalysis}`),
    `would-update: issue ${ts}`
  );
  console.log(`✅ could/CONTENT-ISSUE-${QUARTER}.md updated`);

  const assetFile = await githubGetOrCreate(`could/CONTENT-ASSET-${QUARTER}.md`, ASSET_HEADER);
  await githubPut(
    `could/CONTENT-ASSET-${QUARTER}.md`, assetFile.sha,
    insertEntry(assetFile.content, `## EVENT:ASSET ${ts}\n${assetAnalysis}`),
    `would-update: asset ${ts}`
  );
  console.log(`✅ could/CONTENT-ASSET-${QUARTER}.md updated`);

  if (CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN) {
    await sendEmail(date, issueAnalysis, assetAnalysis);
  } else {
    console.warn('⚠️  Gmail env not set — skipping email');
  }

  console.log('\n✅ Done');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
