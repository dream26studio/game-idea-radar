#!/usr/bin/env python3
"""Collect proof-of-success data + screenshots for one Play Store app (US).
Usage: python3 tools/app_report.py <appId> <outdir> [--shots 4]
- Saves screenshots to <outdir>/shot-N.jpg (+ icon.jpg)
- Prints compact JSON (details, Sensor Tower revenue/download bands)
- Upserts data/apps.json so the app is never re-researched from scratch.
"""
import json, re, sys, os, io, datetime, urllib.request
from google_play_scraper import app as gp_app
from PIL import Image

def fetch(url, binary=False, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "ignore")

def sensortower(app_id):
    try:
        html = fetch(f"https://app.sensortower.com/overview/{app_id}?country=US")
        m = re.search(r'og:description" content="([^"]+)"', html)
        if not m:
            return {}
        d = m.group(1)
        dl = re.search(r"were ([0-9.,]+[km]?\+?(?:-[0-9.,]+[km])?) downloads", d)
        rv = re.search(r"downloads and (\$[0-9.,]+[km]?\+?(?:-\$[0-9.,]+[km])?) revenue", d)
        rank = re.search(r"rankings among ([a-z ]+) apps", d)
        return {"st_downloads_last_month": dl.group(1) if dl else None,
                "st_revenue_last_month": rv.group(1) if rv else None,
                "st_category": rank.group(1) if rank else None}
    except Exception as e:
        return {"st_error": str(e)[:80]}

def main():
    app_id, outdir = sys.argv[1], sys.argv[2]
    shots = int(sys.argv[sys.argv.index("--shots") + 1]) if "--shots" in sys.argv else 4
    os.makedirs(outdir, exist_ok=True)
    a = gp_app(app_id, lang="en", country="us")
    saved = []
    for i, u in enumerate((a.get("screenshots") or [])[:shots], 1):
        try:
            im = Image.open(io.BytesIO(fetch(u + "=w540-h960", binary=True))).convert("RGB")
            im.thumbnail((360, 640))  # ~40KB each: keeps the repo small
            im.save(f"{outdir}/shot-{i}.jpg", "JPEG", quality=72, optimize=True)
            saved.append(f"shot-{i}.jpg")
        except Exception as e:
            print(f"WARN screenshot {i}: {e}", file=sys.stderr)
    try:
        Image.open(io.BytesIO(fetch(a["icon"] + "=w128", binary=True))).convert("RGB").save(f"{outdir}/icon.jpg", "JPEG", quality=80)
    except Exception:
        pass
    st = sensortower(app_id)
    out = {
        "appId": app_id, "title": a["title"], "developer": a["developer"],
        "installs": a.get("installs"), "realInstalls": a.get("realInstalls"),
        "score": round(a["score"], 2) if a.get("score") else None, "ratings": a.get("ratings"),
        "released": a.get("released"), "updated": datetime.datetime.fromtimestamp(a["updated"]).strftime("%Y-%m-%d") if a.get("updated") else None,
        "version": a.get("version"), "genre": a.get("genre"), "free": a.get("free"),
        "containsAds": a.get("containsAds"), "offersIAP": a.get("offersIAP"), "iapRange": a.get("inAppProductPrice"),
        "summary": a.get("summary"), "description": (a.get("description") or "")[:900],
        "playUrl": f"https://play.google.com/store/apps/details?id={app_id}&hl=en&gl=us",
        "screenshots_saved": saved, **st,
    }
    # upsert cache
    p = "data/apps.json"
    try:
        db = json.load(open(p))
    except Exception:
        db = {}
    today = datetime.date.today().isoformat()
    db[app_id] = {**db.get(app_id, {}), "title": out["title"], "developer": out["developer"], "lastResearched": today,
                  "realInstalls": out["realInstalls"], "score": out["score"], "ratings": out["ratings"], "released": out["released"],
                  "st_revenue_last_month": st.get("st_revenue_last_month"), "st_downloads_last_month": st.get("st_downloads_last_month")}
    json.dump(db, open(p, "w"), indent=1, sort_keys=True)
    print(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
