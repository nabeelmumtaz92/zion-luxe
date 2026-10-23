#!/usr/bin/env node
// Zion Luxe draft maker (runs on the Mac).
//   node itinerary/draft.js lead.json            one lead (object) or a list of leads
//   node itinerary/draft.js --watch inbox/       watch a folder for new lead .json files
// Lead fields match the website form: name, phone, email, destination, dates, travelers, tripType, budget, notes, source
// Drafts are written to itinerary/drafts/<date>-<name>.md and are never sent from here (see SEND below).
const fs = require('fs'), path = require('path');
const { generate } = require('./providers');
const { SYSTEM, userPrompt, check } = require('./prompt');

const OUT = path.join(__dirname, 'drafts');
const REQUIRED = ['name', 'destination', 'dates', 'travelers', 'tripType', 'budget'];

async function draftFor(lead) {
  const missing = REQUIRED.filter(k => !lead[k]);
  if (missing.length) throw new Error('lead missing: ' + missing.join(', '));
  let res = await generate(SYSTEM, userPrompt(lead));
  let problems = check(res.text);
  if (problems.length) { // one retry with the violations called out
    res = await generate(SYSTEM, userPrompt(lead) + '\n\nYour previous draft broke these rules (patterns: ' + problems.join(' ') + '). Rewrite without any of them.');
    problems = check(res.text);
  }
  const slug = lead.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = path.join(OUT, `${new Date().toISOString().slice(0, 10)}-${slug}.md`);
  const status = problems.length ? 'NEEDS REVIEW (rule check failed: ' + problems.join(' ') + ')' : 'draft, rule check passed';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, `<!-- provider: ${res.provider} | status: ${status} | lead: ${lead.email || ''} ${lead.phone || ''} -->\n\n${res.text}\n`);
  // SEND: sending to the lead is deliberately not wired yet. Once draft quality is approved by Nabeel,
  // add the email/WhatsApp step here and only send when problems.length === 0.
  return { file, provider: res.provider, problems, text: res.text };
}

async function handleFile(f) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const lead of Array.isArray(data) ? data : [data]) {
    try { const r = await draftFor(lead); console.log(`OK  ${lead.name} -> ${r.file} [${r.provider}]${r.problems.length ? ' RULE CHECK FAILED' : ''}`); }
    catch (e) { console.error(`ERR ${lead.name || '?'}: ${e.message}`); }
  }
}

module.exports = { draftFor };
const args = process.argv.slice(2);
if (require.main !== module) { /* imported by server.js */ }
else if (args[0] === '--watch') {
  const dir = path.resolve(args[1] || 'inbox'); fs.mkdirSync(dir, { recursive: true });
  const seen = new Set(fs.readdirSync(dir));
  console.log('Watching', dir);
  setInterval(async () => {
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.json') && !seen.has(f)) { seen.add(f); await handleFile(path.join(dir, f)); }
  }, 3000);
} else if (args[0]) handleFile(path.resolve(args[0]));
else console.log('usage: node itinerary/draft.js lead.json | --watch inbox/');
