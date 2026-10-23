import { readFileSync } from "node:fs";
import { relativePath } from "../files.js";
import { GraphBuilder, type GraphNode } from "../model.js";

export function analyzeSchemas(root: string, files: string[], graph: GraphBuilder): void {
  const entities: GraphNode[] = [];
  for (const path of files) {
    if (!/\.(prisma|sql)$/i.test(path)) continue;
    const file = relativePath(root, path);
    let source = "";
    try { source = readFileSync(path, "utf8"); } catch { continue; }
    const names = path.endsWith(".prisma")
      ? [...source.matchAll(/^\s*model\s+(\w+)/gmi)].map((match) => match[1])
      : [...source.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([\w.]+)["`]?/gi)].map((match) => match[1]);
    for (const name of names) {
      const node: GraphNode = { id: `database-entity:${file}:${name}`, kind: "database_entity", label: name, location: { file, line: lineOf(source, name) } };
      graph.addNode(node);
      entities.push(node);
    }
  }
  for (const operation of graph.getNodes().filter((node) => node.kind === "database_operation")) {
    const entity = entities.find((candidate) => new RegExp(`(?:^|\\.)${escape(candidate.label)}(?:\\.|$)`, "i").test(operation.label));
    if (!entity || !operation.location) continue;
    graph.addEdge({ source: operation.id, target: entity.id, relation: "TOUCHES_DATABASE", evidence: { location: operation.location, method: "schema_import", status: "statically_established", confidence: "medium", detail: "Matched database client receiver to schema entity" } });
  }
}

function lineOf(source: string, term: string): number { const index = source.indexOf(term); return index < 0 ? 1 : source.slice(0, index).split(/\r?\n/).length; }
function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
