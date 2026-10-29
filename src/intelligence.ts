import { getSourceSnippet, classifyLayer } from "./graph-query.js";
import type { EvidenceGraph, GraphEdge, GraphNode } from "./model.js";

export interface ProjectBrief {
  summary: string;
  projectAreas: string[];
  entryPoints: GraphNode[];
  importantRoutes: GraphNode[];
  dataEntities: GraphNode[];
  tests: GraphNode[];
  problems: string[];
  nextSteps: string[];
  evidence: { discovered: number; verified: number; inferred: number; unresolved: number };
}

export interface HealthFinding {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  nodes: GraphNode[];
  evidence: GraphEdge[];
}

export interface ContractSummary {
  route: GraphNode;
  requests: GraphNode[];
  fields: Array<{ node: GraphNode; status: string; consumers: GraphNode[] }>;
  implementation: GraphNode[];
  warnings: string[];
}

export interface RetrievedEvidence {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sources: Array<{ file: string; line: number; content: string; exists: boolean }>;
  uncertainties: string[];
}

export type ApiResolution = "MATCHED" | "AMBIGUOUS" | "UNRESOLVED" | "EXTERNAL" | "STATIC_ASSET";
export type ApiContractStatus = "described" | "partially_described" | "missing";
export interface ApiOperation {
  operationId: string;
  method: string;
  path: string;
  route?: GraphNode;
  requests: GraphNode[];
  handlers: GraphNode[];
  dataDependencies: GraphNode[];
  consumers: GraphNode[];
  fields: Array<{ node: GraphNode; status: string; consumers: GraphNode[] }>;
  tests: GraphNode[];
  evidence: GraphEdge[];
  resolution: ApiResolution;
  contractStatus: ApiContractStatus;
  sourceLocations: Array<{ file: string; line: number }>;
  warnings: string[];
}

