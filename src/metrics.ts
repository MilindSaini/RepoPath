import type { EvidenceGraph, GraphNode } from "./model.js";
import { classifyLayer, getNodeFolder, type ApplicationLayer } from "./graph-query.js";

export interface LayerMetrics {
  total: number;
  entities: {
    components: number;
    providers: number;
    clientScripts: number;
    requests: number;
    parameters: number;
    fields: number;
    staticAssets: number;
    unresolvedRequests: number;
    routes: number;
    handlers: number;
    contracts: number;
    operations: number;
    tables: number;
    models: number;
    queries: number;
    migrations: number;
    testCases: number;
  };
  keyEntryPoints: GraphNode[];
}

export interface SidebarCounts {
  frontend: number;
  backend_routes: number;
  api_client: number;
  backend_services: number;
  data_layer: number;
  tests: number;
}

export interface FolderMetrics {
  name: string;
  total: number;
  frontend: number;
  api_client: number;
  backend: number;
  data_layer: number;
  tests: number;
}

export interface ProjectMetrics {
  totalNodes: number;
  totalEdges: number;
  layers: Record<ApplicationLayer, LayerMetrics>;
  sidebarCounts: SidebarCounts;
  relations: Record<string, number>;
  evidenceStatus: {
    statically_established: number;
    observed: number;
    inferred: number;
    unresolved: number;
  };
  folders: FolderMetrics[];
}

/**
 * Single, canonical metrics service for RepoPath.
 * Eliminates contradictory counts across Overview cards, sidebar tree groups,
 * coverage badges, and AI summaries.
 */
