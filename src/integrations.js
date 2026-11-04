// The agent folders the backlog skill is deployed into by `backlog setup`: one per agent product that reads skills from
// the repository. detect: the folder that shows the product is used here; destination: where the skill copy goes.
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, safePath } from './storage.js';
export const templateRoot = fileURLToPath(new URL('../templates/', import.meta.url));
export const adapters = [
  { name: 'agents', detect: '.agents', destination: '.agents/skills/backlog' },
  { name: 'claude-code', detect: '.claude', destination: '.claude/skills/backlog' },
  { name: 'github-copilot', detect: '.github', destination: '.github/skills/backlog' },
  { name: 'qwen-code', detect: '.qwen', destination: '.qwen/skills/backlog' },
];
// No symbolic link anywhere under path (a link would send the skill copy outside the repository).
export async function safeTree(root, path) {
  await safePath(root, path);
  if (await exists(path) && (await fs.lstat(path)).isDirectory()) for (const entry of await fs.readdir(path)) await safeTree(root, join(path, entry));
}
