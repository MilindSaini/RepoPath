import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve, basename, isAbsolute, relative } from "node:path";
import type { EvidenceGraph, GraphEdge, GraphNode, NodeKind } from "./model.js";

export type ApplicationLayer = "frontend" | "api_client" | "backend" | "data_layer" | "tests" | "other";

export interface NodeWithLayer extends GraphNode {
  layer: ApplicationLayer;
}

export interface ArchitectureLayerSummary {
  layer: ApplicationLayer;
  title: string;
  description: string;
  nodeCount: number;
  nodes: GraphNode[];
}

export interface CrossStackPathStep {
  node: GraphNode;
  relationToNext?: string;
  evidenceToNext?: GraphEdge["evidence"];
}

export interface CrossStackPath {
  id: string;
  title: string;
  steps: CrossStackPathStep[];
  complete: boolean;
  unresolvedSteps: string[];
}

/**
 * Classifies a graph node into one of the 4 full-stack application layers (or tests/other).
 */
export function classifyLayer(node: GraphNode): ApplicationLayer {
  if (node.kind === "test") return "tests";
  if (node.kind === "database_operation" || node.kind === "database_entity" ||
      node.kind === "database_table" || node.kind === "data_model" ||
      node.kind === "database_column" || node.kind === "query" || node.kind === "migration") {
    return "data_layer";
  }
  if (node.kind === "ui_component" || node.kind === "client_script" || node.kind === "context" ||
      (node.attributes?.isReactComponent || node.attributes?.isProvider || node.attributes?.isHook)) {
    return "frontend";
  }
  if (node.kind === "api_request" || node.kind === "query_parameter" || node.kind === "api_field" || node.kind === "static_asset") {
    return "api_client";
  }
  if (node.kind === "api_route" || node.kind === "api_contract") {
    return "backend";
  }
  if (node.kind === "function") {
    // Check if it's frontend or backend based on file path or labels
    const file = node.location?.file?.toLowerCase() ?? "";
    if (file.includes("controller") || file.includes("service") || file.includes("route") ||
        file.includes("handler") || file.includes("server") || file.includes("api/")) {
      return "backend";
    }
    if (file.includes("client") || file.includes("component") || file.includes("hook") ||
        file.includes("page") || file.includes("web") || file.includes("ui") || file.includes("src/")) {
      return "frontend";
    }
    return "backend";
  }
  return "other";
}

/**
 * Summarizes the graph into 4 logical layers.
 */
export function getArchitectureLayers(graph: EvidenceGraph): Record<ApplicationLayer, ArchitectureLayerSummary> {
  const summaries: Record<ApplicationLayer, ArchitectureLayerSummary> = {
    frontend: {
      layer: "frontend",
      title: "Frontend Layer",
      description: "React components, pages, context providers, hooks, and client state",
      nodeCount: 0,
      nodes: [],
    },
    api_client: {
      layer: "api_client",
      title: "API Client Layer",
      description: "Outgoing HTTP calls, API wrappers, request parameters, and response fields",
      nodeCount: 0,
      nodes: [],
    },
    backend: {
      layer: "backend",
      title: "Backend Service Layer",
      description: "HTTP routes, middleware, handlers, controllers, and domain services",
      nodeCount: 0,
      nodes: [],
    },
    data_layer: {
      layer: "data_layer",
      title: "Data Layer",
      description: "Database operations, SQL queries, Prisma models, and database tables",
      nodeCount: 0,
      nodes: [],
    },
    tests: {
      layer: "tests",
      title: "Tests & Coverage",
      description: "Discovered test suites, test cases, and mapped endpoint exercises",
      nodeCount: 0,
      nodes: [],
    },
    other: {
      layer: "other",
      title: "Supporting Files & Contracts",
      description: "Source files, API contracts, and runtime evidence traces",
      nodeCount: 0,
      nodes: [],
    },
  };

  for (const node of graph.nodes) {
    const layer = classifyLayer(node);
    summaries[layer].nodeCount += 1;
    summaries[layer].nodes.push(node);
  }

  return summaries;
}

/**
 * Finds shortest or all evidence-backed paths between two nodes using BFS.
 */
