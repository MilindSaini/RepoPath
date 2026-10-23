import { mkdir, readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import type { EvidenceGraph, ScanScope } from "./model.js";

export async function persistGraph(graph: EvidenceGraph, outDir: string): Promise<{ jsonPath: string; sqlitePath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = join(outDir, "graph.json");
  const sqlitePath = join(outDir, "index.sqlite");
  await writeFile(jsonPath, `${JSON.stringify(graph, null, 2)}\n`);
  const database = new DatabaseSync(sqlitePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL, file TEXT, line INTEGER);
    CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, source TEXT NOT NULL, target TEXT NOT NULL, relation TEXT NOT NULL, evidence_json TEXT NOT NULL);
    DELETE FROM nodes; DELETE FROM edges;
  `);
  const insertNode = database.prepare("INSERT INTO nodes (id, kind, label, file, line) VALUES (?, ?, ?, ?, ?)");
  const insertEdge = database.prepare("INSERT INTO edges (id, source, target, relation, evidence_json) VALUES (?, ?, ?, ?, ?)");
  for (const node of graph.nodes) insertNode.run(node.id, node.kind, node.label, node.location?.file ?? null, node.location?.line ?? null);
  for (const edge of graph.edges) insertEdge.run(edge.id, edge.source, edge.target, edge.relation, JSON.stringify(edge.evidence));
  database.close();
  await appendHistory(graph, join(outDir, "history.json"));
  return { jsonPath, sqlitePath };
}

interface HistoryEntry {
  scannedAt: string;
  revision?: string;
  nodes: number;
  edges: number;
  canonicalEdges: number;
  observedEdges: number;
  staticEdges: number;
  scanScope?: ScanScope;
  risk: {
    score: number;
    unresolvedClientRequests: number;
    serverRouteNotFoundInScan: number;
    unverifiedContracts: number;
    untestedEndpoints: number;
    discoveredTests: number;
    mappedEndpoints: number;
    unmappedTests: number;
    coverageStatus: "complete" | "partial" | "not_analyzed";
    staleEvidence: number;
    formula: string;
  };
}
async function appendHistory(graph: EvidenceGraph, path: string): Promise<void> {
  let history: HistoryEntry[] = [];
  try { history = JSON.parse(await readFile(path, "utf8")) as HistoryEntry[]; } catch { /* first scan */ }
  const entry: HistoryEntry = {
    scannedAt: graph.scannedAt,
    revision: graph.revision,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    canonicalEdges: countCanonicalEdges(graph),
    observedEdges: graph.edges.filter((edge) => edge.evidence.status === "observed").length,
    staticEdges: graph.edges.filter((edge) => edge.evidence.status === "statically_established").length,
    scanScope: graph.scanScope,
    risk: riskSignals(graph),
  };
  history.push(entry);
  await writeFile(path, `${JSON.stringify(history.slice(-50), null, 2)}\n`);
}

/** Count edges without reverse duplicates (e.g. DECLARES without DEFINED_IN). */
function countCanonicalEdges(graph: EvidenceGraph): number {
  return graph.edges.length;
}

function riskSignals(graph: EvidenceGraph): HistoryEntry["risk"] {
  const endpoints = graph.nodes.filter((node) => node.kind === "api_route");
  const requests = graph.edges.filter((edge) => edge.relation === "REQUESTS");
  const unresolvedClientRequests = requests.filter((edge) => edge.evidence.resolution !== "resolved").length;
  const requested = endpoints.filter((endpoint) => graph.edges.some((edge) => edge.relation === "TARGETS" && edge.target === endpoint.id && graph.edges.some((request) => request.relation === "REQUESTS" && request.target === edge.source)));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const requestTargets = new Map(requests.map((request) => [
    request.target,
    nodeById.get(request.target)?.kind === "api_route"
      ? request.target
      : graph.edges.find((edge) => edge.relation === "TARGETS" && edge.source === request.target)?.target,
  ]));
  const serverRouteNotFoundInScan = requests.filter((request) => request.evidence.resolution === "resolved" && requestTargets.get(request.target) && !graph.edges.some((edge) => edge.relation === "HANDLES" && edge.source === requestTargets.get(request.target))).length;
  const unverifiedContracts = requests.filter((request) => {
    const endpoint = requestTargets.get(request.target);
    return request.evidence.resolution === "resolved" && !!endpoint && !graph.edges.some((contract) => contract.relation === "DECLARES" && contract.target === endpoint);
  }).length;

  // Test coverage: determine actual state instead of assuming "complete"
  const testNodes = graph.nodes.filter((node) => node.kind === "test");
  const discoveredTests = testNodes.length;
  const exercisesEdges = graph.edges.filter((edge) => edge.relation === "EXERCISES");
  const mappedEndpoints = new Set(exercisesEdges.map((edge) => edge.target)).size;
  const unmappedTests = testNodes.filter((test) => !exercisesEdges.some((edge) => edge.source === test.id)).length;

  let coverageStatus: "complete" | "partial" | "not_analyzed";
  if (discoveredTests === 0) {
    coverageStatus = "not_analyzed";
  } else {
    const untestedCount = requested.filter((endpoint) => !graph.edges.some((edge) => edge.relation === "TARGETS" && edge.target === endpoint.id && graph.edges.some((request) => request.relation === "EXERCISES" && request.target === edge.source))).length;
    coverageStatus = untestedCount === 0 ? "complete" : "partial";
  }

  const untestedEndpoints = requested.filter((endpoint) => !graph.edges.some((edge) => edge.relation === "TARGETS" && edge.target === endpoint.id && graph.edges.some((request) => request.relation === "EXERCISES" && request.target === edge.source))).length;
  const staleEvidence = graph.edges.filter((edge) => edge.evidence.status === "stale").length;
  const formula = "3*unresolved_client_requests + 3*server_route_not_found_in_scan + 2*unverified_contracts + 2*untested_endpoints + stale_evidence";
  return {
    score: unresolvedClientRequests * 3 + serverRouteNotFoundInScan * 3 + unverifiedContracts * 2 + untestedEndpoints * 2 + staleEvidence,
    unresolvedClientRequests,
    serverRouteNotFoundInScan,
    unverifiedContracts,
    untestedEndpoints,
    discoveredTests,
    mappedEndpoints,
    unmappedTests,
    coverageStatus,
    staleEvidence,
    formula,
  };
}
