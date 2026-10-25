// Everything that happens to a lead after the scraper finds it, so the only human step is the sales call:
//   1. an AI first message for each forum lead, with a personal link to the public contact form
//   2. form submissions (Cloudflare Pages, see form/) pulled every minute and merged into the lead
//   3. once the form is in: a fresh draft with their details, emailed to them with the Calendly link, and a nudge 2 days later
//   4. a call sheet for the sales call
// Settings come from ~/.zion-luxe/.env (loaded by itinerary/providers.js); restart the server after changing them.
const { outreach, callSheet, nudgeEmail, replyMessage, contactFrom } = require('./itinerary/extras');

const env = (k, d = '') => process.env[k] || d;
const FORM_URL = () => env('ZION_FORM_URL').replace(/\/$/, '');
const emailReady = () => !!(env('SMTP_USER') && env('SMTP_PASS'));
const NUDGE_AFTER_MS = 2 * 24 * 3600 * 1000;
const first = (name) => String(name || '').replace(/^u\//, '').trim().split(/\s+/)[0] || 'there';

function setup() {
  return { form: !!(FORM_URL() && env('ZION_FORM_SECRET')), email: emailReady(), calendly: !!env('CALENDLY_URL'), autoEmail: env('AUTO_EMAIL') !== 'off' };
}

// Minimal Markdown to HTML for emails and the call sheet page (input is escaped first)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function md(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  let html = '', list = false;
  for (const line of String(text || '').split('\n')) {
    const h = line.match(/^(#{1,4})\s+(.*)/), li = line.match(/^\s*[-*]\s+(.*)/);
    if (!li && list) { html += '</ul>'; list = false; }
    if (h) html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
    else if (li) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(li[1])}</li>`; }
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (list ? '</ul>' : '');
}

function createFollowup({ load, save, makeDraft, log }) {
  const patch = (id, fn) => { const all = load(); const q = all.find(x => x.id === id); if (!q) return null; fn(q); save(all); return q; };
  const get = (id) => load().find(x => x.id === id);
  const formLink = (q) => {
    const d = q.destination && q.destination !== 'Not stated' ? `&d=${encodeURIComponent(q.destination.slice(0, 80))}` : '';
    return `${FORM_URL()}/?l=${q.ref}${d}`;
  };

  // One AI job at a time, so a backlog never starts dozens of Claude runs at once
  const pending = new Set();
  let chain = Promise.resolve();
  function enqueue(kind, id, fn) {
    const key = kind + ':' + id;
    if (pending.has(key)) return false;
    pending.add(key);
    chain = chain.then(fn).catch(e => log(`${kind} ${id}: ${e.message.slice(0, 200)}`)).finally(() => pending.delete(key));
    return true;
  }

  function ensureRefs() {
    const all = load(); let changed = false;
    for (const q of all) if (!q.ref) { q.ref = Math.random().toString(36).slice(2, 10); changed = true; }
    // Jobs don't survive a restart: anything left mid-way is picked up again
    for (const q of all) if (q.outreachStatus === 'writing' && !pending.has('outreach:' + q.id)) { q.outreachStatus = 'queued'; changed = true; }
    for (const q of all) if (q.callSheetStatus === 'writing' && !pending.has('afterForm:' + q.id) && !pending.has('callSheet:' + q.id)) { q.callSheetStatus = 'not started'; changed = true; }
    if (changed) save(all);
  }

  // 1. First message
  function queueOutreach(id) {
    return enqueue('outreach', id, async () => {
      const q = get(id); if (!q || !FORM_URL()) return;
      patch(id, x => { x.outreachStatus = 'writing'; });
      try {
        const r = await outreach(q, formLink(q));
        patch(id, x => Object.assign(x, { outreach: r.text, outreachProvider: r.provider, outreachStatus: r.problems.length ? 'needs review' : 'ready', outreachTries: 0 }));
      } catch (e) {
        patch(id, x => { x.outreachStatus = 'error: ' + e.message.slice(-200); x.outreachTries = (x.outreachTries || 0) + 1; });
        throw e;
      }
    });
  }
  function backfillOutreach() {
    if (!FORM_URL()) return;
    // Failed ones are retried on later passes, up to 5 times
    const todo = load().filter(q => q.forum && q.postUrl && !q.outreach && q.status === 'New' && (q.outreachTries || 0) < 5)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0) || b.id - a.id);
    for (const q of todo) queueOutreach(q.id);
  }

  // 2. Form submissions
  async function pullForms() {
    if (!setup().form) return;
    const auth = { Authorization: 'Bearer ' + env('ZION_FORM_SECRET') };
    const r = await fetch(FORM_URL() + '/api/pull', { headers: auth });
    if (!r.ok) throw new Error('form pull HTTP ' + r.status);
    const { items = [] } = await r.json();
    if (!items.length) return;
    const all = load(), touched = [];
    for (const s of items) {
      let q = s.ref && all.find(x => x.ref === s.ref);
      if (!q) {
        q = { id: Date.now() + touched.length, date: s.at, followUp: '', draftStatus: 'queued', source: 'Contact form', ref: Math.random().toString(36).slice(2, 10),
          destination: 'Not stated', dates: 'Not stated', travelers: 'Not stated', tripType: 'Other', budget: 'Not stated', notes: '' };
        all.unshift(q);
      }
      Object.assign(q, { name: s.name, email: s.email, phone: s.phone, bestTime: s.bestTime, okToText: !!s.okToText, formNotes: s.notes, formAt: s.at,
        status: 'Form filled', foundOnForum: q.foundOnForum || !!q.forum, forum: false });
      for (const k of ['destination', 'dates', 'travelers']) if (s[k]) q[k] = s[k];
      if (s.notes && q.source === 'Contact form') q.notes = s.notes;
      touched.push(q.id);
    }
    save(all);
    await fetch(FORM_URL() + '/api/pull', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: items.map(i => i.key) }) });
    for (const id of touched) { log(`form filled: ${get(id).name} (${get(id).destination})`); queueAfterForm(id); }
  }

  // 3 + 4. After the form: draft with their details -> email -> call sheet
  function queueAfterForm(id) {
    return enqueue('afterForm', id, async () => {
      await makeDraft(id);
      const q = get(id);
      const alreadySent = (q.emails || []).some(e => e.kind === 'itinerary' && e.ok);
      if (q.draftStatus === 'ready' && setup().autoEmail && emailReady() && !alreadySent) await sendEmail(id, 'itinerary');
      else if (q.draftStatus !== 'ready') patch(id, x => { x.emailNote = 'Not sent automatically: the draft needs your review first. Edit it, Save, then Send email.'; });
      await makeCallSheet(id);
    });
  }
  async function makeCallSheet(id) {
    patch(id, x => { x.callSheetStatus = 'writing'; });
    try {
      const r = await callSheet(get(id));
      patch(id, x => Object.assign(x, { callSheet: r.text, callSheetStatus: r.problems.length ? 'needs review' : 'ready' }));
    } catch (e) { patch(id, x => { x.callSheetStatus = 'error: ' + e.message.slice(0, 200); }); }
  }

  let transport = null;
  function mailer() {
    if (!transport) transport = require('nodemailer').createTransport({
      host: env('SMTP_HOST', 'smtp.gmail.com'), port: Number(env('SMTP_PORT', '465')), secure: env('SMTP_PORT', '465') === '465',
      auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
    });
    return transport;
  }
  async function compose(q, kind) {
    const cal = env('CALENDLY_URL'), dest = q.destination && q.destination !== 'Not stated' ? q.destination : 'your trip';
    const subject = `Your ${dest} draft itinerary`;
    if (kind === 'nudge') {
      // AI-written, re-asking the 4 planning questions; the fixed text below is the fallback if every AI provider fails
      try {
        const r = await nudgeEmail(q);
        if (!r.problems.length && r.text.includes('{CAL}')) {
          return { subject: 'Re: ' + subject, text: r.text.replace('{CAL}', cal || '(or reply with a good time to call)') };
        }
      } catch (e) { log(`nudge email AI failed, using the standard text: ${e.message.slice(0, 120)}`); }
      const text = `Hi ${first(q.name)},\n\nI wanted to check whether the draft for ${dest} was useful. ` +
        (cal ? `If you'd like to talk it through, you can pick a time here:\n${cal}\n\n` : `If you'd like to talk it through, reply with a good time to call.\n\n`) +
        `Or reply with any changes and I will update it.\n\nNabeel Mumtaz\nZion Luxe, LLC · (636) 214-7701`;
      return { subject: 'Re: ' + subject, text };
    }
    const text = `Hi ${first(q.name)},\n\nThank you for sending the details of your trip. Below is a first draft to react to. Nothing is booked, and every part of it can change.\n\n` +
      (cal ? `When you have a moment, pick a time for a short call so we can shape it together:\n${cal}\n\n` : `I will reach out shortly to set up a short call so we can shape it together.\n\n`) +
      `----\n\n${q.draft}\n`;
    return { subject, text };
  }
  async function sendEmail(id, kind) {
    const q = get(id);
    if (!q || !q.email) throw new Error('no email address');
    if (!emailReady()) throw new Error('email is not set up (SMTP_USER / SMTP_PASS in ~/.zion-luxe/.env)');
    if (kind === 'itinerary' && !q.draft) throw new Error('no draft yet');
    const { subject, text } = await compose(q, kind);
    const from = env('ZION_FROM_EMAIL', env('SMTP_USER'));
    const rec = { at: new Date().toISOString(), kind, to: q.email, subject };
    try {
      await mailer().sendMail({ from: `"Nabeel Mumtaz, Zion Luxe" <${from}>`, replyTo: from, to: q.email, subject, text,
        html: `<div style="font:15px/1.55 Georgia,serif;color:#222;max-width:640px">${md(text)}</div>` });
      rec.ok = true; log(`emailed ${kind} to ${q.email}`);
    } catch (e) { rec.ok = false; rec.error = e.message.slice(0, 200); log(`email ${kind} failed: ${rec.error}`); }
    patch(id, x => { x.emails = [...(x.emails || []), rec]; if (rec.ok) delete x.emailNote; });
    if (!rec.ok) throw new Error(rec.error);
  }
  function nudges() {
    if (!emailReady() || !setup().autoEmail) return;
    for (const q of load()) {
      const sent = (q.emails || []).find(e => e.kind === 'itinerary' && e.ok);
      if (q.status === 'Form filled' && sent && !(q.emails || []).some(e => e.kind === 'nudge') && Date.now() - Date.parse(sent.at) > NUDGE_AFTER_MS)
        enqueue('nudge', q.id, () => sendEmail(q.id, 'nudge'));
    }
  }

  // Their reply to our first message (pasted on the dashboard) -> our AI-written second message.
  // Contact details they typed are saved; once there is an email, it continues like a filled-in form.
  function queueReply(id, theirText) {
    const text = String(theirText || '').trim().slice(0, 5000);
    if (!text) return false;
    const found = contactFrom(text);
    patch(id, x => {
      if (!x.thread) x.thread = x.outreach ? [{ from: 'us', text: x.outreach, at: x.date }] : [];
      x.thread.push({ from: 'them', text, at: new Date().toISOString() });
      if (found.email && !x.email) x.email = found.email;
      if (found.phone && !x.phone) x.phone = found.phone;
      if (found.okToText) x.okToText = true;
      if (x.status === 'New') x.status = 'Replied';
      x.replyStatus = 'writing';
    });
    return enqueue('reply', id, async () => {
      const q = get(id);
      try {
        const r = await replyMessage(q, text, q.thread.slice(0, -1));
        const out = r.text.replace('{LINK}', formLink(q));
        patch(id, x => Object.assign(x, { replyDraft: out, replyStatus: r.problems.length ? 'needs review' : 'ready' }));
      } catch (e) { patch(id, x => { x.replyStatus = 'error: ' + e.message.slice(-200); }); throw e; }
      const after = get(id);
      if (after.email && found.email && after.status !== 'Form filled') {
        patch(id, x => { x.status = 'Form filled'; x.foundOnForum = true; x.forum = false; });
        queueAfterForm(id);
      }
    });
  }
  // Nabeel copied and sent our reply: keep it in the conversation history
  function markReplySent(id) {
    patch(id, x => {
      if (!x.replyDraft) return;
      x.thread = [...(x.thread || []), { from: 'us', text: x.replyDraft, at: new Date().toISOString() }];
      x.replyDraft = ''; x.replyStatus = 'sent';
    });
  }

  function start() {
    ensureRefs();
    const every = (ms, fn) => { const run = () => Promise.resolve().then(fn).catch(e => log(e.message.slice(0, 200))); run(); setInterval(run, ms); };
    every(60 * 1000, pullForms);
    every(10 * 60 * 1000, () => { ensureRefs(); backfillOutreach(); });
    every(30 * 60 * 1000, nudges);
    const s = setup();
    log(`follow-up: form ${s.form ? 'on' : 'off'}, email ${s.email ? (s.autoEmail ? 'on' : 'manual only') : 'not set up'}, calendly ${s.calendly ? 'on' : 'not set'}`);
  }

  return { start, setup, md, queueOutreach, queueReply, markReplySent, queueAfterForm, sendEmail, makeCallSheet: (id) => enqueue('callSheet', id, () => makeCallSheet(id)), ensureRefs };
}

module.exports = { createFollowup, md, esc };
