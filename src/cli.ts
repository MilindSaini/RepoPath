#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildGraph } from "./core.js";
import { findCommonRoot } from "./files.js";
import type { EvidenceGraph } from "./model.js";
import { endpointTrace, htmlReport } from "./report.js";
import { persistGraph } from "./store.js";
import { analyzeImpact, changedFilesFromGit, changedRangesFromGit, symbolsFromChangedRanges, toMarkdown } from "./impact.js";
import { detectDrift } from "./drift.js";
import { evaluateRules, findingsToSarif, loadRules } from "./rules.js";
import { startMcpServer } from "./mcp.js";
import { receiveTraces } from "./trace-receiver.js";
import { startServer } from "./server.js";
import { generateDashboardHtml } from "./dashboard-ui.js";
import { architectureMarkdown, buildApiOperations, buildProjectBrief, exploreContracts, runHealthChecks } from "./intelligence.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") return usage();
  if (command === "dashboard") {
    const portStr = option(args, "--port");
    const port = portStr ? Number(portStr) : 3333;
    const posDirs = positionals(args);
    const initialDirs = posDirs.length > 0 ? posDirs : [option(args, "--dir") ?? "."];
    const open = args.includes("--open");
    const srv = await startServer({ port, dirs: initialDirs, open });
    console.log(`RepoPath Dashboard running at: ${srv.url}`);
    console.log(`Active location(s): ${initialDirs.map((d) => resolve(d)).join(", ")}`);
    console.log(`Press Ctrl+C to stop.`);
    return;
  }
  if (command === "scan") {
    const targets = positionals(args);
    const target = targets.length > 1 ? targets : targets[0] ?? ".";
    const defaultRoot = Array.isArray(target) ? findCommonRoot(target) : target;
    const out = option(args, "--out") ?? resolve(defaultRoot, ".repopath");
    const staleAfterDays = option(args, "--stale-after-days");
    const include = option(args, "--include")?.split(",").map((s) => s.trim()).filter(Boolean);
    const exclude = option(args, "--exclude")?.split(",").map((s) => s.trim()).filter(Boolean);
    const graph = await buildGraph(target, {
      openapiPath: option(args, "--openapi"),
      tracesPath: option(args, "--traces"),
      staleAfterDays: staleAfterDays ? Number(staleAfterDays) : undefined,
      include,
      exclude,
    });
    const paths = await persistGraph(graph, resolve(out));
    console.log(`Scanned ${graph.nodes.length} nodes and ${graph.edges.length} evidence-backed edges.`);
    console.log(`JSON: ${paths.jsonPath}`);
    console.log(`SQLite: ${paths.sqlitePath}`);
    return;
  }
  if (command === "impact") {
    const graph = await loadGraph(option(args, "--index"));
    const report = impactFor(graph, args);
    const format = option(args, "--format") ?? "markdown";
    const output = format === "json" ? JSON.stringify(report, null, 2) : toMarkdown(report);
    const destination = option(args, "--output");
    if (destination) await writeFile(destination, `${output}\n`); else console.log(output);
    return;
  }
  if (command === "drift") {
    const findings = detectDrift(await loadGraph(option(args, "--index")));
    console.log(findings.length ? findings.map((finding) => `- ${finding.type}: ${finding.endpoint.label} — ${finding.message}`).join("\n") : "No contract/implementation drift found.");
    return;
  }
  if (command === "brief") {
    const graph = await loadGraph(option(args, "--index"));
    const brief = buildProjectBrief(graph);
    console.log(JSON.stringify(brief, null, 2));
    return;
  }
  if (command === "health") {
    const graph = await loadGraph(option(args, "--index"));
    const findings = runHealthChecks(graph);
    const format = option(args, "--format") ?? "text";
    const output = format === "json" ? JSON.stringify({ findings }, null, 2) : findings.length
      ? findings.map((finding) => `- [${finding.severity}] ${finding.id}: ${finding.message}`).join("\n")
      : "No architecture health findings.";
    console.log(output);
    return;
  }
  if (command === "contracts") {
    const graph = await loadGraph(option(args, "--index"));
    console.log(JSON.stringify({ contracts: exploreContracts(graph) }, null, 2));
    return;
  }
  if (command === "api") {
    const graph = await loadGraph(option(args, "--index"));
    const operations = buildApiOperations(graph);
    const format = option(args, "--format") ?? "json";
    const output = format === "text"
      ? operations.map((operation) => `${operation.method}\t${operation.path}\t${operation.resolution}\t${operation.contractStatus}\t${operation.sourceLocations[0] ? `${operation.sourceLocations[0].file}:${operation.sourceLocations[0].line}` : "unknown"}`).join("\n")
      : JSON.stringify({ operations }, null, 2);
    const destination = option(args, "--output");
    if (destination) await writeFile(destination, `${output}\n`); else console.log(output);
    return;
  }
  if (command === "architecture") {
    const graph = await loadGraph(option(args, "--index"));
    const destination = option(args, "--output");
    const output = architectureMarkdown(graph);
    if (destination) await writeFile(destination, `${output}\n`); else console.log(output);
    return;
  }
  if (command === "rules") {
    const graph = await loadGraph(option(args, "--index"));
    const findings = evaluateRules(graph, impactFor(graph, args), loadRules(option(args, "--config")));
    const format = option(args, "--format") ?? "text";
    const output = format === "sarif" ? JSON.stringify(findingsToSarif(findings), null, 2) : findings.length ? findings.map((finding) => `- [${finding.action}] ${finding.ruleId}: ${finding.message}`).join("\n") : "No rule findings.";
    const destination = option(args, "--output");
    if (destination) await writeFile(destination, `${output}\n`); else console.log(output);
    if (findings.some((finding) => finding.action === "block")) process.exitCode = 1;
    return;
  }
  if (command === "mcp") {
    await startMcpServer(option(args, "--index") ?? resolve(".repopath/graph.json"));
    return;
  }
  if (command === "receive-traces") {
    const port = Number(option(args, "--port") ?? "4318");
    const output = option(args, "--output") ?? resolve(".repopath/traces.json");
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be a valid TCP port.");
    await receiveTraces(port, output);
    return;
  }
  if (command === "query") {
    const graph = await loadGraph(option(args, "--index"));
    const kind = option(args, "--kind");
    const search = option(args, "--search")?.toLowerCase();
    const nodes = graph.nodes.filter((node) => (!kind || node.kind === kind) && (!search || node.label.toLowerCase().includes(search)));
    console.log(nodes.length ? nodes.map((node) => `${node.kind}\t${node.label}${node.location ? `\t${node.location.file}:${node.location.line}` : ""}`).join("\n") : "No matching graph nodes.");
    return;
  }
  if (command === "history") {
    const index = option(args, "--index") ?? resolve(".repopath/graph.json");
    const history = resolve(dirname(index), "history.json");
    try { console.log(await readFile(history, "utf8")); } catch { throw new Error(`No scan history at ${history}. Run \`repopath scan\` first.`); }
    return;
  }
  if (command === "trace") {
    const selector = positionals(args).join(" ");
    if (!selector) throw new Error("trace requires an endpoint, for example: repopath trace GET /api/orders/{id}");
    console.log(endpointTrace(await loadGraph(option(args, "--index")), selector));
    return;
  }
  if (command === "report") {
    const format = option(args, "--format") ?? "html";
    if (format !== "html" && format !== "interactive-html") {
      throw new Error("Available report formats: --format html, --format interactive-html");
    }
    const index = option(args, "--index") ?? resolve(".repopath/graph.json");
    const output = option(args, "--output") ?? resolve(dirname(index), format === "interactive-html" ? "dashboard.html" : "report.html");
    const loaded = await loadGraph(index);
    const content = format === "interactive-html" ? generateDashboardHtml(loaded, { offline: true }) : htmlReport(loaded);
    await writeFile(output, content);
    console.log(`Report generated: ${output}`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

async function loadGraph(index?: string): Promise<EvidenceGraph> {
  const path = resolve(index ?? ".repopath/graph.json");
  try { return JSON.parse(await readFile(path, "utf8")) as EvidenceGraph; }
  catch { throw new Error(`Could not read ${path}. Run \`repopath scan <directory>\` first or pass --index.`); }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positionals(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith("--")) { index += 1; continue; }
    values.push(args[index]);
  }
  return values;
}

function usage(): void {
  console.log(`RepoPath — evidence-backed full-stack path mapping

Usage:
  repopath dashboard [--port 3333] [directory...] [--open]
  repopath scan [directory...] [--out directory] [--include dir1,dir2] [--exclude dir1,dir2] [--openapi openapi.json] [--traces traces.json]
  repopath trace METHOD /path [--index graph.json]
  repopath impact --changed file1,file2 [--index graph.json] [--format markdown|json]
  repopath drift [--index graph.json]
  repopath brief [--index graph.json]
  repopath health [--index graph.json] [--format text|json]
  repopath contracts [--index graph.json]
  repopath api [--index graph.json] [--format text|json] [--output operations.json]
  repopath architecture [--index graph.json] [--output ARCHITECTURE.md]
  repopath rules --config repopath.rules.json --changed file [--format text|sarif] [--index graph.json]
  repopath query [--kind api_route] [--search text] [--index graph.json]
  repopath history [--index graph.json]
  repopath mcp [--index graph.json]
  repopath receive-traces [--port 4318] [--output .repopath/traces.json]
  repopath report [--format html|interactive-html] [--index graph.json] [--output report.html]`);
}

function impactFor(graph: EvidenceGraph, args: string[]) {
  const base = option(args, "--base");
  const ranges = base ? changedRangesFromGit(graph.repository, base) : [];
  const changed = option(args, "--changed")?.split(",").map((file) => file.trim()).filter(Boolean)
    ?? (ranges.length ? ranges : (base ? changedFilesFromGit(graph.repository, base) : []));
  if (!changed.length && !option(args, "--symbol")) throw new Error("impact and rules require --changed file1,file2, --symbol name, or --base branch.");
  const symbols = [...(option(args, "--symbol")?.split(",").filter(Boolean) ?? []), ...symbolsFromChangedRanges(graph.repository, ranges)];
  return analyzeImpact(graph, changed, symbols);
}

main().catch((error: unknown) => { console.error(`RepoPath error: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
