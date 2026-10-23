import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { endpointId, GraphBuilder, type Evidence, type GraphNode } from "../model.js";
import { isTestPath, relativePath } from "../files.js";

/**
 * Conservative FastAPI extractor. It recognizes literal decorators only; dynamic
 * routes are intentionally omitted rather than reported as certain. A full
 * Python-AST adapter is planned in ROADMAP.md.
 */
export function analyzePython(root: string, files: string[], graph: GraphBuilder): void {
  for (const path of files.filter((file) => file.endsWith(".py"))) {
    const file = relativePath(root, path);
    graph.addNode({ id: `file:${file}`, kind: "source_file", label: file, location: { file, line: 1 } });
    let lines: string[];
    try { lines = readFileSync(path, "utf8").split(/\r?\n/); } catch { continue; }
    for (let index = 0; index < lines.length; index += 1) {
      const route = /@(?:app|router)\.(get|post|put|patch|delete|head|options)\(\s*["']([^"']+)["']/.exec(lines[index]);
      if (route) addRoute(graph, file, index, route[1], route[2], lines);
      const request = /(?:requests|httpx|client|test_client)\.(get|post|put|patch|delete|head|options)\(\s*["']([^"']+)["']/.exec(lines[index]);
      if (request) addRequest(graph, file, index, request[1], request[2]);
    }
  }
}

function addRoute(graph: GraphBuilder, file: string, index: number, method: string, path: string, lines: string[]): void {
  const line = index + 1;
  const handler = lines.slice(index + 1).map((value, offset) => ({ value, line: line + offset + 1 })).find((entry) => /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.test(entry.value));
  const name = handler ? /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/.exec(handler.value)?.[1] : undefined;
  const endpoint = endpointId(method, path);
  graph.addNode({ id: endpoint, kind: "api_route", label: endpoint.replace("endpoint:", ""), location: { file, line } });
  const functionNode: GraphNode = { id: `function:${file}:${name ?? `<route handler:${line}>`}`, kind: "function", label: name ?? "<route handler>", location: { file, line: handler?.line ?? line } };
  graph.addNode(functionNode);
  graph.addEdge({ source: endpoint, target: functionNode.id, relation: "HANDLES", evidence: evidence(file, line, "FastAPI literal route decorator") });
}

function addRequest(graph: GraphBuilder, file: string, index: number, method: string, path: string): void {
  const line = index + 1;
  const test = isTestPath(file);
  const owner: GraphNode = test
    ? { id: `test:${file}:${line}`, kind: "test", label: `${file}:${line}`, location: { file, line } }
    : { id: `file:${file}`, kind: "source_file", label: relative(".", file), location: { file, line: 1 } };
  const endpoint = graph.findMatchingEndpoint(method, path);
  const normalizedMethod = method.toUpperCase();
  const requestId = `request:${file}:${line}:${normalizedMethod} ${path}`;
  const request: GraphNode = {
    id: requestId,
    kind: "api_request",
    label: endpoint?.label ?? `${normalizedMethod} ${path}`,
    location: { file, line },
    attributes: { method: normalizedMethod, path, pathResolution: endpoint ? "resolved" : "unresolved", originResolution: endpoint ? "matched" : "unknown" },
  };
  graph.addNode(owner);
  graph.addNode(request);
  const requestEvidence = evidence(file, line, "Python HTTP request");
  requestEvidence.urlTemplate = path;
  requestEvidence.resolution = endpoint ? "resolved" : "unresolved";
  requestEvidence.status = endpoint ? "statically_established" : "unresolved";
  requestEvidence.confidence = endpoint ? "high" : "low";
  graph.addEdge({ source: owner.id, target: request.id, relation: test ? "EXERCISES" : "REQUESTS", evidence: requestEvidence });
  if (endpoint) {
    graph.addEdge({ source: request.id, target: endpoint.id, relation: "TARGETS", evidence: requestEvidence });
    graph.addEdge({ source: owner.id, target: endpoint.id, relation: test ? "EXERCISES" : "REQUESTS", evidence: requestEvidence });
  }
}

function evidence(file: string, line: number, detail: string): Evidence { return { location: { file, line }, method: "python_literal", status: "statically_established", confidence: "high", detail }; }
