import { readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const IGNORED = new Set([
  "node_modules",
  ".git",
  ".repopath",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "vendor",
  "__pycache__",
]);

export interface CollectOptions {
  include?: string[];
  exclude?: string[];
  root?: string;
}

export function findCommonRoot(paths: string[]): string {
  if (paths.length === 0) return ".";
  if (paths.length === 1) return resolve(paths[0]);
  const parts = paths.map((p) => resolve(p).split(/[/\\]/));
  const minLen = Math.min(...parts.map((p) => p.length));
  let commonIndex = 0;
  while (commonIndex < minLen && parts.every((p) => p[commonIndex] === parts[0][commonIndex])) {
    commonIndex++;
  }
  const result = parts[0].slice(0, commonIndex).join("/");
  return result || "/";
}

function isIgnoredDirectory(name: string, fullPath: string): boolean {
  if (IGNORED.has(name)) return true;
  if (/\.bak(?:-\d+)?$/i.test(name)) return true;
  if (/(?:[/\\]|^)(?:public|assets)[/\\](?:.*[/\\])?static[/\\]js$/i.test(fullPath)) return true;
  return false;
}

function isIgnoredFile(name: string, fullPath: string): boolean {
  // Compiled, minified, or chunked bundles
  if (/\.(?:min|bundle|chunk)\.[cm]?[jt]sx?$/i.test(name)) return true;
  // Content-hashed production chunks (e.g. main.79e4fc29.js, 238.7b13bc4a.chunk.js)
  if (/\.[a-f0-9]{8,}\.(?:chunk\.)?[cm]?[jt]sx?$/i.test(name)) return true;
  // Backup files
  if (/\.bak(?:\.|$)/i.test(name)) return true;
  // Production build artifacts placed in public directories
  if (/(?:[/\\]|^)(?:public|assets)[/\\](?:.*[/\\])?static[/\\]js[/\\]/i.test(fullPath)) return true;
  return false;
}

export async function collectFiles(targetDir: string, options: CollectOptions = {}): Promise<string[]> {
  const dir = resolve(targetDir);
  const baseRoot = options.root ? resolve(options.root) : dir;
  const include = options.include?.map((s) => s.trim().replaceAll("\\", "/")).filter(Boolean);
  const exclude = options.exclude?.map((s) => s.trim().replaceAll("\\", "/")).filter(Boolean);
  const found: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      const relFromRoot = relative(baseRoot, fullPath).replaceAll("\\", "/");
      const relFromDir = relative(dir, fullPath).replaceAll("\\", "/");

      if (entry.isDirectory()) {
        if (isIgnoredDirectory(entry.name, fullPath)) continue;

        if (exclude?.some((ex) => entry.name === ex || relFromRoot === ex || relFromRoot.startsWith(`${ex}/`) || relFromDir === ex || relFromDir.startsWith(`${ex}/`))) {
          continue;
        }

        if (include && include.length > 0 && directory === dir) {
          const matches = include.some((inc) => entry.name === inc || relFromRoot === inc || relFromRoot.startsWith(`${inc}/`) || inc.startsWith(`${relFromRoot}/`));
          if (!matches) continue;
        }

        await visit(fullPath);
      } else if (/\.(?:[cm]?[jt]sx?|py|prisma|sql)$/i.test(entry.name)) {
        if (isIgnoredFile(entry.name, fullPath)) continue;

        if (exclude?.some((ex) => entry.name === ex || relFromRoot === ex || relFromDir === ex)) {
          continue;
        }

        // Safety guard against massive data files or minified bundles
        const fileStat = await stat(fullPath).catch(() => null);
        if (fileStat) {
          if (/\.sql$/i.test(entry.name) && fileStat.size > 5 * 1024 * 1024) continue;
          if (/\.(?:[cm]?[jt]sx?|py)$/i.test(entry.name) && fileStat.size > 1.5 * 1024 * 1024) continue;
        }

        found.push(fullPath);
      }
    }
  }

  await visit(dir);
  return found.sort((a, b) => relative(baseRoot, a).localeCompare(relative(baseRoot, b)));
}

export function relativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

export function isTestPath(path: string): boolean {
  return /(?:^|\/)(__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(path);
}
