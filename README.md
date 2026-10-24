# Zion Luxe — private lead tool (runs on the owner's Mac only)

`node server.js` → http://localhost:8799 (this Mac and your Tailscale devices only; not a public site).
- `scraper.js` reads public Reddit RSS feeds every 15 min (subs set by `SUBREDDITS`), filters for people planning a premium trip, has the AI qualify/extract details, and adds leads. It never posts, replies or messages anyone.
- `itinerary/` writes a draft itinerary for each lead (Claude via Claude Code first, then free-tier Gemini/Groq/OpenRouter/Mistral; keys in `~/.zion-luxe/.env`). Rule-checked: no prices, guarantees, affiliations.
- `inquiries.html` is the dashboard: open the original post, edit/copy the draft, set status and follow-up.
- `site/` is the earlier Phase 1 landing page (not deployed; kept for later). `zion.html`, `scraper-worker.js`, `leads.json` are the original mock dashboard with simulated leads.
- Data lives in `data/` (git-ignored).

## Shared database (Mac mini + laptop)
The Mac mini is the one database: it scrapes and stores every lead. `scripts/install-mac-service.sh` keeps `server.js` running in the background
(starts at login, restarts if it stops; after a `git pull`: `launchctl kickstart -k gui/$(id -u)/com.zionluxe.server`).
The server answers only this Mac and your own Tailscale devices (other Wi-Fi devices get 403; it is not on the Tailscale Funnel).
Other computers don't keep their own copy: they open http://nabeels-mac-mini.tail74c059.ts.net:8799 over Tailscale.
Windows (HP laptop), in PowerShell: `irm https://raw.githubusercontent.com/nabeelmumtaz92/zion-luxe/main/scripts/setup-windows.ps1 | iex` (installs Tailscale, adds a "Zion Luxe" Desktop shortcut).
Sources: many subreddits + Reddit searches, Cruise Critic, Mastodon hashtags, Lemmy. Blocked sites (FlyerTalk, Fodor's, TripAdvisor, Quora) are not bypassed.
Leads get a priority score (★): bigger budgets and more luxurious asks first; all budgets are still shown.