export function calculateProjectMetrics(graph: EvidenceGraph, folderFilter: string = "all"): ProjectMetrics {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  // Filter nodes by folder if specified
  const scopedNodes = folderFilter === "all"
    ? nodes
    : nodes.filter((n) => getNodeFolder(n) === folderFilter);

  const scopedNodeIds = new Set(scopedNodes.map((n) => n.id));
  const scopedEdges = folderFilter === "all"
    ? edges
    : edges.filter((e) => scopedNodeIds.has(e.source) || scopedNodeIds.has(e.target));

  // Resolved API request targets set
  const resolvedRequestIds = new Set<string>();
  for (const edge of scopedEdges) {
    if (edge.relation === "TARGETS") {
      resolvedRequestIds.add(edge.source);
    }
  }

  const layers: Record<ApplicationLayer, LayerMetrics> = {
    frontend: createEmptyLayerMetrics(),
    api_client: createEmptyLayerMetrics(),
    backend: createEmptyLayerMetrics(),
    data_layer: createEmptyLayerMetrics(),
    tests: createEmptyLayerMetrics(),
    other: createEmptyLayerMetrics(),
  };

  const sidebarCounts: SidebarCounts = {
    frontend: 0,
    backend_routes: 0,
    api_client: 0,
    backend_services: 0,
    data_layer: 0,
    tests: 0,
  };

  // Classify each node strictly once
  for (const node of scopedNodes) {
    const layer = classifyLayer(node);
    layers[layer].total += 1;

    switch (layer) {
      case "frontend": {
        sidebarCounts.frontend += 1;
        if (node.kind === "context" || node.attributes?.isProvider) {
          layers.frontend.entities.providers += 1;
        } else if (node.kind === "client_script" || node.attributes?.isClientScript) {
          layers.frontend.entities.clientScripts += 1;
        } else {
          layers.frontend.entities.components += 1;
        }
        if (/^(app|index|main|root|layout|home|dashboard)/i.test(node.label) && layers.frontend.keyEntryPoints.length < 5) {
          layers.frontend.keyEntryPoints.push(node);
        }
        break;
      }
      case "api_client": {
        sidebarCounts.api_client += 1;
        if (node.kind === "api_request") {
          layers.api_client.entities.requests += 1;
          if (!resolvedRequestIds.has(node.id)) {
            layers.api_client.entities.unresolvedRequests += 1;
          }
          if (layers.api_client.keyEntryPoints.length < 5) {
            layers.api_client.keyEntryPoints.push(node);
          }
        } else if (node.kind === "query_parameter") {
          layers.api_client.entities.parameters += 1;
        } else if (node.kind === "api_field") {
          layers.api_client.entities.fields += 1;
        } else if (node.kind === "static_asset") {
          layers.api_client.entities.staticAssets += 1;
        }
        break;
      }
      case "backend": {
        if (node.kind === "api_route" || node.kind === "api_contract") {
          sidebarCounts.backend_routes += 1;
          if (node.kind === "api_route") {
            layers.backend.entities.routes += 1;
            if (layers.backend.keyEntryPoints.length < 5) {
              layers.backend.keyEntryPoints.push(node);
            }
          } else {
            layers.backend.entities.contracts += 1;
          }
        } else {
          sidebarCounts.backend_services += 1;
          layers.backend.entities.handlers += 1;
          if (layers.backend.keyEntryPoints.length < 5) {
            layers.backend.keyEntryPoints.push(node);
          }
        }
        break;
      }
      case "data_layer": {
        sidebarCounts.data_layer += 1;
        if (node.kind === "database_operation") {
          layers.data_layer.entities.operations += 1;
        } else if (node.kind === "database_table" || node.kind === "database_entity") {
          layers.data_layer.entities.tables += 1;
          if (layers.data_layer.keyEntryPoints.length < 5) {
            layers.data_layer.keyEntryPoints.push(node);
          }
        } else if (node.kind === "data_model") {
          layers.data_layer.entities.models += 1;
        } else if (node.kind === "query") {
          layers.data_layer.entities.queries += 1;
        } else if (node.kind === "migration") {
          layers.data_layer.entities.migrations += 1;
        }
        break;
      }
      case "tests": {
        sidebarCounts.tests += 1;
        layers.tests.entities.testCases += 1;
        if (layers.tests.keyEntryPoints.length < 5) {
          layers.tests.keyEntryPoints.push(node);
        }
        break;
      }
      default:
        break;
    }
  }

  // Relations & Evidence Breakdown
  const relations: Record<string, number> = {};
  const evidenceStatus = {
    statically_established: 0,
    observed: 0,
    inferred: 0,
    unresolved: 0,
  };

  for (const edge of scopedEdges) {
    relations[edge.relation] = (relations[edge.relation] ?? 0) + 1;
    const st = edge.evidence?.status;
    if (st === "observed") evidenceStatus.observed += 1;
    else if (st === "inferred") evidenceStatus.inferred += 1;
    else if (st === "unresolved") evidenceStatus.unresolved += 1;
    else evidenceStatus.statically_established += 1;
  }

  // Per-folder metrics
  const folderMap = new Map<string, FolderMetrics>();
  for (const node of nodes) {
    const f = getNodeFolder(node);
    if (!f || f === "common" || f === "root") continue;
    let entry = folderMap.get(f);
    if (!entry) {
      entry = { name: f, total: 0, frontend: 0, api_client: 0, backend: 0, data_layer: 0, tests: 0 };
      folderMap.set(f, entry);
    }
    entry.total += 1;
    const layer = classifyLayer(node);
    if (layer in entry) {
      (entry as unknown as Record<string, number>)[layer] += 1;
    }
  }

  return {
    totalNodes: scopedNodes.length,
    totalEdges: scopedEdges.length,
    layers,
    sidebarCounts,
    relations,
    evidenceStatus,
    folders: [...folderMap.values()].sort((a, b) => b.total - a.total),
  };
}

function createEmptyLayerMetrics(): LayerMetrics {
  return {
    total: 0,
    entities: {
      components: 0,
      providers: 0,
      clientScripts: 0,
      requests: 0,
      parameters: 0,
      fields: 0,
      staticAssets: 0,
      unresolvedRequests: 0,
      routes: 0,
      handlers: 0,
      contracts: 0,
      operations: 0,
      tables: 0,
      models: 0,
      queries: 0,
      migrations: 0,
      testCases: 0,
    },
    keyEntryPoints: [],
  };
}

