// What `backlog team` installs when it loads (src/team/team.js). Every other command runs with these defaults: items are read with the
// solo rule, no team scope bounds a session, and only work with the status "in progress" counts against a work-in-progress limit.
export const seam = {
  entry: null, // fm -> the team entry that governs the item
  isMember: null, // (team, agent) -> whether the agent belongs to the team
  scope: () => ({ repo: '', branch: '' }), // the repository and branch a session is bound to
  inScope: () => true, // fm -> whether a session may order the item
  alsoActive: () => false, // fm -> work that counts as in progress besides the status "in progress"
};
