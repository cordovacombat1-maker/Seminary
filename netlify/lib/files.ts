// Find files bundled with the functions (prompts/ and curriculum/, see netlify.toml included_files).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOTS = [
  process.cwd(),
  process.env.LAMBDA_TASK_ROOT ?? '',
  path.resolve(process.cwd(), '..'),
  '/var/task',
].filter(Boolean);

export function projectPath(rel: string): string {
  for (const root of ROOTS) {
    const p = path.join(root, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(`Bundled file not found: ${rel}`);
}

export const readProjectFile = (rel: string) => readFileSync(projectPath(rel), 'utf8');

export function listProjectDir(rel: string): string[] {
  return readdirSync(projectPath(rel));
}
