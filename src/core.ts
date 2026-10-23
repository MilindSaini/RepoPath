import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { collectFiles, findCommonRoot, isTestPath, relativePath } from "./files.js";
import { GraphBuilder, type EvidenceGraph, type ScanMetadata, type ScanScope, type ScanCoverage } from "./model.js";
import { analyzeTypeScript } from "./analyzers/typescript.js";
import { analyzePython } from "./analyzers/python.js";
import { importOpenApi } from "./analyzers/openapi.js";
import { importOpenTelemetry } from "./analyzers/traces.js";
import { analyzeSchemas } from "./analyzers/schema.js";

export interface ScanOptions {
  openapiPath?: string;
  tracesPath?: string;
  staleAfterDays?: number;
  include?: string[];
  exclude?: string[];
  root?: string;
}
export interface ScanResult { graph: EvidenceGraph; warnings: string[]; }

export async function buildGraph(target: string | string[], options: ScanOptions = {}): Promise<EvidenceGraph> {
  return (await buildGraphDetailed(target, options)).graph;
}

export async function buildGraphDetailed(target: string | string[], options: ScanOptions = {}): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const targets = Array.isArray(target) ? target : [target];
  const root = options.root ? resolve(options.root) : findCommonRoot(targets);
  const fileList: string[] = [];
  for (const t of targets) {
    const collected = await collectFiles(resolve(t), { include: options.include, exclude: options.exclude, root });
    fileList.push(...collected);
  }
  const files = [...new Set(fileList)].sort((a, b) => relativePath(root, a).localeCompare(relativePath(root, b)));
  const graph = new GraphBuilder(root);
  analyzeTypeScript(root, files, graph);
  analyzePython(root, files, graph);
  analyzeSchemas(root, files, graph);
  const warnings: string[] = [];
  if (options.openapiPath) warnings.push(...importOpenApi(resolve(options.openapiPath), graph).warnings);
  if (options.tracesPath) warnings.push(...importOpenTelemetry(resolve(options.tracesPath), graph, options.staleAfterDays));

  const revision = detectRevision(root);
  const workingTree = detectWorkingTree(root);
  const configHash = computeConfigHash(options);
  const scanScope = computeScanScope(graph, files, options);

  const scanMetadata: ScanMetadata = {
    id: `scan:${randomUUID()}`,
    startedAt,
    completedAt: new Date().toISOString(),
    toolVersion: "1.0.0",
    workingTree,
    configHash,
  };

  const result = graph.toGraph(scanScope, scanMetadata);
  if (revision) result.revision = revision;
  return { graph: result, warnings };
}

function detectRevision(root: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", timeout: 3_000, stdio: ["pipe", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return undefined;
  }
}

function detectWorkingTree(root: string): "clean" | "dirty" | "unknown" {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", timeout: 3_000, stdio: ["pipe", "pipe", "ignore"] });
    return out.trim() ? "dirty" : "clean";
  } catch {
    return "unknown";
  }
}

function computeConfigHash(options: ScanOptions): string {
  return createHash("sha256").update(JSON.stringify(options)).digest("hex").slice(0, 12);
}

function computeScanScope(graph: GraphBuilder, files: string[], options: ScanOptions): ScanScope {
  const nodes = graph.getNodes();
  const edges = graph.getEdges();
  const hasTsJsFiles = files.some((f) => /\.[cm]?[jt]sx?$/i.test(f));
  const hasPyFiles = files.some((f) => f.endsWith(".py"));
  const hasRoutes = nodes.some((n) => n.kind === "api_route");
  const hasTests = nodes.some((n) => n.kind === "test");
  const hasObserved = edges.some((e) => e.evidence.status === "observed");
  const testFiles = files.filter(isTestPath);

  let testScope: ScanCoverage = "not_scanned";
  if (testFiles.length > 0) {
    testScope = hasTests ? "complete" : "partial";
  } else if (hasTsJsFiles || hasPyFiles) {
    testScope = hasTests ? "complete" : "not_configured";
  }

  return {
    frontend: hasTsJsFiles ? "complete" : "not_scanned",
    backend: hasRoutes ? "complete" : "not_scanned",
    apiContracts: options.openapiPath ? "complete" : "not_configured",
    tests: testScope,
    runtimeTraces: options.tracesPath ? (hasObserved ? "complete" : "partial") : "not_imported",
  };
}
