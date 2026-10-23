export type NodeKind = "ui_component" | "context" | "api_route" | "api_request" | "static_asset" | "function" | "test" | "source_file" | "database_operation" | "runtime_trace" | "api_contract" | "api_field" | "query_parameter" | "database_entity";
export type EvidenceStatus = "observed" | "statically_established" | "inferred" | "stale" | "unresolved";
export type Relation = "REQUESTS" | "TARGETS" | "FETCHES_ASSET" | "HANDLES" | "EXERCISES" | "CALLS" | "IMPORTS" | "RENDERS" | "PASSES_CALLBACK" | "PROVIDES_CONTEXT" | "CONSUMES_CONTEXT" | "TOUCHES_DATABASE" | "DECLARES" | "DECLARES_FIELD" | "CONSUMES_FIELD" | "OBSERVED_FIELD" | "OBSERVED" | "READS_FIELD" | "SENDS_PARAMETER" | "TESTS";

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
}

export interface Evidence {
  location: SourceLocation;
  method: "typescript_compiler" | "python_literal" | "openapi_import" | "opentelemetry_import" | "git_diff" | "policy_rule" | "schema_import";
  status: EvidenceStatus;
  confidence: "high" | "medium" | "low";
  detail: string;
  derivation?: "extracted" | "resolved" | "inferred" | "ambiguous";
  executionStatus?: "observed" | "unknown" | "contradicted";
  urlTemplate?: string;
  resolution?: "resolved" | "partially_resolved" | "unresolved";
  traceId?: string;
  observedAt?: string;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  location?: SourceLocation;
  attributes?: {
    isReactComponent?: boolean;
    isHook?: boolean;
    isProvider?: boolean;
    parameter?: string;
    field?: string;
    endpoint?: string;
    source?: string;
    inferred?: boolean;
    [key: string]: string | boolean | number | undefined;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: Relation;
  evidence: Evidence;
}

export type ScanCoverage = "complete" | "partial" | "not_scanned" | "not_analyzed" | "not_configured" | "not_imported";

export interface ScanScope {
  frontend: ScanCoverage;
  backend: ScanCoverage;
  apiContracts: ScanCoverage;
  tests: ScanCoverage;
  runtimeTraces: ScanCoverage;
}

export interface ScanMetadata {
  id: string;
  startedAt: string;
  completedAt: string;
  toolVersion: string;
  workingTree: "clean" | "dirty" | "unknown";
  sourceHash?: string;
  configHash?: string;
}

export interface EvidenceGraph {
  schemaVersion: "1.0.0";
  version: 2;
  scannedAt: string;
  repository: string;
  revision?: string;
  scan?: ScanMetadata;
  scanScope?: ScanScope;
  analysis?: { filesScanned: number; warnings: string[]; supported: string[]; };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class GraphBuilder {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, GraphEdge>();

  constructor(private readonly repository: string) {}

  addNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (!existing) this.nodes.set(node.id, node);
  }

  addEdge(edge: Omit<GraphEdge, "id">): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error(`Cannot add ${edge.relation} edge with missing node: ${edge.source} -> ${edge.target}`);
    }
    const id = [edge.source, edge.relation, edge.target].join("|");
    const existing = this.edges.get(id);
    if (!existing) {
      this.edges.set(id, { ...edge, id });
    }
  }

  findMatchingEndpoint(method: string, path: string): GraphNode | undefined {
    const exact = endpointId(method, path);
    const exactNode = this.nodes.get(exact);
    if (exactNode) return exactNode;
    const requested = canonicalPath(path).split("/");
    return [...this.nodes.values()].find((node) => {
      if (node.kind !== "api_route" || !node.id.startsWith(`endpoint:${method.toUpperCase()} `)) return false;
      const candidate = node.id.replace(`endpoint:${method.toUpperCase()} `, "").split("/");
      return candidate.length === requested.length && candidate.every((segment, index) => /^\{[^}]+\}$/.test(segment) || segment === requested[index]);
    });
  }

  getNodes(): GraphNode[] { return [...this.nodes.values()]; }
  getEdges(): GraphEdge[] { return [...this.edges.values()]; }

  toGraph(scanScope?: ScanScope, scanMetadata?: ScanMetadata): EvidenceGraph {
    return {
      schemaVersion: "1.0.0",
      version: 2,
      scannedAt: new Date().toISOString(),
      repository: this.repository,
      scan: scanMetadata,
      scanScope,
      nodes: [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...this.edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    };
  }
}

export function endpointId(method: string, path: string): string {
  return `endpoint:${method.toUpperCase()} ${canonicalPath(path)}`;
}

export function canonicalPath(path: string): string {
  let input = path;
  try { input = new URL(path).pathname; } catch { /* relative API path */ }
  const withoutQuery = input.split("?")[0] || "/";
  const prefixed = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return prefixed
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}")
    .replace(/\$\{[^}]+\}/g, "{value}")
    .replace(/\/+/g, "/")
    .replace(/\/$/, "") || "/";
}

export function displayEndpoint(id: string): string {
  return id.replace(/^endpoint:/, "");
}
