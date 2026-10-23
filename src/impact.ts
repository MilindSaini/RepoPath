import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceGraph, GraphEdge, GraphNode } from "./model.js";

export interface ImpactItem { node: GraphNode; distance: number; why: string; evidence: GraphEdge[]; }
export interface ImpactReport { changedFiles: string[]; direct: ImpactItem[]; downstream: ImpactItem[]; tests: GraphNode[]; usedConservativeFallback: boolean; unknowns: string[]; }
export interface ChangedRange { file: string; start: number; end: number; }

export function changedFilesFromGit(repository: string, base: string): string[] {
  try {
    return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: repository, encoding: "utf8", timeout: 5_000, stdio: ["pipe", "pipe", "ignore"] })
      .split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function changedRangesFromGit(repository: string, base: string): ChangedRange[] {
  try { return changedRangesFromPatch(execFileSync("git", ["diff", "--unified=0", `${base}...HEAD`], { cwd: repository, encoding: "utf8", timeout: 5_000, stdio: ["pipe", "pipe", "ignore"] })); }
  catch { return []; }
}

export function changedRangesFromPatch(patch: string): ChangedRange[] {
  const ranges: ChangedRange[] = [];
  let file: string | undefined;
  for (const line of patch.split(/\r?\n/)) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) { file = fileMatch[1]; continue; }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!file || !hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    ranges.push({ file, start, end: start + Math.max(count, 1) - 1 });
  }
  return ranges;
}

export function symbolsFromChangedRanges(repository: string, ranges: ChangedRange[]): string[] {
  const symbols = new Set<string>();
  for (const range of ranges) {
    let lines: string[];
    try { lines = readFileSync(join(repository, range.file), "utf8").split(/\r?\n/); } catch { continue; }
    for (let line = Math.min(range.end, lines.length) - 1; line >= 0; line -= 1) {
      const match = /(?:function\s+|class\s+|(?:const|let|var)\s+)([A-Za-z_$][\w$]*)/.exec(lines[line]);
      if (match) { symbols.add(match[1]); break; }
    }
  }
  return [...symbols];
}

export function analyzeImpact(graph: EvidenceGraph, changed: string[] | ChangedRange[], symbols: string[] = []): ImpactReport {
  const normalized: Array<{ file: string; start?: number; end?: number }> = changed.map((item) => typeof item === "string" ? { file: item.replaceAll("\\", "/") } : { ...item, file: item.file.replaceAll("\\", "/") });
  const normalizedFiles = [...new Set(normalized.map((item) => item.file))];
  const directNodes = graph.nodes.filter((node) => {
    const matchingChanges = node.location && normalized.filter((item) => item.file === node.location!.file);
    const changedAtLocation = matchingChanges?.some((item) => item.start === undefined || (node.location!.line >= item.start && node.location!.line <= (item.end ?? item.start)));
    return Boolean(changedAtLocation) || symbols.some((symbol) => node.label === symbol || node.id.includes(symbol));
  });
  const direct = directNodes.map((node) => ({ node, distance: 0, why: "Changed source location or requested symbol", evidence: [] }));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge]);
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const visited = new Set(directNodes.map((node) => node.id));
  const queue = directNodes.map((node) => ({ id: node.id, distance: 0 }));
  const downstream: ImpactItem[] = [];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.distance >= 8) continue;
    for (const edge of adjacency.get(current.id) ?? []) {
      const nextId = edge.source === current.id ? edge.target : edge.source;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const node = nodeById.get(nextId);
      if (!node) continue;
      downstream.push({ node, distance: current.distance + 1, why: `${edge.relation} at ${edge.evidence.location.file}:${edge.evidence.location.line} (${edge.evidence.status})`, evidence: [edge] });
      queue.push({ id: nextId, distance: current.distance + 1 });
    }
  }
  const recommended = [...direct, ...downstream].filter((item) => item.node.kind === "test").map((item) => item.node)
    .sort((a, b) => testEvidenceRank(graph, a) - testEvidenceRank(graph, b));
  const fallback = recommended.length === 0;
  const tests = fallback ? graph.nodes.filter((node) => node.kind === "test") : deduplicate(recommended);
  const unknowns: string[] = [];
  if (!direct.length) unknowns.push("No changed graph node was identified. Run a fresh scan and pass repository-relative --changed paths or --symbol values.");
  if (fallback) unknowns.push("No graph-backed test mapping reached a changed node. Recommend the full discovered test suite; do not skip tests.");
  return { changedFiles: normalizedFiles, direct, downstream, tests, usedConservativeFallback: fallback, unknowns };
}

export function toMarkdown(report: ImpactReport): string {
  const list = (items: ImpactItem[]) => items.length ? items.map((item) => `- ${item.node.kind}: **${item.node.label}** — ${item.why}`).join("\n") : "- None";
  const tests = report.tests.length ? report.tests.map((test) => `- ${test.label}${test.location ? ` — ${test.location.file}:${test.location.line}` : ""}`).join("\n") : "- No test files were discovered";
  return `# RepoPath impact report\n\n## Direct impact\n${list(report.direct)}\n\n## Downstream impact\n${list(report.downstream)}\n\n## Recommended tests${report.usedConservativeFallback ? " (conservative full-suite fallback)" : ""}\n${tests}\n\n## Unknowns and safeguards\n${report.unknowns.map((value) => `- ${value}`).join("\n") || "- None"}\n`;
}

function deduplicate(nodes: GraphNode[]): GraphNode[] { return [...new Map(nodes.map((node) => [node.id, node])).values()]; }

function testEvidenceRank(graph: EvidenceGraph, test: GraphNode): number {
  const exercises = graph.edges.filter((edge) => edge.relation === "EXERCISES" && edge.source === test.id);
  return exercises.some((edge) => edge.evidence.status === "statically_established") ? 0 : 1;
}
