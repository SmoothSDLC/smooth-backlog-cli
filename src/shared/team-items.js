// What the plain commands say about an item that belongs to a team (decision AO). A plain command refuses such an item when it would change its
// team state (status, stage, claim, review, refinement, dependency, place in the team's queue, deletion): one line on standard output, exit 1,
// nothing written. move, archive of a closed item and archive done only file or store an item and keep working. One constant per text.
export const OF_A_TEAM = 'use backlog team update: a team item is changed only there, and its status moves by its team steps';
const names = slugs => (slugs.length > 5 ? `${slugs.slice(0, 5).join(', ')} and ${slugs.length - 5} more` : slugs.join(', '));
const belong = slugs => `${names(slugs)} ${slugs.length > 1 ? 'belong' : 'belongs'} to a team`;
export const REPLAN_TEAM = slugs => `use backlog team update --replan: ${belong(slugs)}, and a team item takes its place in the queue only there`;
export const ARCHIVE_OPEN_TEAM = slug => `use backlog team update: ${slug} belongs to a team and is not closed, and a team item is archived only after its team close (--force does not change that)`;
export const IMPORT_HIGHER_TEAM = slugs => `import --higher: ${belong(slugs)}, and a team item takes its place in the queue only with backlog team update --priority; nothing was moved (import without --higher moves them)`;
export const CLEAN_TEAM = slugs => `clean: ${belong(slugs)}, and no command deletes a team item (there is no team door for it); nothing was removed`;
