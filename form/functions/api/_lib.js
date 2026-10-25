// Shared helpers for the form API. Submissions wait in KV until the Mac mini pulls them.
export const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

// The Mac authenticates with the shared secret (Pages secret PULL_SECRET)
export function authorized(request, env) {
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.PULL_SECRET || got.length !== env.PULL_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ env.PULL_SECRET.charCodeAt(i);
  return diff === 0;
}
