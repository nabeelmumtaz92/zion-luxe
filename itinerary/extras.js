// AI-written extras for each lead, under the same honesty rules as the drafts (see prompt.js):
//   outreach(): the first private message to someone who posted publicly, with their personal form link
//   callSheet(): one-page prep for Nabeel's sales call once they have filled in the form
const { generate } = require('./providers');
const { check } = require('./prompt');

const RULES = `HARD RULES: never state or imply prices, costs, discounts or savings; never promise availability or guaranteed outcomes;
never claim partnerships, accreditations or perks; no testimonials; no exclamation marks; no hype words ("unlock", "elevate", "dream getaway");
do not invent facts about the person.`;

const OUTREACH_SYSTEM = `You write the first private message (Reddit chat or forum private message) from Nabeel Mumtaz, founder of Zion Luxe,
a small luxury travel planning business, to someone who publicly posted asking for trip help. Calm, warm, understated, human. Plain text, no Markdown.
- 60 to 110 words. Open with "Hi," (never use their username).
- Mention one or two specifics from their post so it is clearly not a template, and give one genuinely useful tip for their trip.
- Offer a complimentary draft itinerary, no obligation, through the link. Put the exact text {LINK} on its own line where the link goes.
- End with: Nabeel, Zion Luxe
${RULES}`;

const CALL_SYSTEM = `You prepare a one-page call sheet for Nabeel Mumtaz (Zion Luxe, luxury travel planning) before a sales call with a prospect.
Be concrete and brief; Nabeel reads it 2 minutes before dialing. Markdown, exactly these sections:
## Snapshot  (2-3 lines: who, trip, budget level, what matters most to them)
## In their words  (2-4 short quotes or close paraphrases from their post / form notes)
## What to confirm  (bullet list of missing or vague details: dates, travelers, budget comfort, occasion, flights, must-haves)
## Questions to ask  (6-8 open questions, in a good order)
## Likely concerns and how to answer  (3-4 bullets; honest answers only, no price figures, no guarantees)
## Walk them through the draft  (3 bullets: the highlights of the draft itinerary to present)
## Close and next step  (how to propose working together and the very next action)
${RULES}`;

async function ruleChecked(system, user) {
  let res = await generate(system, user);
  let problems = check(res.text);
  if (problems.length) {
    res = await generate(system, user + '\n\nYour previous answer broke these rules (patterns: ' + problems.join(' ') + '). Rewrite without any of them.');
    problems = check(res.text);
  }
  return { text: res.text.trim(), provider: res.provider, problems };
}

function outreach(lead, link) {
  const user = `Their post (from ${lead.source}):
Title: ${lead.postTitle || ''}
${String(lead.notes || '').slice(0, 2500)}
What we understood: destination ${lead.destination}; when ${lead.dates}; travelers ${lead.travelers}; trip type ${lead.tripType}; budget ${lead.budget}.`;
  return ruleChecked(OUTREACH_SYSTEM, user).then(r => ({ ...r, text: r.text.replace('{LINK}', link) }));
}

function callSheet(lead) {
  const user = `Prospect: ${lead.name}${lead.forum ? ' (found through a public forum post)' : ''}
Contact: ${lead.email || '-'} · ${lead.phone || '-'} · best time: ${lead.bestTime || '-'} · OK to text: ${lead.okToText ? 'yes' : 'no'}
Destination: ${lead.destination} · When: ${lead.dates} · Travelers: ${lead.travelers} · Trip type: ${lead.tripType} · Budget: ${lead.budget}
Original post title: ${lead.postTitle || '-'}
Post / notes:
${String(lead.notes || '').slice(0, 3000)}
Form notes: ${lead.formNotes || '-'}

Draft itinerary we sent:
${String(lead.draft || '(none yet)').slice(0, 5000)}`;
  return ruleChecked(CALL_SYSTEM, user);
}

const NUDGE_SYSTEM = `You write a short follow-up email from Nabeel Mumtaz (Zion Luxe, luxury travel planning) to a prospect who received
a draft itinerary two days ago and has not replied or booked a call. Calm, warm, low-pressure, personal. Plain text, no Markdown, no subject line.
- 90 to 150 words. Open with "Hi <first name>,".
- Refer to one specific detail of their trip so it is clearly written for them.
- Ask the 4 planning questions, briefly, as a short numbered list, worded for this trip; if one is already answered, ask it as a quick confirmation:
  1. budget level and vibe (no numbers from us), 2. non-negotiables, 3. how many days they have, 4. driving themselves vs private drivers/transfers.
- Say they can simply reply with answers, or pick a call time. Put the exact text {CAL} on its own line where the booking link goes.
- Sign off exactly: Nabeel Mumtaz / Zion Luxe, LLC · (636) 214-7701
${RULES}`;

function nudgeEmail(lead) {
  const user = `First name: ${String(lead.name || '').trim().split(/\s+/)[0]}
Destination: ${lead.destination} · When: ${lead.dates} · Travelers: ${lead.travelers} · Trip type: ${lead.tripType} · Budget: ${lead.budget}
Their notes: ${String(lead.formNotes || lead.notes || '-').slice(0, 2000)}
Draft itinerary we sent (for reference):
${String(lead.draft || '').slice(0, 3000)}`;
  return ruleChecked(NUDGE_SYSTEM, user);
}

module.exports = { outreach, callSheet, nudgeEmail };
