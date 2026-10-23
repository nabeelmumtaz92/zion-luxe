# ZionLuxe — Phase 1 (landing page + lead form)
Static site: `index.html`, `styles.css`, `script.js`, `images/` (Unsplash). Host free on Netlify/GitHub Pages; domain-agnostic.

## Connecting the form to the tracker
1. Create a Google Sheet named **ZionLuxe Leads** (header row in `ZionLuxe-Leads-template.csv`).
2. Extensions > Apps Script, paste `apps-script/Code.gs`, deploy as Web app (Anyone).
3. Paste the `/exec` URL into `FORM_ENDPOINTS` in `script.js`.
Until then the form opens a pre-filled email to nabeelmumtaz92@gmail.com instead (nothing is stored).

Photos: Unsplash (free license). WhatsApp: wa.me/16362147701.
