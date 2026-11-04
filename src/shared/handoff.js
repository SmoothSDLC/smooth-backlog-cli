// The hand-off data rules of item 059 (the item-dependency-handoff method; spec
// 2026-10-26-atomic-item-execution-dependency-handoffs.md): for every depends_on edge "dependent D depends on
// producer P", P's front matter holds a hand-off record for D (key handoffs, or 'none' when P has no dependents)
// and the team lead's append-only receipts (key handoff_receipts) pin the record's digest; D's edge is satisfied
// only while the last receipt for D accepts the current record. Item 059.1: pure functions, no command yet —
// nothing calls these.
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { asList, strip } from './team.js';
import { load } from './store.js';

const HEX40 = /^[0-9a-f]{40}$/i; // git commit ids are hex, any case
const empty = v => !v || !String(v).trim();

// The sha256 hex of the seven fields a receipt pins; a replacement record changes one of them and so its digest.
export const digest = fields => createHash('sha256')
  .update(JSON.stringify([fields.dependent, fields.commit, fields.contract, fields.verification, fields.outputs, fields.pickup, fields.risks]))
  .digest('hex');

// The producer's record for one dependent (a handoffs list item): the seven fields above plus by, at and its digest.
export function makeRecord({ dependent, commit, contract, verification, outputs = '', pickup = '', risks = 'NONE', by, at }) {
  if (empty(dependent)) throw new Error("handoff record: 'dependent' is empty");
  if (!HEX40.test(String(commit ?? ''))) throw new Error(`handoff record: 'commit' must be a 40-hex commit id, got '${commit}'`);
  if (empty(contract)) throw new Error("handoff record: 'contract' is empty");
  if (empty(verification)) throw new Error("handoff record: 'verification' is empty");
  return { dependent, commit, contract, verification, outputs, pickup, risks, by, at, digest: digest({ dependent, commit, contract, verification, outputs, pickup, risks }) };
}

// The team lead's receipt for one dependent (a handoff_receipts item, append-only): pins the record's digest; the
// last receipt for a dependent is the one that counts for the edge.
export function makeReceipt({ dependent, digest, result, by, at, checks }) {
  if (result !== 'accepted' && result !== 'rejected') throw new Error(`handoff receipt: 'result' must be 'accepted' or 'rejected', got '${result}'`);
  if (empty(checks)) throw new Error("handoff receipt: 'checks' is empty");
  return { dependent, digest, result, by, at, checks };
}

// The front-matter codec holds only scalars and lists of scalars, so each record and receipt is stored as one compact
// JSON string in its list (handoffs: ["{...}"], handoff_receipts: ["{...}"]). encode is the string; decodeList reads it back.
export const encode = obj => JSON.stringify(obj);
// The stored form of handoffs / handoff_receipts as an array of objects: a list of JSON strings (in-memory objects pass
// through), the string 'none' or an empty list to [], a missing key or a present key with no value to null; edgeState
// tells a legacy producer (no handoffs key) from a present-but-empty one by the key's presence.
export function decodeList(value) {
  if (value == null) return null;
  if (typeof value === 'string') return ['', 'none'].includes(strip(value).toLowerCase()) ? [] : [JSON.parse(value)];
  if (!Array.isArray(value)) throw new Error(`hand-off list: expected a list of JSON strings, the string none, or a missing key, got ${typeof value}`);
  return value.map(e => (typeof e === 'string' ? JSON.parse(e) : e));
}

// The state of the edge from the producer (its front matter) to dependentId, the dependent as the producer's
// repository names it (its seq, or owner/name#seq for another repository): legacy (a done producer without a
// handoffs key: closed before the rule), missing (no record for the dependent, including handoffs: none and a
// present but empty handoffs key), unaccepted (a record, no receipt), stale (the last receipt pins another digest,
// or the record's digest is not the sha256 of the record's own fields, including a record or receipt without a
// digest), rejected or accepted (the last receipt of the current record). Only accepted and legacy satisfy the edge.
export function edgeState(producerFm, dependentId) {
  const records = decodeList(producerFm.handoffs);
  if (records === null) {
    // the codec gives null for a missing key and for a present key with no value; only the missing key is the legacy mark
    return Object.hasOwn(producerFm, 'handoffs') ? 'missing' : producerFm.status === 'done' ? 'legacy' : 'missing';
  }
  if (!records.length) return 'missing'; // handoffs: none, or a list without a record for the dependent
  const record = records.filter(r => r && r.dependent === dependentId).at(-1);
  if (!record) return 'missing';
  const receipts = (decodeList(producerFm.handoff_receipts) ?? []).filter(r => r && r.dependent === dependentId);
  const last = receipts.at(-1);
  if (!last) return 'unaccepted';
  if (empty(record.digest) || record.digest !== digest(record)) return 'stale'; // a digest that is not the sha256 of the record's own fields pins nothing (review r3)
  if (last.digest !== record.digest) return 'stale'; // an absent digest pins nothing, so undefined !== undefined
  return last.result === 'accepted' ? 'accepted' : 'rejected'; // only an acceptance of the current record satisfies the edge
}

export const satisfied = state => state === 'accepted' || state === 'legacy';

