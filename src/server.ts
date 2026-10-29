import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { exec } from "node:child_process";
import { ScannerService } from "./scanner-service.js";
import { AIEngine } from "./ai-engine.js";
import { generateDashboardHtml } from "./dashboard-ui.js";
import { getSourceSnippet, findGraphPaths } from "./graph-query.js";
import { analyzeImpact, toMarkdown } from "./impact.js";
import { endpointTrace } from "./report.js";
import type { EvidenceGraph } from "./model.js";
import { architectureMarkdown, buildApiOperations, buildProjectBrief, exploreContracts, retrieveEvidence, runHealthChecks } from "./intelligence.js";

export interface ServerOptions {
  port?: number;
  dir?: string;
  dirs?: string[];
  open?: boolean;
  service?: ScannerService;
}

export async function startServer(options: ServerOptions = {}): Promise<{ port: number; url: string; close: () => Promise<void> }> {
  const port = options.port ?? 3333;
  const initialDirs = options.dirs && options.dirs.length > 0
    ? options.dirs.map((d) => resolve(d))
    : [resolve(options.dir ?? ".")];
  const scannerService = options.service ?? new ScannerService(initialDirs);
  const rootDir = scannerService.getActiveDirectory();
  const aiEngine = new AIEngine(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY);

  // Attempt to load existing graph if present in .repopath/graph.json
  const existingGraphPath = join(rootDir, ".repopath", "graph.json");
  if (existsSync(existingGraphPath)) {
    try {
      const data = JSON.parse(await readFile(existingGraphPath, "utf8")) as EvidenceGraph;
      scannerService.setActiveGraph(data);
    } catch { /* best effort */ }
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers for local developer experience
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. Dashboard UI (Live)
      if (pathname === "/" || pathname === "/index.html") {
        const activeGraph = scannerService.getActiveGraph();
        const html = generateDashboardHtml(activeGraph, { offline: false });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // 2. Offline Export
      if (pathname === "/api/export") {
        const activeGraph = scannerService.getActiveGraph();
        if (!activeGraph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active scan available to export. Run a scan first." }));
          return;
        }
        const offlineHtml = generateDashboardHtml(activeGraph, { offline: true });
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": 'attachment; filename="repopath-report.html"',
        });
        res.end(offlineHtml);
        return;
      }

      // 3. Status
      if (pathname === "/api/status") {
        const graph = scannerService.getActiveGraph();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          version: "1.0.0",
          activeDirectory: scannerService.getActiveDirectory(),
          activeDirectories: scannerService.getActiveDirectories(),
          hasGraph: !!graph,
          nodesCount: graph?.nodes.length ?? 0,
          edgesCount: graph?.edges.length ?? 0,
        }));
        return;
      }

      // 4. Project Detection (Step 1 - Supports single or multiple target folders)
      if (pathname === "/api/project/detect") {
        let dirs: string[] = [];
        if (req.method === "POST") {
          const body = await parseJsonBody(req);
          dirs = body.directories || (body.directory ? [body.directory] : []);
        } else {
          const dirParams = parsedUrl.searchParams.getAll("dir");
          if (dirParams.length > 0) {
            dirs = dirParams.flatMap((d) => d.split(",")).map((s) => s.trim()).filter(Boolean);
          }
        }
        if (dirs.length === 0) {
          dirs = scannerService.getActiveDirectories();
        }
        const detection = await scannerService.detectProject(dirs);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(detection));
        return;
      }

      // 5. Scan Plan Preview (Step 2 - Single or multiple folders)
      if (pathname === "/api/scan/plan" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const dirs = body.directories || (body.directory ? [body.directory] : scannerService.getActiveDirectories());
        const plan = await scannerService.previewScanPlan(dirs, body.options);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(plan));
        return;
      }

      // 6. Start Scan Job (Step 3 - Single or multiple folders)
      if (pathname === "/api/scan/start" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const dirs = body.directories || (body.directory ? [body.directory] : scannerService.getActiveDirectories());
        const job = scannerService.startScanJob(dirs, body.options);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(job));
        return;
      }

      // 7. Check Scan Job Status
      if (pathname.startsWith("/api/scan/status/")) {
        const jobId = pathname.replace("/api/scan/status/", "");
        const job = scannerService.getJob(jobId);
        if (!job) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Job ${jobId} not found` }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(job));
        return;
      }

      // 8. Graph JSON
      if (pathname === "/api/graph") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active scan found. Run a scan first." }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(graph));
        return;
      }

      // 9. Scan History
      if (pathname === "/api/history") {
        const historyPath = join(scannerService.getActiveDirectory(), ".repopath", "history.json");
        try {
          const content = await readFile(historyPath, "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(content);
        } catch {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify([]));
        }
        return;
      }

      // 10. Source Snippet
      if (pathname === "/api/source") {
        const file = parsedUrl.searchParams.get("file");
        const line = Number(parsedUrl.searchParams.get("line") || "1");
        const projectId = parsedUrl.searchParams.get("projectId") || parsedUrl.searchParams.get("root") || undefined;
        if (!file) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing ?file= parameter" }));
          return;
        }
        const graph = scannerService.getActiveGraph();
        const configuredRoots = graph?.sourceRoots ?? scannerService.getActiveDirectories().map((root) => ({
          projectId: root.split(/[\\/]/).at(-1) || "root",
          root,
        }));
        const selectedRoot = projectId
          ? configuredRoots.find((candidate) => candidate.projectId === projectId || candidate.root === projectId)?.root
          : undefined;
        const snippet = getSourceSnippet(
          selectedRoot ? [selectedRoot] : configuredRoots.map((candidate) => candidate.root),
          file,
          line,
          8,
          selectedRoot,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snippet));
        return;
      }

      // 11. Change Impact
      if (pathname === "/api/impact" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph loaded" }));
          return;
        }
        const target = body.target || "";
        const isFile = target.includes("/") || target.includes(".");
        const files = isFile ? [target] : (body.changedFiles || []);
        const symbols = !isFile && target ? [target] : (body.symbols || []);
        const report = analyzeImpact(graph, files, symbols);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...report, markdown: toMarkdown(report) }));
        return;
      }

      // 12. AI Assistant
      if (pathname === "/api/ai/ask" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph loaded to ground AI answers" }));
          return;
        }
        const question = body.question || "";
        const contextNodeId = body.contextNodeId;
        const answer = await aiEngine.askQuestion(question, contextNodeId, graph, scannerService.getActiveDirectories());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(answer));
        return;
      }

      // 13. Endpoint Trace
      if (pathname === "/api/trace") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        const endpoint = parsedUrl.searchParams.get("endpoint") || "";
        const trace = endpointTrace(graph, endpoint);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(trace);
        return;
      }

      // 14. Path Search
      if (pathname === "/api/path") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }

        const from = parsedUrl.searchParams.get("from") || "";
        const to = parsedUrl.searchParams.get("to") || "";
        const paths = findGraphPaths(graph, from, to);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(paths));
        return;
      }

      if (pathname === "/api/project/brief") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(buildProjectBrief(graph)));
        return;
      }

      if (pathname === "/api/health") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ findings: runHealthChecks(graph) }));
        return;
      }

      if (pathname === "/api/contracts") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ contracts: exploreContracts(graph) }));
        return;
      }

      if (pathname === "/api/operations") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ operations: buildApiOperations(graph) }));
        return;
      }

      if (pathname === "/api/architecture") {
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        res.end(architectureMarkdown(graph));
        return;
      }

      if (pathname === "/api/retrieve" && req.method === "POST") {
        const body = await parseJsonBody(req);
        const graph = scannerService.getActiveGraph();
        if (!graph) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No active graph" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(retrieveEvidence(body.question || "", graph, scannerService.getActiveDirectories())));
        return;
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Not found: ${pathname}` }));
    } catch (err: unknown) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.on("error", (err) => rejectPromise(err));
    server.listen(port, () => {
      const address = server.address();
      const actualPort = address && typeof address === "object" ? address.port : port;
      const url = `http://localhost:${actualPort}`;
      if (options.open) {
        openBrowser(url);
      }
      resolvePromise({
        port: actualPort,
        url,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON in request body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? `open "${url}"` : platform === "win32" ? `start "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => { /* ignore failures if in headless environment */ });
}
