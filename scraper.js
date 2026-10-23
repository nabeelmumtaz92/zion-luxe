// Real lead finder (private tool). Reads public Reddit RSS feeds politely, filters for people planning
// a high-value trip, asks the AI to qualify + extract details, and adds them as inquiries.
// It never posts, replies or messages anyone. You open the post and respond yourself.
const { generate } = require('./itinerary/providers');

const SUBS = (process.env.SUBREDDITS || 'honeymoons,luxurytravel,FATTravel,solotravel,travel,Cruise,JapanTravel,ItalyTravel,Maldives,digitalnomad,fatFIRE').split(',').map(s => s.trim());
const EVERY_MIN = Number(process.env.SCRAPE_EVERY_MIN || 15);
const UA = 'ZionLuxe-private-research/0.1 (personal tool by nabeelmumtaz92)';
const INTENT = /\b(honeymoon|anniversary|itinerary|recommend|planning|booking|book|resort|villa|first class|business class|luxury|safari|overwater|yacht|cruise|suite|private)\b/i;
const SKIP = /\b(trip report|review|just got back|returned from|megathread|weekly)\b/i;

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&');
const strip = h => decode(decode(h)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '';

async function fetchSub(sub) {
  const r = await fetch(`https://www.reddit.com/r/${sub}/new.rss?limit=25`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`r/${sub} HTTP ${r.status}`);
  const xml = await r.text();
  return xml.split('<entry>').slice(1).map(e => ({
    id: tag(e, 'id'), title: strip(tag(e, 'title')), url: (e.match(/<link href="([^"]+)"/) || [])[1] || '',
    author: strip(tag(tag(e, 'author'), 'name')), text: strip(tag(e, 'content')).slice(0, 1500), sub, updated: tag(e, 'updated'),
  }));
}

const QUALIFY_SYSTEM = `You screen public forum posts for a luxury travel agent (Zion Luxe). Decide if the poster is personally planning an upcoming trip where a premium-travel agent could realistically help (resorts/hotels, honeymoons, business/first class, cruises, family or international trips). Reject trip reports, reviews, general questions, visa/logistics-only questions, budget/backpacking trips, and anything unclear. Reply with ONLY JSON: {"qualified":true|false,"destination":"","dates":"","travelers":"","tripType":"Honeymoon/anniversary|Family vacation|Resort getaway|Business or first class|Cruise|Other","budget":"as stated or Not stated","reason":"one short sentence"}. Use only what the post says; use "Not stated" for unknowns.`;

async function qualify(p) {
  const { text } = await generate(QUALIFY_SYSTEM, `Subreddit: r/${p.sub}\nTitle: ${p.title}\nPost: ${p.text}`);
  const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON');
  return JSON.parse(m[0]);
}

// api: { load, save, makeDraft }
async function scanOnce(api, log = console.log) {
  const state = api.load();
  const seen = new Set(state.map(q => q.postId).filter(Boolean));
  const seenFile = api.seenFile; // ids we already screened (including rejected)
  const screened = new Set(seenFile.get());
  let added = 0;
  for (const sub of SUBS) {
    let posts; try { posts = await fetchSub(sub); } catch (e) { log('scrape: ' + e.message); continue; }
    for (const p of posts) {
      if (seen.has(p.id) || screened.has(p.id)) continue;
      screened.add(p.id);
      if (!INTENT.test(p.title + ' ' + p.text) || SKIP.test(p.title) || p.text.length < 60) continue;
      try {
        const q = await qualify(p);
        if (!q.qualified) continue;
        const rec = { id: Date.now() + added, date: new Date().toISOString(), status: 'New', followUp: '', draftStatus: 'queued',
          name: 'u/' + p.author.replace(/^\/?u\//, ''), phone: '', email: '', destination: q.destination || 'Not stated', dates: q.dates || 'Not stated',
          travelers: q.travelers || 'Not stated', tripType: q.tripType || 'Other', budget: q.budget || 'Not stated',
          source: `Reddit r/${sub}`, postId: p.id, postUrl: p.url, postTitle: p.title, notes: p.text, forum: true, why: q.reason };
        const cur = api.load(); cur.unshift(rec); api.save(cur); added++;
        log(`lead: ${rec.destination} (${rec.source}) ${p.url}`);
        api.makeDraft(rec.id);
      } catch (e) { log('qualify: ' + e.message.slice(0, 200)); }
      await new Promise(r => setTimeout(r, 1500));
    }
    await new Promise(r => setTimeout(r, 2000)); // be polite between subreddits
  }
  seenFile.set([...screened].slice(-5000));
  return added;
}

function start(api, log = console.log) {
  const run = () => scanOnce(api, log).then(n => log(`scan done, ${n} new lead(s)`)).catch(e => log('scan error: ' + e.message));
  run(); setInterval(run, EVERY_MIN * 60 * 1000);
}
module.exports = { start, scanOnce, SUBS };
