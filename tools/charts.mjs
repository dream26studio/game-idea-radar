// Fetch US Google Play charts and diff against the previous snapshot.
// Output: data/charts/<date>.json, data/candidates.json, and a compact stdout table.
// Zero LLM tokens spent here. Usage: npm run charts [YYYY-MM-DD]
import gplay from 'google-play-scraper';
import fs from 'node:fs';

const today = process.argv[2] || new Date().toISOString().slice(0, 10);
const CATS = ['GAME_PUZZLE', 'GAME_CASUAL', 'GAME_WORD', 'GAME_CARD', 'GAME_BOARD', 'GAME_SIMULATION', 'GAME_TRIVIA'];
const COLS = ['TOP_FREE', 'GROSSING'];
const NUM = 30;
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };

const apps = readJson('data/apps.json', {});
const ideas = readJson('data/ideas.json', []);
const usedIds = new Set(ideas.map((i) => i.basedOnAppId).filter(Boolean));

const snap = {};
for (const cat of CATS) {
  for (const col of COLS) {
    const key = `${cat}:${col}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const list = await gplay.list({ collection: gplay.collection[col], category: gplay.category[cat], country: 'us', lang: 'en', num: NUM });
        snap[key] = list.map((a, i) => ({ rank: i + 1, appId: a.appId, title: a.title, developer: a.developer, score: a.score ? +a.score.toFixed(2) : null }));
        break;
      } catch (e) {
        if (attempt === 2) { snap[key] = []; console.error(`WARN ${key}: ${e.message}`); }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}
fs.mkdirSync('data/charts', { recursive: true });
fs.writeFileSync(`data/charts/${today}.json`, JSON.stringify(snap));

// previous snapshot = newest file older than today
const prevFile = fs.readdirSync('data/charts').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${today}.json`).sort().pop();
const prev = prevFile ? readJson(`data/charts/${prevFile}`, {}) : null;

// aggregate per app
const agg = {};
for (const [key, list] of Object.entries(snap)) {
  const [cat, col] = key.split(':');
  const prevList = prev?.[key] || [];
  for (const a of list) {
    const x = (agg[a.appId] ||= { appId: a.appId, title: a.title, developer: a.developer, score: a.score, free: null, gross: null, cats: new Set(), newEntry: false, bestRise: 0 });
    x.cats.add(cat);
    const pr = prevList.find((p) => p.appId === a.appId)?.rank;
    const field = col === 'TOP_FREE' ? 'free' : 'gross';
    if (x[field] === null || a.rank < x[field]) x[field] = a.rank;
    if (prev) {
      if (!pr) x.newEntry = true; else x.bestRise = Math.max(x.bestRise, pr - a.rank);
    }
  }
}
const rows = Object.values(agg).map((x) => ({
  ...x, cats: [...x.cats],
  researched: apps[x.appId]?.lastResearched || null,
  usedForIdea: usedIds.has(x.appId),
  // simple heuristic: strong grossing rank + strong free rank + momentum
  score_rank: (x.gross ? (31 - x.gross) * 2 : 0) + (x.free ? (31 - x.free) : 0) + (x.newEntry ? 15 : 0) + Math.min(x.bestRise, 20),
})).sort((a, b) => b.score_rank - a.score_rank);

fs.writeFileSync('data/candidates.json', JSON.stringify({ date: today, prevSnapshot: prevFile || null, candidates: rows }, null, 1));

// prune old snapshots (keep 14)
const files = fs.readdirSync('data/charts').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(`data/charts/${f}`);

console.log(`snapshot ${today} (prev: ${prevFile || 'none'}) | unique apps: ${rows.length}`);
console.log('appId | title | freeRank | grossRank | cats | flags');
for (const r of rows.filter((r) => !r.usedForIdea).slice(0, 30)) {
  const flags = [r.newEntry && 'NEW', r.bestRise >= 5 && `+${r.bestRise}`, r.researched && `seen:${r.researched}`].filter(Boolean).join(',');
  console.log(`${r.appId} | ${r.title} | F${r.free ?? '-'} | G${r.gross ?? '-'} | ${r.cats.map((c) => c.replace('GAME_', '')).join('/')} | ${flags}`);
}
