// Item 059.2: the logic of the hand-off commands of item 059: recordHandoff is the producer's --handoff,
// acceptHandoff and rejectHandoff the team lead's --accept-handoff / --reject-handoff. Each takes
// ctx = {fm, body, slug, folder, repo} and the options, changes nothing on disk, and returns
// {refuse} (the text after "❌ ") or {fm: {<keys to set, in the stored form>}, text: <the block to append
// to the body>, event}. The data rules are 059.1's src/shared/handoff.js; the integration slice calls
// these from src/shared/lifecycle.js.
import { decodeList, dependentsOf, edgeState, encode, makeReceipt, makeRecord, receiptBlock, recordBlock } from './handoff.js';
import { now } from './store.js';
import { strip } from './team.js';

const source = ctx => `${ctx.repo}#${ctx.fm.seq}`;
// The current record for the dependent: the last one in the stored form, exactly as edgeState looks it up.
const currentRecord = (fm, dependent) =>
  (decodeList(fm.handoffs) ?? []).filter(r => r && r.dependent === dependent).at(-1);
const noRecord = (ctx, dependent) => {
  const state = edgeState(ctx.fm, dependent);
  return state === 'missing' || state === 'legacy'
    ? { refuse: `no hand-off record for dependent '${dependent}'; the producer records it first (--handoff)` }
    : null;
};

// The producer (the claimer) records its hand-off for a dependent: it replaces any earlier record for the
// same dependent (so the digest changes), handoffs: none becomes a list, and the body block is the method's
// DEPENDENCY_HANDOFF v1 block, which always names the item's real branch and the CLI session (lead ruling
// 2026-10-30): the item's branch front matter, and the session id, else the producing agent's id.
export function recordHandoff(ctx, { dependent, commit, contract, verification, outputs, pickup, risks, by }) {
  const { fm, folder, repo } = ctx;
  if (!by) return { refuse: "a hand-off is recorded by the item's claimer: --by <agent> is missing" };
  if (fm.status === 'archived') return { refuse: 'status is archived; an archived item does not record a hand-off' };
  if (by !== fm.claimed_by) return { refuse: `a hand-off is recorded by the claimer: the item is claimed by ${fm.claimed_by || 'nobody'}, not by ${by}` };
  const dependents = dependentsOf(folder, repo, fm);
  if (!dependents.some(d => d.id === dependent)) {
    return { refuse: `dependent '${dependent}' is not one of this item's dependents (${dependents.map(d => d.id).join(', ') || 'none'})` };
  }
  let record;
  try {
    record = makeRecord({ dependent, commit, contract, verification, outputs, pickup, risks, by, at: now() });
  } catch (e) {
    return { refuse: e.message };
  }
  const records = (decodeList(fm.handoffs) ?? []).filter(r => !(r && r.dependent === dependent));
  records.push(record);
  const block = recordBlock(record, source(ctx), { branch: fm.branch, session: strip(process.env.QWEN_CODE_SESSION_ID || '') || by });
  return { fm: { handoffs: records.map(encode) }, text: block, event: 'handoff' };
}

// The team lead accepts a hand-off: only the lead (a missing actor or lead identity is refused on its own,
// review r1), only while a record exists, and only after the producer's review passed (lead ruling
// 2026-10-30). The receipt pins the current record's digest and is appended to handoff_receipts
// (append-only); it records the reviewer and the verdict the review operation stored, and the reviewed
// commit - the record's commit, the one the review request named and the review reviewed (the producer
// records the hand-off at that commit, and no work after the review is labeled reviewed, review r2);
// a record without a commit takes the item's commit front matter, the creation HEAD (new.js).
export function acceptHandoff(ctx, { dependent, checks, by, lead }) {
  const { fm } = ctx;
  if (!strip(by || '')) return { refuse: 'a hand-off is accepted by the team lead: --by <agent> is missing' };
  if (!strip(lead || '')) return { refuse: 'a hand-off is accepted by the team lead: the team lead identity is missing' };
  if (by !== lead) return { refuse: `a hand-off is accepted by the team lead (${lead}), not by ${by}` };
  const missing = noRecord(ctx, dependent);
  if (missing) return missing;
  if (!strip(checks || '')) return { refuse: 'the acceptance of a hand-off needs its checks (--checks "<text>")' };
  if (fm.review_state !== 'passed') return { refuse: `the producer's review has not passed (review_state ${fm.review_state || 'none'}); the hand-off is accepted only after it` };
  const record = currentRecord(fm, dependent);
  const receipt = {
    ...makeReceipt({ dependent, digest: record.digest, result: 'accepted', by, at: now(), checks }),
    reviewer: fm.reviewer || '',
    verdict: fm.review_state,
    commit: record.commit || fm.commit,
  };
  // The ruling's reviewer, verdict and reviewed commit: 059.1's receiptBlock does not output them
  // (review r1), so the block appends them directly after the receipt block, which already ends in a
  // newline (no blank line, review r2).
  const text = receiptBlock(receipt, source(ctx))
    + `REVIEWER: ${receipt.reviewer} ; VERDICT: ${receipt.verdict} ; REVIEWED_COMMIT: ${receipt.commit}\n`;
  return { fm: { handoff_receipts: appendReceipts(fm, receipt) }, text, event: 'handoff-accepted' };
}

// The team lead rejects a hand-off: only the lead, only while a record exists; the receipt's checks hold
// the reason of the rejection.
export function rejectHandoff(ctx, { dependent, reason, by, lead }) {
  const { fm } = ctx;
  if (!strip(by || '')) return { refuse: 'a hand-off is rejected by the team lead: --by <agent> is missing' };
  if (!strip(lead || '')) return { refuse: 'a hand-off is rejected by the team lead: the team lead identity is missing' };
  if (by !== lead) return { refuse: `a hand-off is rejected by the team lead (${lead}), not by ${by}` };
  const missing = noRecord(ctx, dependent);
  if (missing) return missing;
  if (!strip(reason || '')) return { refuse: 'the rejection of a hand-off needs its reason (--reason "<text>")' };
  const record = currentRecord(fm, dependent);
  let receipt;
  try {
    receipt = makeReceipt({ dependent, digest: record.digest, result: 'rejected', by, at: now(), checks: reason });
  } catch (e) {
    return { refuse: e.message };
  }
  return { fm: { handoff_receipts: appendReceipts(fm, receipt) }, text: receiptBlock(receipt, source(ctx)), event: 'handoff-rejected' };
}

// The append-only receipt list: every earlier receipt stays, the new one is last (it is the one that counts).
const appendReceipts = (fm, receipt) => [...(decodeList(fm.handoff_receipts) ?? []), receipt].map(encode);
