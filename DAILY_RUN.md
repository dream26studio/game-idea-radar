# DAILY RUN: instructions for the scheduled cloud session

You are the daily game-idea scout. Goal: deliver **2 mobile game ideas per day** from what is
trending in the **US Google Play Store**, with proof it works. Be token-efficient: the scripts
do the data work, you do the judging and writing. Never re-research an app already in `data/apps.json`
unless its `lastResearched` is older than 30 days.

Run date = today's date in IST (`TZ=Asia/Kolkata date +%F`). Call it `$D`.

## 0. Setup (once per run)
```bash
npm ci --silent && pip install -q -r requirements.txt
export NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt   # proxy CA, if the file exists
```

## 1. Read state (small files only, do NOT read all of ideas/)
- `data/ideas.json`: every idea ever delivered (dedupe by `basedOnAppId` and `mechanicTags`).
- `data/feedback.md`: the owner's likes/dislikes. Honour it (more of what they liked, none of what they rejected).
- `data/questions.md`: if the owner answered a question there, apply it, then move it to "Answered".
- `data/apps.json`: cache of apps already researched (installs, rating, revenue bands).

## 2. Get chart data (0 LLM tokens)
```bash
npm run charts "$D"
```
Writes `data/charts/$D.json` and `data/candidates.json` (US Top Free + Top Grossing across Puzzle, Casual,
Word, Card, Board, Simulation, Trivia, ranked by a momentum/gross heuristic; flags `NEW`, `+N` rise, `seen:date`).
Only open `data/candidates.json` if the printed table is not enough.

## 3. Pick 2 ideas
Focus: **casual puzzle** (sort/flow/match/merge/block/jigsaw/word/card/solitaire/pin-pull/bolt/yarn/ant etc.), other
casual genres allowed when strongly trending. Prefer Tier-1 (US) momentum: new entrants and risers in Top Free
that ALSO have a decent Top Grossing rank, or high-grossing games with a mechanic simple enough for a small team.

- **Idea A: EXACT CLONE.** A game already working on the Play Store (proven installs + rating + chart rank + revenue
  band). We rebuild the **same mechanics, core loop, level structure, monetization pattern**, with **different
  name, theme, art, UI, audio** (new assets). Never copy names, art, code or characters.
- **Idea B: NEW TWIST.** Take a proven mechanic and add ONE fresh idea (new theme/verb/rule/meta-loop) that keeps the
  loop proven but makes it distinct, e.g. "color sort, but with ants building a colony". The twist must be explainable in one sentence and
  testable by a prototype in under a week.

Rules: not the same `basedOnAppId` or the same mechanic tag set as any entry in `data/ideas.json`;
do not suggest the mega-franchises (Candy Crush, Royal Match, etc.) as the clone target unless the
mechanic is cheap to copy and not tied to heavy content; prefer 6-month-old or newer hits and indie/hybrid-casual.

## 4. Collect proof (only for the 2-3 apps you actually use)
```bash
python3 -I tools/app_report.py <appId> ideas/$D/<slug> --shots 4
```
Gives installs, rating, release/update dates, IAP range, ads flag, Sensor Tower last-month download and revenue
**bands**, screenshots (`shot-1..4.jpg`) and icon in `ideas/$D/<slug>/`, and caches it in `data/apps.json`.
Revenue honesty: Sensor Tower public pages only give coarse bands (for example "$1m-$10m"), and the Top Grossing rank
is the second signal. Always label revenue as an **estimate** with source + confidence (High/Med/Low). Never invent numbers.
If a source is blocked or empty, say so.

## 5. Write `ideas/$D/report.md`
Use exactly this structure for each of the two ideas (A, B). Keep it scannable on a phone.

```
# Game ideas: $D (US Google Play)

## Idea A, EXACT CLONE: <our working name>
**Based on:** [<Game>](<playUrl>) by <dev>   |   **Genre/mechanic tags:** ...
**Why it works (proof):** installs, rating (n ratings), released, last updated, US chart ranks (Free #x / Grossing #y),
estimated monthly revenue band + downloads band (source, confidence)
**Gameplay in 5 lines:** core action → rules → win/lose → level progression → meta loop
**Monetization they use:** ads / IAP / battle pass / etc. and prices
**What we change (assets):** theme, art style, characters, UI, sounds, name ideas
**Reference screens:** ![](<slug>/shot-1.jpg) ![](<slug>/shot-2.jpg) ![](<slug>/shot-3.jpg) ![](<slug>/shot-4.jpg)
**Build estimate:** complexity (Low/Med/High), core systems list, 1-line MVP scope
**Risks:** (saturation, ad costs, content treadmill, IP closeness)

## Idea B, NEW TWIST: <our working name>
(same fields; "Based on" = the proven mechanic/game it twists; add **The twist** and **Why it should work**.
Reference screens = the base game screens + a short text wireframe of our twisted screen.)

## Questions for you (only if truly needed)
```
End with a one-line **recommendation** (which of the two to build first and why).

## 6. Update memory (this is what saves tokens tomorrow)
- Append both ideas to `data/ideas.json`: `{date, type:"clone"|"twist", name, basedOnAppId, mechanicTags[], oneLiner, report:"ideas/$D/report.md"}`.
- Add one row per idea to the table in `ideas/README.md` (newest on top): date, type, name, based on, est. revenue band, link.
- `data/apps.json` is already updated by the tool.
- Delete screenshots for apps NOT used in the report.

## 7. Questions
If you are unsure about direction (e.g. target platform, art style, genre priority, a source that now needs a key),
add ONE short question to `data/questions.md` under "Open" and mention it at the end of the report.
Do not block the run on it, make a sensible default and say which.

## 8. Commit and push
```bash
git add -A && git commit -m "Daily ideas $D" && git push origin HEAD:main
```
Retry the push up to 4 times with backoff on network errors. Never force-push. Final message: 5 lines max,
the two idea names + the report path.

## Failure handling
- Charts script fails (blocked/changed API): fall back to `WebFetch`/`curl` on
  `https://play.google.com/store/apps/category/GAME_PUZZLE?hl=en&gl=us`, note it in the report, and add a question.
- If fewer than 2 good unseen candidates exist today, pick the best unseen mechanic variant rather than repeating an old app.
