// AI providers for the draft maker. Tried in order (PROVIDERS env, comma list); the first
// that is configured and succeeds wins. Keys come from env or ~/.zion-luxe/.env
const fs = require('fs'), os = require('os'), path = require('path');
const { execFile } = require('child_process');

function loadEnvFile() {
  const f = path.join(os.homedir(), '.zion-luxe', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/i, '');
  }
}
loadEnvFile();

function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const ext = path.join(os.homedir(), '.vscode', 'extensions');
  if (!fs.existsSync(ext)) return null;
  const dirs = fs.readdirSync(ext).filter(d => d.startsWith('anthropic.claude-code-')).sort().reverse();
  for (const d of dirs) {
    const p = path.join(ext, d, 'resources', 'native-binary', process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function openAICompatible(url, key, model, system, user, extraHeaders = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({ model, temperature: 0.6, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const t = j.choices?.[0]?.message?.content;
  if (!t) throw new Error('empty response');
  return t;
}

const PROVIDERS = {
  // Uses your Claude subscription through the Claude Code CLI (no API key).
  claude: {
    available: () => !!findClaude(),
    run: (system, user) => new Promise((resolve, reject) => {
      const bin = findClaude();
      const args = ['-p', user, '--append-system-prompt', system, '--tools', ''];
      execFile(bin, args, { timeout: 240000, maxBuffer: 10 * 1024 * 1024 }, (err, out, errout) =>
        err ? reject(new Error((errout || err.message).slice(0, 300))) : resolve(out));
    }),
  },
  // Google AI Studio free tier
  gemini: {
    available: () => !!process.env.GEMINI_API_KEY,
    run: async (system, user) => {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      const t = (await r.json()).candidates?.[0]?.content?.parts?.map(p => p.text).join('');
      if (!t) throw new Error('empty response');
      return t;
    },
  },
  // Groq free tier
  groq: {
    available: () => !!process.env.GROQ_API_KEY,
    run: (s, u) => openAICompatible('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY,
      process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', s, u),
  },
  // OpenRouter ":free" models
  openrouter: {
    available: () => !!process.env.OPENROUTER_API_KEY,
    run: (s, u) => openAICompatible('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY,
      process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free', s, u),
  },
  // Mistral free "Experiment" tier
  mistral: {
    available: () => !!process.env.MISTRAL_API_KEY,
    run: (s, u) => openAICompatible('https://api.mistral.ai/v1/chat/completions', process.env.MISTRAL_API_KEY,
      process.env.MISTRAL_MODEL || 'mistral-small-latest', s, u),
  },
};

const ORDER = (process.env.PROVIDERS || 'claude,gemini,groq,openrouter,mistral').split(',').map(s => s.trim());

async function generate(system, user, order = ORDER) {
  const tried = [];
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p || !p.available()) { tried.push(`${name}: not configured`); continue; }
    try { return { provider: name, text: (await p.run(system, user)).trim() }; }
    catch (e) { tried.push(`${name}: ${e.message}`); }
  }
  throw new Error('No AI provider succeeded:\n  ' + tried.join('\n  '));
}
module.exports = { generate, PROVIDERS, ORDER };
