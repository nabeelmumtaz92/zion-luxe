// Real lead finder (private tool). Reads public feeds politely from several sources, filters for people
// planning a trip, has the AI qualify + extract details, scores priority (bigger / more luxurious first,
// but every budget is kept), and adds them as inquiries. It never posts, replies or messages anyone.
// Sites that block automated access (FlyerTalk, Fodor's, TripAdvisor, Quora) are deliberately NOT bypassed.
const { generate } = require('./itinerary/providers');

const UA = 'ZionLuxe-private-research/0.1 (personal tool by nabeelmumtaz92)';
const EVERY_MIN = Number(process.env.SCRAPE_EVERY_MIN || 15);
const MAX_PER_SCAN = Number(process.env.MAX_PER_SCAN || 40);
// Qualification is high-volume: prefer free-tier AIs when configured, Claude as fallback.
const QUALIFY_ORDER = (process.env.PROVIDERS_QUALIFY || 'gemini,groq,openrouter,mistral,claude').split(',').map(s => s.trim());

const SUBS = (process.env.SUBREDDITS || [
  'honeymoons', 'luxurytravel', 'FATTravel', 'solotravel', 'travel', 'Cruise', 'JapanTravel', 'ItalyTravel', 'Maldives',
  'fatFIRE', 'awardtravel', 'churning', 'travelhacks', 'TravelHacks', 'Dubai', 'Greece', 'greecetravel', 'ThailandTourism',
  'Bali', 'Hawaii', 'Mexico', 'caribbean', 'DisneyWorld', 'WeddingPlanning', 'weddingplanning', 'Europe', 'EuropeTravel',
  'safari', 'Tanzania', 'Iceland', 'Switzerland', 'France', 'Spain', 'Portugal', 'Turkey', 'Egypt', 'Morocco', 'SouthAfrica',
  'Cruise_Ships', 'FirstClass', 'delta', 'americanairlines', 'unitedairlines', 'emirates_airline', 'QatarAirways', 'singaporeair',
  'ski', 'skiing', 'Yachting', 'sailing', 'Luxury', 'AirBnB', 'VacationRentals', 'tripplanning', 'ThailandTravel'
].join(',')).split(',').map(s => s.trim()).filter((v, i, a) => v && a.indexOf(v) === i);
const REDDIT_SEARCHES = (process.env.REDDIT_SEARCHES || [
  'honeymoon luxury resort', 'business class trip planning', 'first class flight booking', 'overwater villa', 'luxury hotel recommendation',
  'anniversary trip luxury', 'safari luxury lodge', 'yacht charter planning', 'private villa family vacation', 'travel agent recommend luxury',
  'multigenerational trip planning', 'Maldives honeymoon', 'Bora Bora', 'Amalfi Coast hotel', 'Dubai luxury trip', 'Europe two weeks luxury'
].join('|')).split('|');
const MASTODON_TAGS = ['honeymoon', 'luxurytravel', 'travelplanning', 'maldives', 'firstclass', 'businessclass', 'tripplanning', 'luxuryhotel', 'cruise'];
const LEMMY_QUERIES = ['luxury travel', 'honeymoon', 'business class', 'resort recommendation', 'planning a trip'];

const INTENT = /\b(honeymoon|anniversary|itinerary|recommend\w*|planning|booking|book|resort|villa|first class|business class|luxury|safari|overwater|yacht|cruise|suite|private|hotel|trip|vacation|looking for|suggestions?)\b/i;
const SKIP = /\b(trip report|review|just got back|returned from|megathread|weekly|daily thread)\b/i;

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const strip = h => decode(decode(h)).replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, json) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: json ? 'application/json' : '*/*' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`${url.slice(0, 70)} HTTP ${r.status}`);
  return json ? r.json() : r.text();
}

