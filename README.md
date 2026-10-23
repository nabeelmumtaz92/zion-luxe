# Zion Luxe — private lead tool (runs on the owner's Mac only)

`node server.js` → http://localhost:8799 (bound to localhost; not a public site).
- `scraper.js` reads public Reddit RSS feeds every 15 min (subs set by `SUBREDDITS`), filters for people planning a premium trip, has the AI qualify/extract details, and adds leads. It never posts, replies or messages anyone.
- `itinerary/` writes a draft itinerary for each lead (Claude via Claude Code first, then free-tier Gemini/Groq/OpenRouter/Mistral; keys in `~/.zion-luxe/.env`). Rule-checked: no prices, guarantees, affiliations.
- `inquiries.html` is the dashboard: open the original post, edit/copy the draft, set status and follow-up.
- `site/` is the earlier Phase 1 landing page (not deployed; kept for later). `zion.html`, `scraper-worker.js`, `leads.json` are the original mock dashboard with simulated leads.
- Data lives in `data/` (git-ignored).
