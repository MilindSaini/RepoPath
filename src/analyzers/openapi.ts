import { readFileSync } from "node:fs";
import { endpointId, GraphBuilder, type GraphNode } from "../model.js";

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

export interface ContractImportResult { endpoints: string[]; warnings: string[]; }

export function importOpenApi(path: string, graph: GraphBuilder): ContractImportResult {
  let source: string;
  try { source = readFileSync(path, "utf8"); } catch { return { endpoints: [], warnings: [`Could not read OpenAPI document: ${path}`] }; }
  const operations = parseOperations(source);
  if (!operations) return { endpoints: [], warnings: [`Could not parse OpenAPI JSON or supported YAML paths: ${path}`] };
  const endpoints: string[] = [];
  for (const { method, route, line, fields } of operations) {
    const endpoint = endpointId(method, route);
    const contract: GraphNode = { id: `contract:${endpoint}`, kind: "api_contract", label: `${method.toUpperCase()} ${route}`, location: { file: path, line } };
    graph.addNode(contract);
    graph.addNode({ id: endpoint, kind: "api_route", label: endpoint.replace("endpoint:", ""), location: { file: path, line } });
    graph.addEdge({ source: contract.id, target: endpoint, relation: "DECLARES", evidence: { location: { file: path, line }, method: "openapi_import", status: "statically_established", confidence: "high", detail: "OpenAPI operation declaration" } });
    endpoints.push(endpoint);

    if (fields) {
      for (const field of fields) {
        const fieldNode: GraphNode = {
          id: `field:${endpoint}:${field}`,
          kind: "api_field",
          label: `${endpoint.replace("endpoint:", "")} response.${field}`,
          location: { file: path, line },
          attributes: { field, endpoint: endpoint.replace("endpoint:", ""), source: "openapi_schema", schemaDefined: true },
        };
        graph.addNode(fieldNode);
        graph.addEdge({
          source: contract.id,
          target: fieldNode.id,
          relation: "DECLARES_FIELD",
          evidence: {
            location: { file: path, line },
            method: "openapi_import",
            status: "statically_established",
            confidence: "high",
            detail: `OpenAPI response schema defines field ${field}`,
          },
        });
      }
    }
  }
  return { endpoints, warnings: [] };
}

function parseOperations(source: string): Array<{ method: string; route: string; line: number; fields?: string[] }> | undefined {
  try {
    const document = JSON.parse(source) as Record<string, unknown>;
    const paths = (document.paths ?? {}) as Record<string, Record<string, unknown>>;
    const schemas = (document.components as Record<string, unknown> | undefined)?.schemas as Record<string, unknown> | undefined;

    return Object.entries(paths).flatMap(([route, item]) =>
      Object.keys(item)
        .filter((method) => METHODS.has(method.toLowerCase()))
        .map((method) => {
          const op = item[method] as Record<string, unknown> | undefined;
          const fields = extractResponseFields(op, schemas);
          return { method, route, line: 1, fields };
        })
    );
  } catch { /* use the intentionally narrow YAML path reader below */ }
  const operations: Array<{ method: string; route: string; line: number; fields?: string[] }> = [];
  let inPaths = false;
  let route: string | undefined;
  for (const [index, text] of source.split(/\r?\n/).entries()) {
    if (/^paths:\s*(?:#.*)?$/.test(text)) { inPaths = true; continue; }
    if (inPaths && /^\S/.test(text)) break;
    const pathMatch = inPaths && /^\s{2}(['"]?\/[^:'"]+['"]?):\s*(?:#.*)?$/.exec(text);
    if (pathMatch) { route = pathMatch[1].replace(/^['"]|['"]$/g, ""); continue; }
    const methodMatch = route && /^\s{4}(get|post|put|patch|delete|head|options):\s*(?:#.*)?$/i.exec(text);
    if (methodMatch && route) operations.push({ route, method: methodMatch[1], line: index + 1 });
  }
  return operations.length ? operations : undefined;
}

function extractResponseFields(operation: Record<string, unknown> | undefined, schemas?: Record<string, unknown>): string[] {
  if (!operation) return [];
  const responses = operation.responses as Record<string, unknown> | undefined;
  if (!responses) return [];
  const success = (responses["200"] ?? responses["201"] ?? responses.default) as Record<string, unknown> | undefined;
  if (!success) return [];
  const content = success.content as Record<string, unknown> | undefined;
  const jsonContent = (content?.["application/json"] ?? content?.["*/*"]) as Record<string, unknown> | undefined;
  let schema = jsonContent?.schema as Record<string, unknown> | undefined;
  if (!schema) schema = success.schema as Record<string, unknown> | undefined;
  return resolveProperties(schema, schemas);
}

function resolveProperties(schema: Record<string, unknown> | undefined, schemas?: Record<string, unknown>): string[] {
  if (!schema) return [];
  if (schema.$ref && typeof schema.$ref === "string") {
    const refName = schema.$ref.replace(/^#\/components\/schemas\//, "");
    const resolved = schemas?.[refName] as Record<string, unknown> | undefined;
    return resolveProperties(resolved, schemas);
  }
  if (schema.type === "array" && schema.items) {
    return resolveProperties(schema.items as Record<string, unknown>, schemas);
  }
  if (schema.properties && typeof schema.properties === "object") {
    return Object.keys(schema.properties);
  }
  return [];
}
