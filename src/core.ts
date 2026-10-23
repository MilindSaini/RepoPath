import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { collectFiles } from "./files.js";
import { GraphBuilder, type EvidenceGraph, type ScanScope } from "./model.js";
import { analyzeTypeScript } from "./analyzers/typescript.js";
import { analyzePython } from "./analyzers/python.js";
import { importOpenApi } from "./analyzers/openapi.js";
import { importOpenTelemetry } from "./analyzers/traces.js";
import { analyzeSchemas } from "./analyzers/schema.js";

export interface ScanOptions { openapiPath?: string; tracesPath?: string; staleAfterDays?: number; }
export interface ScanResult { graph: EvidenceGraph; warnings: string[]; }

export async function buildGraph(target: string, options: ScanOptions = {}): Promise<EvidenceGraph> {
  return (await buildGraphDetailed(target, options)).graph;
}

export async function buildGraphDetailed(target: string, options: ScanOptions = {}): Promise<ScanResult> {
  const root = resolve(target);
  const files = await collectFiles(root);
  const graph = new GraphBuilder(root);
  analyzeTypeScript(root, files, graph);
  analyzePython(root, files, graph);
  analyzeSchemas(root, files, graph);
  const warnings: string[] = [];
  if (options.openapiPath) warnings.push(...importOpenApi(resolve(options.openapiPath), graph).warnings);
  if (options.tracesPath) warnings.push(...importOpenTelemetry(resolve(options.tracesPath), graph, options.staleAfterDays));

  const revision = detectRevision(root);
  const scanScope = computeScanScope(graph, files, options);

  const result = graph.toGraph(scanScope);
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

function computeScanScope(graph: GraphBuilder, files: string[], options: ScanOptions): ScanScope {
  const nodes = graph.getNodes();
  const edges = graph.getEdges();
  const hasTsJsFiles = files.some((f) => /\.[cm]?[jt]sx?$/i.test(f));
  const hasPyFiles = files.some((f) => f.endsWith(".py"));
  const hasRoutes = nodes.some((n) => n.kind === "api_route");
  const hasTests = nodes.some((n) => n.kind === "test");
  const hasObserved = edges.some((e) => e.evidence.status === "observed");

  return {
    frontend: hasTsJsFiles ? "complete" : "not_scanned",
    backend: hasRoutes ? "complete" : "not_scanned",
    apiContracts: options.openapiPath ? "complete" : "not_configured",
    tests: hasTests ? "complete" : hasTsJsFiles || hasPyFiles ? "not_analyzed" : "not_scanned",
    runtimeTraces: options.tracesPath ? (hasObserved ? "complete" : "partial") : "not_imported",
  };
}
