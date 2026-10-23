# Itinerary draft maker (local, runs on the Mac)
`node itinerary/draft.js itinerary/sample-lead.json` -> `itinerary/drafts/*.md`
`node itinerary/draft.js --watch inbox/` drafts every lead .json dropped in `inbox/`.

Providers are tried in order until one works: `claude` (your Claude subscription via Claude Code, no key),
then free tiers `gemini`, `groq`, `openrouter`, `mistral`. Put keys in `~/.zion-luxe/.env`:
```
GEMINI_API_KEY=...    # aistudio.google.com/apikey
GROQ_API_KEY=...      # console.groq.com/keys
OPENROUTER_API_KEY=...# openrouter.ai/keys
MISTRAL_API_KEY=...   # console.mistral.ai
PROVIDERS=claude,gemini,groq,openrouter,mistral   # optional order
```
Every draft is checked in code for prices, guarantees, affiliations, urgency and exclamation marks; a failing draft is retried once, then marked NEEDS REVIEW.
Sending to the lead is not wired yet (marker `SEND` in draft.js).
