export type NodeKind =
  | "ui_component"
  | "client_script"
  | "context"
  | "api_route"
  | "api_request"
  | "static_asset"
  | "function"
  | "test"
  | "source_file"
  | "database_operation"
  | "runtime_trace"
  | "api_contract"
  | "api_field"
  | "query_parameter"
  | "database_entity"
  | "data_model"
  | "database_table"
  | "database_column"
  | "query"
  | "migration";

export type EvidenceStatus = "observed" | "statically_established" | "inferred" | "stale" | "unresolved";
export type Relation =
  | "REQUESTS"
  | "TARGETS"
  | "FETCHES_ASSET"
  | "HANDLES"
  | "HANDLES_ROUTE"
  | "MATCHES_ROUTE"
  | "EXERCISES"
  | "CALLS"
  | "IMPORTS"
  | "RENDERS"
  | "PASSES_CALLBACK"
  | "PROVIDES_CONTEXT"
  | "CONSUMES_CONTEXT"
  | "TOUCHES_DATABASE"
  | "DECLARES"
  | "DECLARES_FIELD"
  | "CONSUMES_FIELD"
  | "OBSERVED_FIELD"
  | "OBSERVED"
  | "READS_FIELD"
  | "SENDS_PARAMETER"
  | "TESTS"
  | "USES_MODEL"
  | "QUERIES"
  | "READS_TABLE"
  | "WRITES_TABLE"
  | "MIGRATES_SCHEMA";

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
    const normMethod = method.toUpperCase();
    const exact = endpointId(method, path);
    const exactNode = this.nodes.get(exact);
    if (exactNode) return exactNode;

    const requestedPath = canonicalPath(path);
    const requestedSegments = requestedPath.split("/").filter(Boolean);

    const candidates = [...this.nodes.values()].filter((node) => {
      if (node.kind !== "api_route") return false;
      if (normMethod !== "ALL" && !node.id.startsWith(`endpoint:${normMethod} `) && !node.id.startsWith("endpoint:ALL ")) {
        return false;
      }
      return true;
    });

    // 1. Same-length segment match with parameter/wildcard support
    const sameLength = candidates.find((node) => {
      const candidatePath = node.id.replace(/^endpoint:[A-Z]+\s+/, "");
      const candidateSegments = candidatePath.split("/").filter(Boolean);
      return candidateSegments.length === requestedSegments.length &&
        candidateSegments.every((segment, index) =>
          /^\{[^}]+\}$/.test(segment) || /^\{[^}]+\}$/.test(requestedSegments[index]) ||
          segment === requestedSegments[index] || segment === "*" || requestedSegments[index] === "*"
        );
    });
    if (sameLength) return sameLength;

    // 2. Wildcard trailing match (e.g. /api/proxy/* matching /api/proxy/123)
    const wildcardMatch = candidates.find((node) => {
      const candidatePath = node.id.replace(/^endpoint:[A-Z]+\s+/, "");
      const candidateSegments = candidatePath.split("/").filter(Boolean);
      if (candidateSegments.at(-1) !== "*") return false;
      const prefix = candidateSegments.slice(0, -1);
      if (requestedSegments.length < prefix.length) return false;
      return prefix.every((seg, idx) =>
        /^\{[^}]+\}$/.test(seg) || /^\{[^}]+\}$/.test(requestedSegments[idx]) ||
        seg === requestedSegments[idx] || seg === "*"
      );
    });
    if (wildcardMatch) return wildcardMatch;

    // 3. Suffix / endpoint matching (where one is a suffix of the other)
    const suffixMatches: { node: GraphNode; score: number }[] = [];
    for (const node of candidates) {
      const candidatePath = node.id.replace(/^endpoint:[A-Z]+\s+/, "");
      const candidateSegments = candidatePath.split("/").filter(Boolean);
      if (candidateSegments.length === 0 || requestedSegments.length === 0) continue;

      const [shorter, longer] = candidateSegments.length < requestedSegments.length
        ? [candidateSegments, requestedSegments]
        : [requestedSegments, candidateSegments];

      const offset = longer.length - shorter.length;
      const matches = shorter.every((seg, idx) => {
        const longerSeg = longer[offset + idx];
        return /^\{[^}]+\}$/.test(seg) || /^\{[^}]+\}$/.test(longerSeg) || seg === longerSeg || seg === "*" || longerSeg === "*";
      });

      const hasConcreteMatch = shorter.some((seg, idx) => {
        const longerSeg = longer[offset + idx];
        return !/^\{[^}]+\}$/.test(seg) && !/^\{[^}]+\}$/.test(longerSeg) && seg !== "*" && longerSeg !== "*" && seg === longerSeg;
      });

      if (matches && hasConcreteMatch) {
        const lengthDiff = longer.length - shorter.length;
        suffixMatches.push({ node, score: shorter.length * 10 - lengthDiff });
      }
    }

    if (suffixMatches.length > 0) {
      suffixMatches.sort((a, b) => b.score - a.score);
      return suffixMatches[0].node;
    }

    return undefined;
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
  // Strip protocol and origin/host if still present
  input = input.replace(/^https?:\/\/[^/]+/i, "");
  // Strip leading template base-URL expressions like ${NL2SQL_API_URL}, {API_CONFIG.BASE_URL}, {process.env.*}
  input = input.replace(/^\/?(?:\$\{|\{)(?:[^}]*(?:URL|BASE|API|HOST|SERVER|BACKEND|DOMAIN|ORIGIN|process\.env)[^}]*)\}/i, "");
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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGraph(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Graph must be a non-null object"] };
  }
  const graph = input as Record<string, unknown>;
  if (typeof graph.repository !== "string" || !graph.repository) {
    errors.push("Graph missing valid repository string");
  }
  if (!Array.isArray(graph.nodes)) {
    errors.push("Graph missing nodes array");
  }
  if (!Array.isArray(graph.edges)) {
    errors.push("Graph missing edges array");
  }

  if (errors.length > 0) return { valid: false, errors };

  const nodeIds = new Set<string>();
  const nodes = graph.nodes as unknown[];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node || typeof node !== "object") {
      errors.push(`Node at index ${i} is not an object`);
      continue;
    }
    const n = node as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id) {
      errors.push(`Node at index ${i} missing id`);
    } else {
      nodeIds.add(n.id);
    }
    if (typeof n.kind !== "string" || !n.kind) {
      errors.push(`Node at index ${i} missing kind`);
    }
    if (typeof n.label !== "string") {
      errors.push(`Node at index ${i} missing label`);
    }
  }

  const edges = graph.edges as unknown[];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge || typeof edge !== "object") {
      errors.push(`Edge at index ${i} is not an object`);
      continue;
    }
    const e = edge as Record<string, unknown>;
    if (typeof e.source !== "string" || !nodeIds.has(e.source)) {
      errors.push(`Edge at index ${i} references non-existent source: ${String(e.source)}`);
    }
    if (typeof e.target !== "string" || !nodeIds.has(e.target)) {
      errors.push(`Edge at index ${i} references non-existent target: ${String(e.target)}`);
    }
    if (typeof e.relation !== "string") {
      errors.push(`Edge at index ${i} missing relation`);
    }
    if (!e.evidence || typeof e.evidence !== "object") {
      errors.push(`Edge at index ${i} missing evidence object`);
    }
  }

  return { valid: errors.length === 0, errors };
}