export function buildApiOperations(graph: EvidenceGraph): ApiOperation[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const routeNodes = graph.nodes.filter((node) => node.kind === "api_route");
  const requests = graph.nodes.filter((node) => node.kind === "api_request");
  const operations: ApiOperation[] = [];
  const linkedRequestIds = new Set<string>();

  for (const route of routeNodes) {
    const targetEdges = graph.edges.filter((edge) => edge.relation === "TARGETS" && edge.target === route.id);
    const routeRequests = targetEdges.map((edge) => byId.get(edge.source)).filter(Boolean) as GraphNode[];
    routeRequests.forEach((request) => linkedRequestIds.add(request.id));
    const handlerEdges = graph.edges.filter((edge) => (edge.relation === "HANDLES" || edge.relation === "HANDLES_ROUTE") && edge.source === route.id);
    const handlers = handlerEdges.map((edge) => byId.get(edge.target)).filter(Boolean) as GraphNode[];
    const dataDependencies = collectReachable(graph, handlers.map((node) => node.id), ["CALLS", "TOUCHES_DATABASE", "QUERIES", "READS_TABLE", "WRITES_TABLE"], byId);
    const consumerEdges = graph.edges.filter((edge) => edge.relation === "TARGETS" && edge.target === route.id);
    const consumers = consumerEdges.flatMap((edge) => {
      return graph.edges.filter((candidate) => candidate.relation === "REQUESTS" && candidate.target === edge.source).map((candidate) => byId.get(candidate.source)).filter(Boolean) as GraphNode[];
    });
    const fieldEdges = graph.edges.filter((edge) => edge.relation === "DECLARES_FIELD" && edge.source === route.id);
    const fields = fieldEdges.map((edge) => {
      const node = byId.get(edge.target);
      if (!node) return undefined;
      const fieldConsumers = graph.edges.filter((candidate) => ["READS_FIELD", "CONSUMES_FIELD"].includes(candidate.relation) && candidate.target === node.id).map((candidate) => byId.get(candidate.source)).filter(Boolean) as GraphNode[];
      return { node, status: edge.evidence.status, consumers: fieldConsumers };
    }).filter(Boolean) as ApiOperation["fields"];
    const tests = graph.edges.filter((edge) => (edge.relation === "TESTS" || edge.relation === "EXERCISES") && edge.target === route.id).map((edge) => byId.get(edge.source)).filter(Boolean) as GraphNode[];
    const evidence = [...targetEdges, ...handlerEdges, ...fieldEdges];
    const warnings: string[] = [];
    if (!handlers.length) warnings.push("No route handler was mapped.");
    if (!fields.length) warnings.push("No formal response schema fields were discovered.");
    if (!tests.length) warnings.push("No discovered test directly exercises this operation.");
    operations.push(makeApiOperation(route.label, route, routeRequests, handlers, dataDependencies, consumers, fields, tests, evidence, "MATCHED", warnings));
  }

  for (const request of requests.filter((node) => !linkedRequestIds.has(node.id))) {
    const url = String(request.attributes?.urlPattern ?? request.label);
    const method = String(request.attributes?.httpMethod ?? request.label.split(" ")[0] ?? "HTTP").toUpperCase();
    const resolution: ApiResolution = /^https?:\/\//i.test(url) ? "EXTERNAL" : request.kind === "static_asset" ? "STATIC_ASSET" : "UNRESOLVED";
    const warnings = [resolution === "EXTERNAL" ? "Request targets a service outside the scanned backend roots." : "No deterministic server route match was discovered."];
    operations.push(makeApiOperation(`${method} ${url}`, undefined, [request], [], [], [], [], [], [], resolution, warnings));
  }
  return operations.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

function makeApiOperation(
  identity: string,
  route: GraphNode | undefined,
  requests: GraphNode[],
  handlers: GraphNode[],
  dataDependencies: GraphNode[],
  consumers: GraphNode[],
  fields: ApiOperation["fields"],
  tests: GraphNode[],
  evidence: GraphEdge[],
  resolution: ApiResolution,
  warnings: string[],
): ApiOperation {
  const [method, ...pathParts] = identity.split(" ");
  const path = pathParts.join(" ") || identity;
  const sourceLocations = [...[route, ...requests, ...handlers].filter(Boolean).map((node) => node!.location).filter(Boolean) as Array<{ file: string; line: number }>];
  return {
    operationId: `operation:${method}:${path}`,
    method,
    path,
    route,
    requests,
    handlers,
    dataDependencies,
    consumers,
    fields,
    tests,
    evidence,
    resolution,
    contractStatus: fields.length ? "described" : route ? "partially_described" : "missing",
    sourceLocations,
    warnings,
  };
}

function collectReachable(graph: EvidenceGraph, startIds: string[], relations: string[], byId: Map<string, GraphNode>): GraphNode[] {
  const found = new Set<string>();
  const queue = [...startIds];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.edges.filter((candidate) => candidate.source === current && relations.includes(candidate.relation))) {
      if (found.has(edge.target)) continue;
      found.add(edge.target);
      queue.push(edge.target);
    }
  }
  return [...found].map((id) => byId.get(id)).filter(Boolean) as GraphNode[];
}

export function buildProjectBrief(graph: EvidenceGraph): ProjectBrief {
  const frontend = graph.nodes.filter((n) => classifyLayer(n) === "frontend");
  const backend = graph.nodes.filter((n) => classifyLayer(n) === "backend");
  const data = graph.nodes.filter((n) => classifyLayer(n) === "data_layer");
  const tests = graph.nodes.filter((n) => n.kind === "test");
  const incoming = new Set(graph.edges.map((e) => e.target));
  const entryPoints = frontend.filter((n) => !incoming.has(n.id)).slice(0, 6);
  const unresolved = graph.edges.filter((e) => e.evidence.status === "unresolved").length;
  const inferred = graph.edges.filter((e) => e.evidence.status === "inferred").length;
  const verified = graph.edges.filter((e) => e.evidence.status === "statically_established").length;
  const problems: string[] = [];
  if (unresolved > 0) problems.push(`${unresolved} unresolved relationships need investigation.`);
  if (graph.nodes.filter((n) => n.kind === "api_request" && n.attributes?.pathResolution === "unresolved").length > 0) problems.push("Some client requests have unresolved paths or route targets.");
  if (tests.length === 0) problems.push("No tests were discovered in the scanned scope; coverage is not established.");
  if (graph.scanScope) {
    for (const [layer, state] of Object.entries(graph.scanScope)) {
      if (state !== "complete") problems.push(`${layer} analysis is ${state}; absence of findings is not proof of absence.`);
    }
  }
  const nextSteps = problems.length
    ? problems.slice(0, 4).map((problem) => `Investigate: ${problem}`)
    : ["Trace a representative API flow.", "Review the most connected entry point.", "Run impact analysis before changing a shared module."];
  return {
    summary: `This codebase contains ${frontend.length} frontend, ${backend.length} API/backend, and ${data.length} data-layer entities connected by evidence-backed relationships.`,
    projectAreas: [...new Set(graph.nodes.map((n) => n.location?.file?.split("/")[0]).filter(Boolean) as string[])].slice(0, 8),
    entryPoints,
    importantRoutes: graph.nodes.filter((n) => n.kind === "api_route").slice(0, 8),
    dataEntities: data.filter((n) => ["database_table", "database_entity", "data_model"].includes(n.kind)).slice(0, 8),
    tests: tests.slice(0, 8),
    problems,
    nextSteps,
    evidence: { discovered: graph.nodes.length, verified, inferred, unresolved },
  };
}