export function findGraphPaths(
  graph: EvidenceGraph,
  sourceId: string,
  targetId: string,
  maxDepth = 8
): CrossStackPathStep[][] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, { target: string; edge: GraphEdge }[]>();

  for (const edge of graph.edges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push({ target: edge.target, edge });
    adjacency.set(edge.source, list);

    // Also support bidirectional navigation for route matching & context consumption
    if (edge.relation === "TARGETS" || edge.relation === "CONSUMES_CONTEXT" || edge.relation === "HANDLES") {
      const rev = adjacency.get(edge.target) ?? [];
      rev.push({ target: edge.source, edge });
      adjacency.set(edge.target, rev);
    }
  }

  const queue: { current: string; path: { node: GraphNode; relationToNext?: string; evidenceToNext?: GraphEdge["evidence"] }[] }[] = [];
  const startNode = nodeById.get(sourceId);
  if (!startNode) return [];

  queue.push({ current: sourceId, path: [{ node: startNode }] });
  const visited = new Set<string>([sourceId]);
  const paths: CrossStackPathStep[][] = [];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.current === targetId) {
      paths.push(item.path);
      if (paths.length >= 5) break;
      continue;
    }
    if (item.path.length >= maxDepth) continue;

    const neighbors = adjacency.get(item.current) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.target) || neighbor.target === targetId) {
        visited.add(neighbor.target);
        const nextNode = nodeById.get(neighbor.target);
        if (nextNode) {
          const updatedPath = [...item.path];
          updatedPath[updatedPath.length - 1].relationToNext = neighbor.edge.relation;
          updatedPath[updatedPath.length - 1].evidenceToNext = neighbor.edge.evidence;
          updatedPath.push({ node: nextNode });
          queue.push({ current: neighbor.target, path: updatedPath });
        }
      }
    }
  }

  return paths;
}

/**
 * Extracts end-to-end full-stack feature paths from the graph.
 * Tracing: Frontend component -> API Client Request -> Backend Route -> Handler -> DB Operation -> Table/Model
 */
