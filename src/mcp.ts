import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import type { EvidenceGraph } from "./model.js";
import { endpointTrace } from "./report.js";
import { analyzeImpact, toMarkdown } from "./impact.js";

/** A dependency-free, read-only JSON-lines MCP transport for local coding agents. */
export async function startMcpServer(indexPath: string): Promise<void> {
  const graph = JSON.parse(await readFile(indexPath, "utf8")) as EvidenceGraph;
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    try { respond(JSON.parse(line) as Request, graph); }
    catch (error) { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: error instanceof Error ? error.message : "Invalid request" } }); }
  }
}

interface Request { jsonrpc?: string; id?: string | number | null; method: string; params?: Record<string, unknown>; }

function respond(request: Request, graph: EvidenceGraph): void {
  if (request.method === "notifications/initialized") return;
  if (request.method === "initialize") return writeResult(request.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "repopath", version: "1.0.0" } });
  if (request.method === "tools/list") return writeResult(request.id, { tools: [
    { name: "repopath_endpoint", description: "Return evidence-backed relationships for an HTTP endpoint.", inputSchema: { type: "object", properties: { endpoint: { type: "string" } }, required: ["endpoint"] } },
    { name: "repopath_impact", description: "Return an evidence-backed impact report for repository-relative changed files.", inputSchema: { type: "object", properties: { changed: { type: "array", items: { type: "string" } } }, required: ["changed"] } },
  ] });
  if (request.method === "tools/call") {
    const name = request.params?.name;
    const argumentsValue = request.params?.arguments as Record<string, unknown> | undefined;
    if (name === "repopath_endpoint" && typeof argumentsValue?.endpoint === "string") return textResult(request.id, endpointTrace(graph, argumentsValue.endpoint));
    if (name === "repopath_impact" && Array.isArray(argumentsValue?.changed) && argumentsValue.changed.every((value) => typeof value === "string")) return textResult(request.id, toMarkdown(analyzeImpact(graph, argumentsValue.changed as string[])));
    return write({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32602, message: "Unknown tool or invalid arguments" } });
  }
  write({ jsonrpc: "2.0", id: request.id ?? null, error: { code: -32601, message: "Method not found" } });
}

function textResult(id: Request["id"], text: string): void { writeResult(id, { content: [{ type: "text", text }] }); }
function writeResult(id: Request["id"], result: unknown): void { write({ jsonrpc: "2.0", id: id ?? null, result }); }
function write(value: unknown): void { process.stdout.write(`${JSON.stringify(value)}\n`); }
