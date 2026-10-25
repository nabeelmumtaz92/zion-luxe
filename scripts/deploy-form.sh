#!/bin/zsh
# Deploy the public contact form (form/) to Cloudflare Pages and push its settings from ~/.zion-luxe/.env
# (ZION_FORM_SECRET, CALENDLY_URL). Re-run after changing either. Creates the secret on first run.
set -e
cd "$(dirname "$0")/../form"
ENV=~/.zion-luxe/.env
mkdir -p ~/.zion-luxe; touch "$ENV"
get() { grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2-; }
if [ -z "$(get ZION_FORM_SECRET)" ]; then
  echo "ZION_FORM_SECRET=$(openssl rand -hex 24)" >> "$ENV"
fi
[ -n "$(get ZION_FORM_URL)" ] || echo "ZION_FORM_URL=https://zion-luxe.pages.dev" >> "$ENV"
npx wrangler pages project list 2>/dev/null | grep -q " zion-luxe " || npx wrangler pages project create zion-luxe --production-branch main
get ZION_FORM_SECRET | npx wrangler pages secret put PULL_SECRET --project-name zion-luxe >/dev/null
CAL="$(get CALENDLY_URL)"
if [ -n "$CAL" ]; then echo "$CAL" | npx wrangler pages secret put CALENDLY_URL --project-name zion-luxe >/dev/null; fi
npx wrangler pages deploy public --project-name zion-luxe --branch main --commit-dirty=true
echo "Form live at $(get ZION_FORM_URL)"