// Every not-archived item of any repository folder of the backlog repository that names the producer in
// depends_on: in the producer's own folder by its seq or slug, in another folder as <producer repoId>#<seq>.
// The id is the dependent as the producer's repository names it (its seq, or owner/name#seq for another
// repository). folder: the producer's folder <home>/<owner>/<name>; the other folders are its siblings under home.
export function dependentsOf(folder, repoId, producerFm) {
  const home = dirname(dirname(resolve(folder)));
  const out = [];
  // An unreadable home or folder propagates: a skipped repository could hold a dependent the close gate then misses (review r1).
  const owners = readdirSync(home, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
  const seqNum = producerFm.seq != null ? Number(producerFm.seq) : null;
  const digit = s => (/^\d+$/.test(String(s)) ? Number(s) : null); // ids compare numerically: 005 and 5 name the same item
  // The slug a local dependent can use to name the producer: its phase, or its file name when the front matter has no
  // phase (the store's slug convention, slugOf in store.js and nodeOf in team.js) - a phase-less producer must be
  // findable by that file-name slug, or the dependent is missed by the close gate (review r5).
  let producerSlug = typeof producerFm.phase === 'string' && producerFm.phase !== '' ? producerFm.phase : null;
  if (producerSlug === null && seqNum !== null) {
    const self = load(folder).find(i => Number(i.fm.seq) === seqNum);
    producerSlug = self ? basename(self.path, '.md') : null;
  }
  for (const owner of owners) {
    const repos = readdirSync(join(home, owner), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort();
    for (const name of repos) {
      const repo = `${owner}/${name}`;
      const items = load(join(home, owner, name));
      for (const it of items) {
        const status = Object.hasOwn(it.fm, 'status') ? it.fm.status : 'pending';
        if (status === 'archived') continue;
        const namesProducer = asList(it.fm.depends_on).some(dep => repo === repoId
          ? (seqNum !== null && digit(dep) === seqNum) || (producerSlug !== null && dep === producerSlug)
          : seqNum !== null && dep.startsWith(`${repoId}#`) && digit(dep.slice(repoId.length + 1)) === seqNum);
        if (!namesProducer) continue;
        out.push({
          id: repo === repoId ? String(it.fm.seq) : `${repo}#${it.fm.seq}`,
          repository: repo,
          seq: Number(it.fm.seq),
          slug: it.fm.phase || basename(it.path, '.md'),
          status,
        });
      }
    }
  }
  return out.sort((a, b) => (a.repository === b.repository ? a.seq - b.seq : a.repository < b.repository ? -1 : 1));
}

// The dependents of the producer whose edge is not accepted: what a producer still owes them before they may be
// offered or claimed.
export function openEdges(folder, repoId, producerFm) {
  return dependentsOf(folder, repoId, producerFm)
    .map(d => ({ dependent: d.id, state: edgeState(producerFm, d.id) }))
    .filter(e => e.state !== 'accepted');
}

// The producer record as the method's DEPENDENCY_HANDOFF v1 body block (source: <owner>/<name>#<seq> of the
// producer), appended to the producer's item body. The record has no branch, session or review field, so the CLI
// passes them in opts (lead decision 2026-10-30): the PRODUCER_AGENT line carries the session inline when given,
// BRANCH is always written (the given branch or the text 'unspecified', never a default), and REVIEW is the given
// value or 'pending'.
export function recordBlock(record, source, opts = {}) {
  const agent = opts.session ? `${record.by} ; SESSION: ${opts.session}` : record.by;
  const branch = opts.branch || 'unspecified';
  const review = opts.review || 'pending';
  return [
    'DEPENDENCY_HANDOFF v1',
    `SOURCE_ITEM: ${source}`,
    `DEPENDENT_ITEM: ${record.dependent}`,
    `PRODUCER_AGENT: ${agent}`,
    `SOURCE_COMMIT: ${record.commit} ; BRANCH: ${branch}`,
    `CONTRACT: ${record.contract}`,
    `OUTPUTS: ${record.outputs}`,
    `VERIFICATION: ${record.verification}`,
    `REVIEW: ${review}`,
    `PICKUP: ${record.pickup}`,
    `OPEN_RISKS: ${record.risks}`,
    'END_DEPENDENCY_HANDOFF',
  ].join('\n') + '\n';
}

// The lead's receipt as the method's HANDOFF_ACCEPTED v1 / HANDOFF_REJECTED v1 body block (its field names
// HANDOFF_REVISION / REVIEWER_LEAD / UTC / RESULT, no END line), appended to the producer's item body.
export function receiptBlock(receipt, source) {
  const kind = receipt.result === 'accepted' ? 'ACCEPTED' : 'REJECTED';
  return [
    `HANDOFF_${kind} v1`,
    `SOURCE_ITEM: ${source} ; DEPENDENT_ITEM: ${receipt.dependent}`,
    `HANDOFF_REVISION: ${receipt.digest}`,
    `REVIEWER_LEAD: ${receipt.by}`,
    `CHECKS: ${receipt.checks}`,
    `UTC: ${receipt.at} ; RESULT: ${kind}`,
  ].join('\n') + '\n';
}
