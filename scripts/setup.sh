#!/bin/zsh
# Set up the Zion Luxe private lead tool on a Mac. Usage:
#   git clone https://github.com/nabeelmumtaz92/zion-luxe.git ~/zion-luxe && ~/zion-luxe/scripts/setup.sh
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js 18+ is required: install from https://nodejs.org (or: brew install node), then re-run."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { echo "Node 18+ needed (found $(node -v))."; exit 1; }
mkdir -p ~/.zion-luxe data
if [ ! -f ~/.zion-luxe/.env ]; then
cat > ~/.zion-luxe/.env <<'ENVEOF'
# Free-tier AI keys (all optional; Claude Code is used when installed and signed in)
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
MISTRAL_API_KEY=
ENVEOF
echo "Created ~/.zion-luxe/.env — paste your free keys there (aistudio.google.com/apikey, console.groq.com/keys, openrouter.ai/keys, console.mistral.ai)."
fi
if ls ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude >/dev/null 2>&1 || [ -n "$CLAUDE_BIN" ]; then
  echo "Claude Code found: it will be used first."
else
  echo "Claude Code not found (install the VS Code extension and sign in) — free-tier keys will be used instead."
fi
echo; echo "Start it:  cd $(pwd) && node server.js    then open http://localhost:8799"
echo "Update later:  cd $(pwd) && git pull"
