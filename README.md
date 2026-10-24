# Zion Luxe — private lead tool (runs on the owner's Mac only)

`node server.js` → http://localhost:8799 (bound to localhost; not a public site).
- `scraper.js` reads public Reddit RSS feeds every 15 min (subs set by `SUBREDDITS`), filters for people planning a premium trip, has the AI qualify/extract details, and adds leads. It never posts, replies or messages anyone.
- `itinerary/` writes a draft itinerary for each lead (Claude via Claude Code first, then free-tier Gemini/Groq/OpenRouter/Mistral; keys in `~/.zion-luxe/.env`). Rule-checked: no prices, guarantees, affiliations.
- `inquiries.html` is the dashboard: open the original post, edit/copy the draft, set status and follow-up.
- `site/` is the earlier Phase 1 landing page (not deployed; kept for later). `zion.html`, `scraper-worker.js`, `leads.json` are the original mock dashboard with simulated leads.
- Data lives in `data/` (git-ignored).

## Second computer (laptop)
`git clone https://github.com/nabeelmumtaz92/zion-luxe.git ~/zion-luxe && ~/zion-luxe/scripts/setup.sh`, then `node server.js`.
Windows (HP laptop), in PowerShell: `irm https://raw.githubusercontent.com/nabeelmumtaz92/zion-luxe/main/scripts/setup-windows.ps1 | iex` — installs Git/Node if missing, clones to `~\zion-luxe`, and adds a "Zion Luxe" Desktop shortcut (runs with the scraper off). Re-run to update.
Each computer keeps its own `data/` (leads, drafts, statuses are not synced). To avoid duplicate work, run the scraper on one machine
(`SCRAPE=off node server.js` on the other) or open the main Mac's dashboard over Tailscale instead.
Sources: many subreddits + Reddit searches, Cruise Critic, Mastodon hashtags, Lemmy. Blocked sites (FlyerTalk, Fodor's, TripAdvisor, Quora) are not bypassed.
Leads get a priority score (★): bigger budgets and more luxurious asks first; all budgets are still shown.