export function runHealthChecks(graph: EvidenceGraph): HealthFinding[] {
  const findings: HealthFinding[] = [];
  const routes = graph.nodes.filter((n) => n.kind === "api_route");
  const routeIds = new Map<string, GraphNode[]>();
  for (const route of routes) {
    const key = route.label.toUpperCase();
    routeIds.set(key, [...(routeIds.get(key) ?? []), route]);
  }
  for (const [key, nodes] of routeIds) {
    if (nodes.length > 1) findings.push({ id: "duplicate-route", severity: "warning", message: `Duplicate route declaration: ${key}`, nodes, evidence: graph.edges.filter((e) => nodes.some((n) => e.source === n.id || e.target === n.id)) });
  }
  const unresolved = graph.edges.filter((e) => e.evidence.status === "unresolved");
  if (unresolved.length) findings.push({ id: "unresolved-relationships", severity: "warning", message: `${unresolved.length} relationships are unresolved and must not be treated as verified.`, nodes: [], evidence: unresolved.slice(0, 20) });
  const tests = graph.nodes.filter((n) => n.kind === "test");
  const covered = new Set(graph.edges.filter((e) => e.relation === "EXERCISES" || e.relation === "TESTS").map((e) => e.target));
  const untested = graph.nodes.filter((n) => ["api_route", "database_operation", "ui_component"].includes(n.kind) && !covered.has(n.id));
  if (untested.length) findings.push({ id: "untested-surface", severity: "info", message: `${untested.length} important entities have no discovered test mapping (${tests.length} tests scanned).`, nodes: untested.slice(0, 20), evidence: [] });
  const cycles = findCycles(graph);
  if (cycles.length) findings.push({ id: "circular-dependency", severity: "warning", message: `${cycles.length} circular dependency path(s) found.`, nodes: cycles.flat().slice(0, 20), evidence: [] });
  return findings;
}

function findCycles(graph: EvidenceGraph): GraphNode[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const cycles: GraphNode[][] = [];
  for (const start of graph.nodes) {
    const path = new Set<string>();
    const walk = (id: string, depth: number): void => {
      if (depth > 8) return;
      if (path.has(id)) {
        const node = byId.get(id);
        if (node) cycles.push([node]);
        return;
      }
      path.add(id);
      for (const target of adjacency.get(id) ?? []) walk(target, depth + 1);
      path.delete(id);
    };
    walk(start.id, 0);
  }
  return cycles.slice(0, 20);
}

