import { readFileSync } from "node:fs";
import { endpointId, GraphBuilder, type GraphNode } from "../model.js";

interface Span { traceId?: string; name?: string; startTimeUnixNano?: string; attributes?: Array<{ key?: string; value?: Record<string, unknown> }>; }

export function importOpenTelemetry(path: string, graph: GraphBuilder, staleAfterDays?: number): string[] {
  let input: unknown;
  try { input = JSON.parse(readFileSync(path, "utf8")); } catch { return [`Could not parse OpenTelemetry JSON: ${path}`]; }
  const spans = findSpans(input);
  const byTrace = new Map<string, { endpoints: GraphNode[]; databases: GraphNode[]; tests: GraphNode[]; observedAt?: string }>();
  for (const span of spans) {
    const traceId = span.traceId || "unknown-trace";
    const group = byTrace.get(traceId) ?? { endpoints: [], databases: [], tests: [], observedAt: observedAt(span.startTimeUnixNano) };
    const attributes = attributesOf(span);
    const method = attributes["http.request.method"] ?? attributes["http.method"];
    const route = attributes["http.route"] ?? pathFromUrl(attributes["url.full"] ?? attributes["http.url"]);
    if (method && route) {
      const endpoint = graph.findMatchingEndpoint(method, route) ?? endpointNode(method, route, path);
      graph.addNode(endpoint);
      const trace: GraphNode = { id: `trace:${traceId}`, kind: "runtime_trace", label: span.name ?? traceId, location: { file: path, line: 1 } };
      graph.addNode(trace);
      graph.addEdge({ source: trace.id, target: endpoint.id, relation: "OBSERVED", evidence: runtimeEvidence(path, traceId, group.observedAt, "OpenTelemetry HTTP span", staleAfterDays) });
      group.endpoints.push(endpoint);
    }
    const testName = attributes["test.name"] ?? attributes["test.id"] ?? attributes["test.suite"];
    if (testName) {
      const test: GraphNode = { id: `test:trace:${traceId}:${testName}`, kind: "test", label: testName, location: { file: path, line: 1 } };
      graph.addNode(test);
      group.tests.push(test);
    }
    if (attributes["db.system"] || attributes["db.namespace"] || attributes["db.operation.name"] || attributes["db.statement"]) {
      const label = `${attributes["db.system"] ?? "database"}.${attributes["db.operation.name"] ?? span.name ?? "operation"}`;
      const database: GraphNode = { id: `database:trace:${traceId}:${label}`, kind: "database_operation", label, location: { file: path, line: 1 } };
      graph.addNode(database);
      group.databases.push(database);
    }
    byTrace.set(traceId, group);
  }
  for (const [traceId, group] of byTrace) {
    for (const endpoint of group.endpoints) for (const database of group.databases) {
      graph.addEdge({ source: endpoint.id, target: database.id, relation: "TOUCHES_DATABASE", evidence: runtimeEvidence(path, traceId, group.observedAt, "OpenTelemetry trace joined HTTP request to database span", staleAfterDays) });
    }
    for (const test of group.tests) for (const endpoint of group.endpoints) {
      graph.addEdge({ source: test.id, target: endpoint.id, relation: "EXERCISES", evidence: runtimeEvidence(path, traceId, group.observedAt, "OpenTelemetry trace correlated test to HTTP endpoint", staleAfterDays) });
    }
  }
  return [];
}

function findSpans(value: unknown): Span[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(findSpans);
  const record = value as Record<string, unknown>;
  const here = Array.isArray(record.spans) ? record.spans as Span[] : [];
  return [...here, ...Object.entries(record).filter(([key]) => key !== "spans").flatMap(([, child]) => findSpans(child))];
}

function attributesOf(span: Span): Record<string, string> {
  return Object.fromEntries((span.attributes ?? []).flatMap(({ key, value }) => {
    if (!key || !value) return [];
    const raw = Object.values(value)[0];
    return typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? [[key, String(raw)]] : [];
  }));
}

function endpointNode(method: string, route: string, file: string): GraphNode {
  const id = endpointId(method, route);
  return { id, kind: "api_route", label: id.replace("endpoint:", ""), location: { file, line: 1 } };
}
function pathFromUrl(value: string | undefined): string | undefined { try { return value ? new URL(value).pathname : undefined; } catch { return value?.split("?")[0]; } }
function observedAt(value: string | undefined): string | undefined { return value && /^\d+$/.test(value) ? new Date(Number(BigInt(value) / 1_000_000n)).toISOString() : undefined; }
function runtimeEvidence(file: string, traceId: string, time: string | undefined, detail: string, staleAfterDays?: number) {
  const stale = time && staleAfterDays !== undefined && Date.now() - Date.parse(time) > staleAfterDays * 86_400_000;
  return { location: { file, line: 1 }, method: "opentelemetry_import" as const, status: stale ? "stale" as const : "observed" as const, confidence: "high" as const, detail, traceId, observedAt: time };
}