export function extractFeatureFlows(graph: EvidenceGraph): CrossStackPath[] {
  const flows: CrossStackPath[] = [];
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();

  for (const edge of graph.edges) {
    const outList = outgoing.get(edge.source) ?? [];
    outList.push(edge);
    outgoing.set(edge.source, outList);

    const inList = incoming.get(edge.target) ?? [];
    inList.push(edge);
    incoming.set(edge.target, inList);
  }

  // Find all frontend components or functions making API requests
  const apiRequests = graph.nodes.filter((n) => n.kind === "api_request");

  for (const req of apiRequests) {
    const steps: CrossStackPathStep[] = [];
    const unresolvedSteps: string[] = [];

    // 1. Find who triggers this request (Frontend Component or Function)
    const inEdges = incoming.get(req.id)?.filter((e) => e.relation === "REQUESTS" || e.relation === "CALLS") ?? [];
    const callerEdge = inEdges[0];
    const callerNode = callerEdge ? nodeById.get(callerEdge.source) : undefined;

    if (callerNode) {
      steps.push({
        node: callerNode,
        relationToNext: callerEdge?.relation ?? "REQUESTS",
        evidenceToNext: callerEdge?.evidence,
      });
    }

    // 2. The API Request node
    const targetEdges = outgoing.get(req.id)?.filter((e) => e.relation === "TARGETS") ?? [];
    const targetEdge = targetEdges[0];
    const endpointNode = targetEdge ? nodeById.get(targetEdge.target) : undefined;

    steps.push({
      node: req,
      relationToNext: targetEdge?.relation ?? "TARGETS",
      evidenceToNext: targetEdge?.evidence,
    });

    if (!endpointNode) {
      unresolvedSteps.push(`Unresolved endpoint: ${req.label}`);
    } else {
      // 3. Backend Route Endpoint
      const handlesEdges = outgoing.get(endpointNode.id)?.filter((e) => e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE") ?? [];
      const handlerEdge = handlesEdges[0];
      const handlerNode = handlerEdge ? nodeById.get(handlerEdge.target) : undefined;

      steps.push({
        node: endpointNode,
        relationToNext: handlerEdge?.relation ?? "HANDLES",
        evidenceToNext: handlerEdge?.evidence,
      });

      if (!handlerNode) {
        unresolvedSteps.push(`No backend route handler discovered for ${endpointNode.label}`);
      } else {
        // 4. Handler / Controller
        // Check if handler calls a service or database operation
        const handlerCalls = outgoing.get(handlerNode.id) ?? [];
        const dbEdge = handlerCalls.find((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES");
        const serviceEdge = handlerCalls.find((e) => e.relation === "CALLS");

        if (serviceEdge) {
          const serviceNode = nodeById.get(serviceEdge.target);
          if (serviceNode) {
            steps.push({
              node: handlerNode,
              relationToNext: "CALLS",
              evidenceToNext: serviceEdge.evidence,
            });

            // Check if service touches database
            const serviceOut = outgoing.get(serviceNode.id) ?? [];
            const serviceDbEdge = serviceOut.find((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES");
            if (serviceDbEdge) {
              const dbNode = nodeById.get(serviceDbEdge.target);
              if (dbNode) {
                steps.push({
                  node: serviceNode,
                  relationToNext: serviceDbEdge.relation,
                  evidenceToNext: serviceDbEdge.evidence,
                });
                steps.push({ node: dbNode });

                // Check if dbNode touches an entity/table
                const entityEdge = outgoing.get(dbNode.id)?.find((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES" || e.relation === "READS_TABLE");
                if (entityEdge) {
                  const entityNode = nodeById.get(entityEdge.target);
                  if (entityNode) {
                    steps[steps.length - 1].relationToNext = entityEdge.relation;
                    steps[steps.length - 1].evidenceToNext = entityEdge.evidence;
                    steps.push({ node: entityNode });
                  }
                }
              } else {
                steps.push({ node: serviceNode });
              }
            } else {
              steps.push({ node: serviceNode });
            }
          } else {
            steps.push({ node: handlerNode });
          }
        } else if (dbEdge) {
          const dbNode = nodeById.get(dbEdge.target);
          if (dbNode) {
            steps.push({
              node: handlerNode,
              relationToNext: dbEdge.relation,
              evidenceToNext: dbEdge.evidence,
            });
            steps.push({ node: dbNode });

            const entityEdge = outgoing.get(dbNode.id)?.find((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES" || e.relation === "READS_TABLE");
            if (entityEdge) {
              const entityNode = nodeById.get(entityEdge.target);
              if (entityNode) {
                steps[steps.length - 1].relationToNext = entityEdge.relation;
                steps[steps.length - 1].evidenceToNext = entityEdge.evidence;
                steps.push({ node: entityNode });
              }
            }
          } else {
            steps.push({ node: handlerNode });
          }
        } else {
          // Check if endpoint directly touches database (e.g. from runtime traces or route decorators)
          const endpointDbEdge = outgoing.get(endpointNode.id)?.find((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES");
          if (endpointDbEdge) {
            const dbNode = nodeById.get(endpointDbEdge.target);
            if (dbNode) {
              steps.push({
                node: handlerNode,
                relationToNext: endpointDbEdge.relation,
                evidenceToNext: endpointDbEdge.evidence,
              });
              steps.push({ node: dbNode });
            } else {
              steps.push({ node: handlerNode });
            }
          } else {
            steps.push({ node: handlerNode });
          }
        }
      }
    }

    const title = callerNode ? `${callerNode.label} → ${req.label}` : req.label;
    flows.push({
      id: `flow:${req.id}`,
      title,
      steps,
      complete: unresolvedSteps.length === 0,
      unresolvedSteps,
    });
  }

  return flows;
}

/**
 * Determines which project folder/module a node belongs to.
 */
export function getNodeFolder(node: GraphNode, knownFolders: string[] = []): string {
  if (typeof node.attributes?.folder === "string" && node.attributes.folder) {
    return node.attributes.folder;
  }
  if (!node.location?.file) return "common";
  const normalized = node.location.file.replace(/\\/g, "/");

  for (const kf of knownFolders) {
    if (normalized.startsWith(kf + "/") || normalized.includes("/" + kf + "/") || normalized === kf) {
      return kf;
    }
  }

  const parts = normalized.split("/");
  if (parts.length > 1 && parts[0] !== "." && parts[0] !== "..") {
    return parts[0];
  }
  return "root";
}

export interface SourceSnippetDiagnostic {
  searchedRoots: string[];
  candidates: string[];
  reason: string;
}

export interface SourceSnippetResult {
  content: string;
  startLine: number;
  endLine: number;
  targetLine: number;
  exists: boolean;
  resolvedPath?: string;
  rootIdentifier?: string;
  repoRelativePath?: string;
  diagnostic?: SourceSnippetDiagnostic;
  error?: string;
}

/**
 * Reads source code lines with context around a specific line.
 * Supports multiple candidate repository/folder roots and preferred root targeting.
 */
export function getSourceSnippet(
  repoRoot: string | string[],
  filePath: string,
  targetLine: number,
  contextLines = 8,
  preferredRoot?: string
): SourceSnippetResult {
  const rawRoots = Array.isArray(repoRoot) ? repoRoot : [repoRoot];
  const resolvedRawRoots = rawRoots.map((r) => resolve(r));
  const preferredResolved = preferredRoot ? resolve(preferredRoot) : undefined;
  const roots = (preferredResolved && resolvedRawRoots.includes(preferredResolved)
    ? [preferredResolved, ...resolvedRawRoots.filter((r) => r !== preferredResolved)]
    : resolvedRawRoots)
    .filter((root, index, all) => all.indexOf(root) === index);
  try {
    let targetPath = filePath;
    let found = false;
    let matchedRoot: string | undefined;
    const candidates: string[] = [];
    const realRoots = roots.map((root) => {
      try { return realpathSync(root); } catch { return root; }
    });
    const isInsideRoot = (candidate: string, root: string): boolean => {
      const relativeCandidate = relative(root, candidate);
      return relativeCandidate === "" || (!relativeCandidate.startsWith("..") && !isAbsolute(relativeCandidate));
    };
    const acceptCandidate = (candidate: string, root: string): boolean => {
      if (!existsSync(candidate)) return false;
      try {
        const resolvedCandidate = realpathSync(candidate);
        if (!statSync(resolvedCandidate).isFile() || !isInsideRoot(resolvedCandidate, realpathSync(root))) return false;
        targetPath = resolvedCandidate;
        matchedRoot = root;
        found = true;
        return true;
      } catch {
        return false;
      }
    };

    // Check directly if absolute
    if (isAbsolute(filePath)) {
      const rootIndex = realRoots.findIndex((root) => {
        try { return isInsideRoot(realpathSync(filePath), root); } catch { return false; }
      });
      if (rootIndex >= 0) acceptCandidate(filePath, roots[rootIndex]);
    }

    if (!found) {
      const normalizedFile = filePath.replace(/\\/g, "/").replace(/^\/+/, "");

      for (const root of roots) {
        // 1. Direct join: root/normalizedFile
        const cand1 = join(root, normalizedFile);
        candidates.push(cand1);
        if (acceptCandidate(cand1, root)) break;

        // 2. If normalizedFile starts with folder basename (e.g. "web/src/App.tsx" where root is "/.../web")
        const base = basename(root);
        const baseIndex = normalizedFile.indexOf(`/${base}/`);
        const basePrefix = normalizedFile.startsWith(base + "/")
          ? base.length + 1
          : (baseIndex >= 0 ? baseIndex + base.length + 2 : -1);
        if (basePrefix > base.length) {
          const cand2 = join(root, normalizedFile.slice(basePrefix));
          candidates.push(cand2);
          if (acceptCandidate(cand2, root)) break;
        }
      }
    }

    if (!found) {
      return {
        content: "",
        startLine: 1,
        endLine: 1,
        targetLine,
        exists: false,
        diagnostic: {
          searchedRoots: roots,
          candidates: candidates.slice(0, 10),
          reason: `File "${filePath}" does not exist in any of the configured project roots (${roots.length} root(s) checked).`,
        },
      };
    }

    const lines = readFileSync(targetPath, "utf8").split(/\r?\n/);
    const startLine = Math.max(1, targetLine - contextLines);
    const endLine = Math.min(lines.length, targetLine + contextLines);
    const content = lines.slice(startLine - 1, endLine).join("\n");
    const rootIdentifier = matchedRoot ? basename(matchedRoot) : (roots[0] ? basename(roots[0]) : "root");
    const repoRelativePath = matchedRoot ? relative(matchedRoot, targetPath).replace(/\\/g, "/") : filePath;

    return {
      content,
      startLine,
      endLine,
      targetLine,
      exists: true,
      resolvedPath: targetPath,
      rootIdentifier,
      repoRelativePath,
    };
  } catch (err) {
    return {
      content: `// Error reading file: ${String(err)}`,
      startLine: 1,
      endLine: 1,
      targetLine,
      exists: false,
      error: String(err),
      diagnostic: {
        searchedRoots: roots,
        candidates: [],
        reason: `Filesystem read error: ${String(err)}`,
      },
    };
  }
}