function parseAtom(xml, label) {
  return xml.split('<entry>').slice(1).map(e => ({
    id: 'rd:' + tag(e, 'id'), title: strip(tag(e, 'title')), url: (e.match(/<link href="([^"]+)"/) || [])[1] || '',
    author: strip(tag(tag(e, 'author'), 'name')).replace(/^\/?u\//, ''), text: strip(tag(e, 'content')).slice(0, 1500), label }));
}
function parseRss(xml, label, prefix) {
  return xml.split('<item>').slice(1).map(e => ({
    id: prefix + (strip(tag(e, 'guid')) || strip(tag(e, 'link'))), title: strip(tag(e, 'title')), url: strip(tag(e, 'link')),
    author: strip(tag(e, 'dc:creator')) || strip(tag(e, 'author')) || 'unknown', text: strip(tag(e, 'description')).slice(0, 1500), label }));
}

// Each source: { name, fetch: async () => posts[] }
function sources() {
  const out = [];
  for (const sub of SUBS) out.push({ name: `Reddit r/${sub}`, fetch: async () => parseAtom(await get(`https://www.reddit.com/r/${sub}/new.rss?limit=25`), `Reddit r/${sub}`) });
  for (const q of REDDIT_SEARCHES) out.push({ name: `Reddit search "${q}"`, fetch: async () =>
    parseAtom(await get(`https://www.reddit.com/search.rss?q=${encodeURIComponent(q)}&sort=new&t=week&limit=25`), 'Reddit search') });
  out.push({ name: 'Cruise Critic forums', fetch: async () => parseRss(await get('https://boards.cruisecritic.com/discover/all.xml/'), 'Cruise Critic', 'cc:') });
  for (const t of MASTODON_TAGS) out.push({ name: `Mastodon #${t}`, fetch: async () =>
    parseRss(await get(`https://mastodon.social/tags/${t}.rss`), 'Mastodon #' + t, 'ms:') });
  for (const q of LEMMY_QUERIES) out.push({ name: `Lemmy "${q}"`, fetch: async () => {
    const j = await get(`https://lemmy.world/api/v3/search?q=${encodeURIComponent(q)}&type_=Posts&sort=New&limit=20`, true);
    return (j.posts || []).map(p => ({ id: 'lm:' + p.post.ap_id, title: p.post.name, url: p.post.ap_id, author: p.creator?.name || 'unknown',
      text: (p.post.body || '').slice(0, 1500), label: 'Lemmy ' + (p.community?.name || '') })); } });
  return out;
}

const QUALIFY_SYSTEM = `You screen public forum posts for a luxury travel agent (Zion Luxe). Decide if the poster is personally planning an upcoming trip or flight where a travel agent could realistically help (hotels/resorts, honeymoons, business/first class, cruises, family, group or international trips). Reject trip reports, reviews, general chatter, news, ads, visa/logistics-only questions, and anything unclear. Budget does NOT disqualify: keep cheaper trips too, but rate them low. Reply with ONLY JSON:
{"qualified":true|false,"destination":"","dates":"","travelers":"","tripType":"Honeymoon/anniversary|Family vacation|Resort getaway|Business or first class|Cruise|Other","budget":"as stated, or Not stated","budgetUSD":number or null,"luxuryLevel":1-5,"reason":"one short sentence"}
luxuryLevel: 5 = ultra-luxury / private jet / villa / suite-level, 4 = premium (5-star, business/first), 3 = upscale, 2 = mid-range, 1 = budget. budgetUSD = total trip budget in USD if stated or clearly implied, else null. Use only what the post says; "Not stated" for unknowns.`;

async function qualify(p) {
  const { text } = await generate(QUALIFY_SYSTEM, `Source: ${p.label}\nTitle: ${p.title}\nPost: ${p.text}`, QUALIFY_ORDER);
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
  return JSON.parse(m[0]);
}
// 0-100. Bigger budgets and more luxurious asks rank higher; nothing is excluded.
function priority(q, p) {
  let s = (Number(q.luxuryLevel) || 2) * 12;
  const b = Number(q.budgetUSD); if (b > 0) s += Math.min(30, Math.round(b / 1500));
  if (/honeymoon|anniversary|business class|first class|yacht|villa|suite|overwater|safari|private/i.test(p.title + ' ' + p.text)) s += 10;
  if (/cheap|hostel|backpack|budget|free/i.test(p.title)) s -= 10;
  return Math.max(0, Math.min(100, s));
}

let running = false;
async function scanOnce(api, log = console.log) {
  if (running) return 0; running = true;
  try {
    const known = new Set(api.load().flatMap(q => q.postId ? [q.postId, 'rd:' + q.postId] : []));
    const screened = new Set(api.seenFile.get());
    let added = 0, checked = 0;
    for (const src of sources()) {
      if (checked >= MAX_PER_SCAN) break;
      let posts; try { posts = await src.fetch(); } catch (e) { log('source failed: ' + e.message); await sleep(1500); continue; }
      for (const p of posts) {
        if (checked >= MAX_PER_SCAN) break;
        if (!p.id || known.has(p.id) || screened.has(p.id)) continue;
        screened.add(p.id);
        if (!INTENT.test(p.title + ' ' + p.text) || SKIP.test(p.title) || p.text.length < 60) continue;
        checked++;
        try {
          const q = await qualify(p);
          if (!q.qualified) continue;
          const rec = { id: Date.now() + added, date: new Date().toISOString(), status: 'New', followUp: '', draftStatus: 'queued',
            name: (p.label.startsWith('Reddit') ? 'u/' : '') + p.author, phone: '', email: '', destination: q.destination || 'Not stated',
            dates: q.dates || 'Not stated', travelers: q.travelers || 'Not stated', tripType: q.tripType || 'Other', budget: q.budget || 'Not stated',
            source: p.label, postId: p.id, postUrl: p.url, postTitle: p.title, notes: p.text, forum: true, why: q.reason,
            budgetUSD: Number(q.budgetUSD) || null, luxuryLevel: Number(q.luxuryLevel) || null, priority: priority(q, p) };
          const cur = api.load(); cur.unshift(rec); api.save(cur); added++; known.add(p.id);
          log(`lead [${rec.priority}] ${rec.destination} (${rec.source}) ${p.url}`);
          api.makeDraft(rec.id);
        } catch (e) { log('qualify: ' + e.message.slice(0, 160)); }
        await sleep(1200);
      }
      await sleep(1800); // polite gap between feeds
    }
    api.seenFile.set([...screened].slice(-20000));
    return added;
  } finally { running = false; }
}

let last = null; // { at, added, error, manual } for the most recent finished scan
function run(api, log = console.log, manual = false) {
  if (running) return false;
  scanOnce(api, log).then(n => { last = { at: Date.now(), added: n, manual }; log(`scan done, ${n} new lead(s)`); })
    .catch(e => { last = { at: Date.now(), added: 0, error: e.message, manual }; log('scan error: ' + e.message); });
  return true;
}
const status = () => ({ running, last, everyMin: EVERY_MIN });

function start(api, log = console.log) {
  run(api, log); setInterval(() => run(api, log), EVERY_MIN * 60 * 1000);
}
module.exports = { start, run, status, scanOnce, sources };
