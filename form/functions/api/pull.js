import { json, authorized } from './_lib.js';

// GET: the Mac fetches waiting submissions. POST {keys}: the Mac confirms it saved them, so they are deleted here.
export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const { keys } = await env.FORMS.list({ prefix: 'sub:', limit: 100 });
  const items = [];
  for (const { name } of keys) {
    const v = await env.FORMS.get(name);
    if (v) items.push({ key: name, ...JSON.parse(v) });
  }
  return json({ items });
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  const { keys = [] } = await request.json().catch(() => ({}));
  for (const k of keys.filter(k => typeof k === 'string' && k.startsWith('sub:')).slice(0, 100)) await env.FORMS.delete(k);
  return json({ ok: true });
}
