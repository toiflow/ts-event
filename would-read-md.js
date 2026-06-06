#!/usr/bin/env node
// would-read-md.js — fetch tomorrow's Google Calendar events from 'would' + 'could' calendars
// Env: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const CALENDAR_NAMES = ['would', 'could'];

async function refreshAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token'
    })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

function tomorrowNZ() {
  const todayNZ = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const d = new Date(todayNZ + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function nzOffset() {
  const now = new Date();
  const nz  = new Date(now.toLocaleString('en-US', { timeZone: 'Pacific/Auckland' }));
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const h   = Math.round((nz - utc) / 3600000);
  return `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`;
}

async function calGet(token, path) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Calendar GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

function formatTime(dateTime) {
  if (!dateTime) return 'all day';
  return new Date(dateTime).toLocaleTimeString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN required');
  }

  const token  = await refreshAccessToken();
  const date   = tomorrowNZ();
  const offset = nzOffset();
  const timeMin = `${date}T00:00:00${offset}`;
  const timeMax = `${date}T23:59:59${offset}`;

  const calList   = await calGet(token, 'users/me/calendarList');
  const calendars = (calList.items || []).filter(c =>
    CALENDAR_NAMES.includes(c.summary?.toLowerCase())
  );

  if (calendars.length === 0) {
    console.error(`No calendars named: ${CALENDAR_NAMES.join(', ')}`);
    process.exit(1);
  }

  const items = [];
  for (const cal of calendars) {
    const params = new URLSearchParams({
      timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', timeZone: 'Pacific/Auckland'
    });
    const data = await calGet(token, `calendars/${encodeURIComponent(cal.id)}/events?${params}`);
    for (const e of (data.items || [])) {
      let line = `Calendar: ${cal.summary} | Title: ${e.summary || '(no title)'} | Time: ${formatTime(e.start?.dateTime)} - ${formatTime(e.end?.dateTime)}`;
      if (e.location) line += ` | Location: ${e.location}`;
      items.push(line);
    }
  }

  if (items.length === 0) {
    console.error(`No events found for ${date}`);
    process.exit(1);
  }

  process.stdout.write(items.join('\n'));
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
