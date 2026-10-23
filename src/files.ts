import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const IGNORED = new Set(["node_modules", ".git", ".repopath", "dist", "coverage", ".next", ".venv", "venv"]);

export async function collectFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED.has(entry.name)) await visit(join(directory, entry.name));
      } else if (/\.(?:[cm]?[jt]sx?|py|prisma|sql)$/i.test(entry.name)) {
        found.push(join(directory, entry.name));
      }
    }
  }
  await visit(root);
  return found.sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
}

export function relativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

export function isTestPath(path: string): boolean {
  return /(?:^|\/)(__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
}
