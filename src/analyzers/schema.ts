import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { relativePath } from "../files.js";
import { GraphBuilder, type GraphNode } from "../model.js";

export function analyzeSchemas(root: string, files: string[], graph: GraphBuilder): void {
  const entities: GraphNode[] = [];
  for (const path of files) {
    if (!/\.(prisma|sql)$/i.test(path)) continue;
    const file = relativePath(root, path);
    let source = "";
    try {
      if (statSync(path).size > 5 * 1024 * 1024) continue;
      source = readFileSync(path, "utf8");
    } catch { continue; }
    const names = path.endsWith(".prisma")
      ? [...source.matchAll(/^\s*model\s+(\w+)/gmi)].map((match) => match[1])
      : [...source.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([\w.]+)["`]?/gi)].map((match) => {
          const full = match[1];
          return full.includes(".") ? full.split(".").pop()! : full;
        });
    for (const name of names) {
      const node: GraphNode = { id: `database-entity:${file}:${name}`, kind: "database_entity", label: name, location: { file, line: lineOf(source, name) } };
      graph.addNode(node);
      entities.push(node);
    }
  }

  for (const operation of graph.getNodes().filter((node) => node.kind === "database_operation")) {
    const matchedEntityIds = new Set<string>();

    const entity = entities.find((candidate) => new RegExp(`(?:^|\\.)${escape(candidate.label)}(?:\\.|$)`, "i").test(operation.label));
    if (entity && operation.location) {
      matchedEntityIds.add(entity.id);
      graph.addEdge({ source: operation.id, target: entity.id, relation: "TOUCHES_DATABASE", evidence: { location: operation.location, method: "schema_import", status: "statically_established", confidence: "medium", detail: "Matched database client receiver to schema entity" } });
    }

    let query = typeof operation.attributes?.query === "string" ? operation.attributes.query : "";
    if (!query && operation.location) {
      try {
        const opFilePath = join(root, operation.location.file);
        if (existsSync(opFilePath)) {
          const lines = readFileSync(opFilePath, "utf8").split(/\r?\n/);
          const start = Math.max(0, operation.location.line - 15);
          const end = Math.min(lines.length, operation.location.line + 5);
          query = lines.slice(start, end).join("\n");
        }
      } catch { /* best effort */ }
    }

    if (query) {
      const tableMatches = [...query.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([A-Za-z0-9_]+)["`]?/gi)].map((m) => m[1]);
      for (const tableName of tableMatches) {
        const matched = entities.find((candidate) => candidate.label.toLowerCase() === tableName.toLowerCase());
        if (matched && operation.location && !matchedEntityIds.has(matched.id)) {
          matchedEntityIds.add(matched.id);
          graph.addEdge({
            source: operation.id,
            target: matched.id,
            relation: "TOUCHES_DATABASE",
            evidence: {
              location: operation.location,
              method: "schema_import",
              status: "statically_established",
              confidence: "high",
              detail: `SQL query references table ${matched.label}`,
            },
          });
        }
      }
    }
  }
}

function lineOf(source: string, term: string): number { const index = source.indexOf(term); return index < 0 ? 1 : source.slice(0, index).split(/\r?\n/).length; }
function escape(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