export function exploreContracts(graph: EvidenceGraph): ContractSummary[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  return graph.nodes.filter((n) => n.kind === "api_route").map((route) => {
    const requests = graph.edges.filter((e) => e.relation === "TARGETS" && e.target === route.id).map((e) => byId.get(e.source)).filter(Boolean) as GraphNode[];
    const implementation = graph.edges.filter((e) => (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE") && e.source === route.id).map((e) => byId.get(e.target)).filter(Boolean) as GraphNode[];
    const fields = graph.edges.filter((e) => e.relation === "DECLARES_FIELD" && e.source === route.id).map((edge) => {
      const node = byId.get(edge.target);
      if (!node) return undefined;
      const consumers = graph.edges.filter((candidate) => (candidate.relation === "READS_FIELD" || candidate.relation === "CONSUMES_FIELD") && candidate.target === node.id).map((candidate) => byId.get(candidate.source)).filter(Boolean) as GraphNode[];
      return { node, status: edge.evidence.status, consumers };
    }).filter(Boolean) as ContractSummary["fields"];
    const warnings: string[] = [];
    if (!requests.length) warnings.push("No statically matched client request was discovered.");
    if (!implementation.length) warnings.push("No handler implementation was discovered.");
    if (fields.some((field) => field.consumers.length === 0)) warnings.push("Some response fields have no discovered consumer.");
    return { route, requests, fields, implementation, warnings };
  });
}

export function retrieveEvidence(question: string, graph: EvidenceGraph, repoRoot: string | string[], limit = 12): RetrievedEvidence {
  const terms = question.toLowerCase().split(/[^a-z0-9_$/-]+/).filter((term) => term.length > 2);
  const score = (node: GraphNode): number => terms.reduce((total, term) => total + (node.label.toLowerCase().includes(term) ? 4 : 0) + (node.location?.file.toLowerCase().includes(term) ? 2 : 0), 0);
  const nodes = graph.nodes.map((node) => ({ node, score: score(node) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.node);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.source) || ids.has(edge.target)).slice(0, limit * 2);
  const sourceKeys = new Set<string>();
  const sources: RetrievedEvidence["sources"] = [];
  for (const node of nodes) {
    if (!node.location) continue;
    const key = `${node.location.file}:${node.location.line}`;
    if (sourceKeys.has(key)) continue;
    sourceKeys.add(key);
    const snippet = getSourceSnippet(repoRoot, node.location.file, node.location.line, 4);
    sources.push({ file: node.location.file, line: node.location.line, content: snippet.content, exists: snippet.exists });
  }
  const uncertainties = edges.filter((e) => e.evidence.status === "unresolved" || e.evidence.status === "inferred").map((e) => `${e.relation} is ${e.evidence.status}: ${e.evidence.detail}`);
  return { nodes, edges, sources, uncertainties };
}

export function architectureMarkdown(graph: EvidenceGraph): string {
  const brief = buildProjectBrief(graph);
  const layers = ["frontend", "api_client", "backend", "data_layer", "tests"] as const;
  const sections = layers.map((layer) => {
    const nodes = graph.nodes.filter((node) => classifyLayer(node) === layer).slice(0, 30);
    return `## ${layer}\n\n${nodes.length ? nodes.map((node) => `- **${node.label}** (${node.kind})${node.location ? ` — ${node.location.file}:${node.location.line}` : ""}`).join("\n") : "- No entities discovered in this scope."}`;
  });
  const flowEdges = graph.edges.filter((edge) => ["REQUESTS", "TARGETS", "HANDLES", "TOUCHES_DATABASE", "QUERIES"].includes(edge.relation)).slice(0, 40);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const mermaid = flowEdges.map((edge) => `  ${mermaidId(edge.source)} -->|${edge.relation}| ${mermaidId(edge.target)}`).join("\n");
  return `# RepoPath Architecture\n\n${brief.summary}\n\n## Evidence boundaries\n\n- Discovered entities: ${brief.evidence.discovered}\n- Verified relationships: ${brief.evidence.verified}\n- Inferred relationships: ${brief.evidence.inferred}\n- Unresolved relationships: ${brief.evidence.unresolved}\n\n${sections.join("\n\n")}\n\n## Representative flows\n\n\`\`\`mermaid\nflowchart LR\n${mermaid || "  no_evidence[No representative flow discovered]"}\n\`\`\`\n\n## Evidence-backed relationship details\n\n${flowEdges.length ? flowEdges.map((edge) => `- ${byId.get(edge.source)?.label ?? edge.source} **${edge.relation}** ${byId.get(edge.target)?.label ?? edge.target} — ${edge.evidence.status} (${edge.evidence.location.file}:${edge.evidence.location.line})`).join("\n") : "- No flow relationships discovered."}\n`;
}

function mermaidId(id: string): string {
  return `n${[...id].map((char) => /[a-z0-9]/i.test(char) ? char : "_").join("")}`;
}
