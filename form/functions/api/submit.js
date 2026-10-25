import { json } from './_lib.js';

const FIELDS = { ref: 20, name: 120, email: 200, phone: 40, bestTime: 120, destination: 200, dates: 120, travelers: 60, notes: 3000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env }) {
  const type = request.headers.get('Content-Type') || '';
  const raw = type.includes('json') ? await request.json().catch(() => ({})) : Object.fromEntries(await request.formData());
  if (raw.website) return json({ ok: true }); // honeypot: bots fill the hidden field
  const sub = {};
  for (const [k, n] of Object.entries(FIELDS)) sub[k] = String(raw[k] ?? '').trim().slice(0, n);
  sub.okToText = raw.okToText === 'on' || raw.okToText === true || raw.okToText === 'true';
  if (!sub.name || !EMAIL.test(sub.email)) return json({ error: 'Please add your name and a valid email.' }, 400);

  // At most 5 submissions per hour from one address
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rlKey = `rl:${ip}`;
  const count = Number(await env.FORMS.get(rlKey)) || 0;
  if (count >= 5) return json({ error: 'Too many requests. Please try again later.' }, 429);
  await env.FORMS.put(rlKey, String(count + 1), { expirationTtl: 3600 });

  sub.at = new Date().toISOString();
  const key = `sub:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
  await env.FORMS.put(key, JSON.stringify(sub), { expirationTtl: 60 * 60 * 24 * 30 });
  return json({ ok: true });
}
