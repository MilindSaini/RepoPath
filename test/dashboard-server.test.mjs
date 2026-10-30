import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { ScannerService } from "../dist/scanner-service.js";
import { AIEngine } from "../dist/ai-engine.js";
import { classifyLayer, getArchitectureLayers, extractFeatureFlows, findGraphPaths } from "../dist/graph-query.js";
import { startServer } from "../dist/server.js";
import { generateDashboardHtml } from "../dist/dashboard-ui.js";
import { buildGraph } from "../dist/core.js";
import { validateGraph } from "../dist/model.js";

test("validateGraph ensures graph contract integrity", () => {
  const invalidGraph1 = null;
  assert.equal(validateGraph(invalidGraph1).valid, false);

  const invalidGraph2 = { repository: "test", nodes: [], edges: [{ source: "non-existent", target: "bad", relation: "CALLS", evidence: {} }] };
  assert.equal(validateGraph(invalidGraph2).valid, false);

  const validGraph = {
    schemaVersion: "1.0.0",
    version: 2,
    scannedAt: new Date().toISOString(),
    repository: "test",
    nodes: [
      { id: "comp:A", kind: "ui_component", label: "ComponentA" },
      { id: "func:B", kind: "function", label: "functionB" }
    ],
    edges: [
      { id: "e1", source: "comp:A", target: "func:B", relation: "CALLS", evidence: { location: { file: "a.ts", line: 1 }, method: "typescript_compiler", status: "statically_established", confidence: "high", detail: "direct call" } }
    ]
  };
  const val = validateGraph(validGraph);
  assert.equal(val.valid, true);
  assert.equal(val.errors.length, 0);
});

test("ScannerService detectProject discovers languages, frameworks, and structure", async () => {
  const service = new ScannerService();
  const detection = await service.detectProject("tests/fixtures/storefront");

  assert.equal(detection.projectName, "storefront");
  assert.ok(detection.structure.totalFiles > 0, "Should detect files");
  assert.ok(detection.frameworks.includes("React") || detection.frameworks.includes("FastAPI"), "Should detect frameworks");
  assert.ok(detection.contracts.hasOpenApi, "Should detect openapi contract");
  assert.ok(detection.contracts.hasTraces, "Should detect traces file");
});

test("ScannerService previewScanPlan previews scoped files and active analyzers", async () => {
  const service = new ScannerService();
  const plan = await service.previewScanPlan("tests/fixtures/react-app");

  assert.ok(plan.totalFiles >= 4, "Should find react-app files");
  assert.ok(plan.activeAnalyzers.some((a) => a.name.includes("React") && a.enabled), "React analyzer should be enabled");
  assert.ok(plan.ignoredDirectories.includes("node_modules"), "Should list ignored directories");
  assert.equal(plan.estimatedStages.length, 6, "Should describe 6 scanning stages");
});

test("ScannerService startScanJob executes scan through 6 stages to completion", async () => {
  const service = new ScannerService();
  const job = service.startScanJob("tests/fixtures/react-app");

  assert.equal(job.status, "running");
  assert.ok(job.stages.length === 6, "Should have 6 stages");

  // Wait for job completion
  let retries = 0;
  while (job.status === "running" && retries < 50) {
    await new Promise((r) => setTimeout(r, 100));
    retries++;
  }

  assert.equal(job.status, "completed");
  assert.equal(job.progress, 100);
  assert.ok(job.result, "Job should have a result");
  assert.ok(job.result.nodesCount > 0, "Nodes count should be > 0");
  assert.ok(service.getActiveGraph(), "Service should retain active graph");
});

test("classifyLayer and getArchitectureLayers organize nodes into 4 full-stack layers", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const layers = getArchitectureLayers(graph);

  assert.ok(layers.frontend.nodeCount > 0, "Frontend layer should contain components/contexts");
  assert.ok(layers.api_client.nodeCount > 0, "API Client layer should contain requests");

  const appNode = graph.nodes.find((n) => n.label === "App");
  assert.ok(appNode, "App component should exist");
  assert.equal(classifyLayer(appNode), "frontend");
});

test("extractFeatureFlows maps complete cross-stack path from frontend to API", async () => {
  const graph = await buildGraph("tests/fixtures/storefront", {
    openapiPath: "tests/fixtures/storefront/openapi.json",
  });
  const flows = extractFeatureFlows(graph);

  assert.ok(flows.length > 0, "Should extract feature flows");
  const orderFlow = flows.find((f) => f.title.includes("OrderDetails") || f.steps.some((s) => s.node.label.includes("orders")));
  assert.ok(orderFlow, "Should find order feature flow");
  assert.ok(orderFlow.steps.length >= 2, "Flow should contain multiple cross-stack steps");
});

test("findGraphPaths finds shortest directed path between two connected nodes", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const appNode = graph.nodes.find((n) => n.label === "App");
  const authContext = graph.nodes.find((n) => n.label === "AuthContext");

  assert.ok(appNode && authContext, "Nodes should exist");
  const paths = findGraphPaths(graph, appNode.id, authContext.id);
  assert.ok(paths.length > 0, "Path from App to AuthContext should exist");
  assert.equal(paths[0][0].node.id, appNode.id);
  assert.equal(paths[0][paths[0].length - 1].node.id, authContext.id);
});

test("AIEngine explainComponent explains role, contexts, children, and source evidence", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const ai = new AIEngine();
  const dashboardNode = graph.nodes.find((n) => n.label === "Dashboard");
  assert.ok(dashboardNode, "Dashboard component should exist");

  const response = await ai.explainComponent(dashboardNode.id, graph, resolve("tests/fixtures/react-app"));

  assert.ok(response.answer.includes("Dashboard"), "Answer should include component name");
  assert.ok(response.answer.includes("AuthContext"), "Answer should cite consumed AuthContext");
  assert.ok(response.citedNodes.length > 0, "Should cite related graph nodes");
  assert.ok(response.evidenceSummary.staticFactsCount > 0, "Should report static facts count");
});

test("AIEngine explainFeaturePath traces execution path and discloses unresolved steps", async () => {
  const graph = await buildGraph("tests/fixtures/storefront");
  const ai = new AIEngine();

  const response = await ai.explainFeaturePath("orders", graph, resolve("tests/fixtures/storefront"));

  assert.ok(response.answer.includes("Full-Stack Execution Path"), "Should produce path header");
  assert.ok(response.citedNodes.length > 0, "Should cite nodes along path");
});

test("AIEngine onboardDeveloper provides structured guidance for repository", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const ai = new AIEngine();

  const response = await ai.onboardDeveloper("Authentication", graph, resolve("tests/fixtures/react-app"));

  assert.ok(response.answer.includes("Developer Onboarding Guide"), "Should include guide title");
  assert.ok(response.answer.includes("Core Entry Points"), "Should include entry points");
  assert.ok(response.answer.includes("How to Safely Make Changes"), "Should provide change guidance");
});

test("generateDashboardHtml produces self-contained interactive offline HTML report", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const html = generateDashboardHtml(graph, { offline: true });

  assert.ok(html.includes("<!doctype html>"), "Should be valid HTML doctype");
  assert.ok(html.includes("RepoPath — Full-Stack Application Map"), "Should contain title");
  assert.ok(html.includes("Architecture Overview"), "Should contain Architecture Overview view");
  assert.ok(html.includes("API & Data Flow"), "Should contain API & Data Flow view");
  assert.ok(html.includes("Change Impact"), "Should contain Change Impact view");
  assert.ok(html.includes("AI Assistant"), "Should contain AI Assistant view");
  assert.ok(html.includes("API Explorer"), "Should contain API Explorer view");
  assert.ok(html.includes("Missing contract"), "Should contain API resolution filters");
  assert.ok(html.includes("apiDetailPanel"), "Should contain API operation detail panel");
  assert.ok(html.includes(graph.repository), "Should embed repository name");
  assert.ok(html.includes("react-app"), "Should embed graph data");
});

test("startServer hosts local dashboard and responds to all API routes", async () => {
  const testPort = 3489;
  const serverInstance = await startServer({
    port: testPort,
    dir: "tests/fixtures/react-app",
    open: false,
  });

  try {
    const baseUrl = `http://localhost:${testPort}`;

    // 1. Dashboard UI HTML
    const indexRes = await fetch(`${baseUrl}/`);
    assert.equal(indexRes.status, 200);
    const indexHtml = await indexRes.text();
    assert.ok(indexHtml.includes("RepoPath"), "Index should serve RepoPath Dashboard");
    assert.ok(indexHtml.includes("openScanWizard()"), "Should contain openScanWizard call");

    // Verify client-side script has zero syntax errors
    const scriptMatch = indexHtml.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, "Index HTML must contain a <script> block");
    assert.doesNotThrow(() => {
      new Function(scriptMatch[1]);
    }, "Script in index HTML must be 100% valid JavaScript without syntax errors");

    // 2. Status API
    const statusRes = await fetch(`${baseUrl}/api/status`);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.status, "ok");

    // 3. Project Detect API (Step 1)
    const detectRes = await fetch(`${baseUrl}/api/project/detect?dir=tests/fixtures/react-app`);
    assert.equal(detectRes.status, 200);
    const detectData = await detectRes.json();
    assert.equal(detectData.projectName, "react-app");

    // 4. Scan Plan API (Step 2)
    const planRes = await fetch(`${baseUrl}/api/scan/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: "tests/fixtures/react-app" }),
    });
    assert.equal(planRes.status, 200);
    const planData = await planRes.json();
    assert.ok(planData.totalFiles >= 4);

    // 5. Scan Start API (Step 3)
    const scanRes = await fetch(`${baseUrl}/api/scan/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory: "tests/fixtures/react-app" }),
    });
    assert.equal(scanRes.status, 200);
    const jobData = await scanRes.json();
    assert.ok(jobData.id, "Should return job ID");

    // Poll job until complete
    let pollCount = 0;
    let finishedJob = jobData;
    while (finishedJob.status === "running" && pollCount < 40) {
      await new Promise((r) => setTimeout(r, 100));
      const pollRes = await fetch(`${baseUrl}/api/scan/status/${jobData.id}`);
      finishedJob = await pollRes.json();
      pollCount++;
    }
    assert.equal(finishedJob.status, "completed");

    // 6. Graph API
    const graphRes = await fetch(`${baseUrl}/api/graph`);
    assert.equal(graphRes.status, 200);
    const graphData = await graphRes.json();
    assert.ok(graphData.nodes.length > 0);

    // 7. API operation catalog
    const operationsRes = await fetch(`${baseUrl}/api/operations`);
    assert.equal(operationsRes.status, 200);
    const operationsData = await operationsRes.json();
    assert.ok(Array.isArray(operationsData.operations));
    assert.ok(operationsData.operations.some((operation) => operation.operationId.startsWith("operation:")));

    // 8. Source Snippet API
    const sourceRes = await fetch(`${baseUrl}/api/source?file=src/App.tsx&line=5`);
    assert.equal(sourceRes.status, 200);
    const sourceData = await sourceRes.json();
    assert.ok(sourceData.content.includes("AuthProvider"), "Source should include App.tsx lines");

    // 9. AI Ask API
    const aiRes = await fetch(`${baseUrl}/api/ai/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Explain component App" }),
    });
    assert.equal(aiRes.status, 200);
    const aiData = await aiRes.json();
    assert.ok(aiData.answer.includes("App"), "AI should answer question about App");

    // 10. Offline HTML Export API
    const exportRes = await fetch(`${baseUrl}/api/export`);
    assert.equal(exportRes.status, 200);
    const exportHtml = await exportRes.text();
    assert.ok(exportHtml.includes("<!doctype html>"));
  } finally {
    await serverInstance.close();
  }
});

test("ScannerService and Server handle multi-folder / multi-location inspection", async () => {
  const service = new ScannerService();
  const folderA = "tests/fixtures/storefront/web";
  const folderB = "tests/fixtures/storefront/api";

  // 1. Multi-folder detection
  const detection = await service.detectProject([folderA, folderB]);
  assert.equal(detection.folders.length, 2, "Should detect 2 distinct folders");
  assert.ok(detection.folders.some((f) => f.name.includes("web") || f.frameworks.includes("React")), "Web folder should be detected");
  assert.ok(detection.folders.some((f) => f.name.includes("api") || f.frameworks.includes("Express")), "API folder should be detected");
  assert.ok(detection.structure.totalFiles > 0, "Total files should be combined");

  // 2. Multi-folder scan plan preview
  const plan = await service.previewScanPlan([folderA, folderB]);
  assert.equal(plan.folders.length, 2, "Plan should summarize 2 folders");
  assert.ok(plan.totalFiles > 0, "Plan should total files across all locations");
  assert.ok(plan.activeAnalyzers.some((a) => a.name.includes("React") && a.enabled));
  assert.ok(plan.activeAnalyzers.some((a) => a.name.includes("Express") && a.enabled));

  // 3. Multi-folder scan execution
  const job = service.startScanJob([folderA, folderB]);
  let retries = 0;
  while (job.status === "running" && retries < 50) {
    await new Promise((r) => setTimeout(r, 100));
    retries++;
  }
  assert.equal(job.status, "completed");
  const graph = service.getActiveGraph();
  assert.ok(graph, "Should produce unified graph");
  assert.ok(graph.nodes.length > 0, "Unified graph should have nodes");

  // 4. Test multi-folder server endpoints
  const serverInstance = await startServer({ port: 0, service });
  const baseUrl = `http://127.0.0.1:${serverInstance.port}`;

  try {
    // Multi-folder status
    const statusRes = await fetch(`${baseUrl}/api/status`);
    const statusData = await statusRes.json();
    assert.ok(Array.isArray(statusData.activeDirectories));
    assert.equal(statusData.activeDirectories.length, 2);

    // Multi-folder detect via POST
    const detectRes = await fetch(`${baseUrl}/api/project/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [folderA, folderB] }),
    });
    assert.equal(detectRes.status, 200);
    const detectData = await detectRes.json();
    assert.equal(detectData.folders.length, 2);

    // Multi-folder scan plan via POST
    const planRes = await fetch(`${baseUrl}/api/scan/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [folderA, folderB] }),
    });
    assert.equal(planRes.status, 200);
    const planResData = await planRes.json();
    assert.equal(planResData.folders.length, 2);

    // Multi-folder HTML generation
    const htmlRes = await fetch(baseUrl);
    const html = await htmlRes.text();
    assert.ok(html.includes("folderChipsBar"), "HTML should contain folder filter chips container");
    assert.ok(html.includes("foldersOverviewSection"), "HTML should contain folders overview section");
    assert.ok(html.includes("folderRowsContainer"), "HTML should contain folder rows container in scan modal");
    assert.ok(html.includes("addFolderRow"), "HTML should contain addFolderRow function");
  } finally {
    await serverInstance.close();
  }
});

test("Dashboard UI provides Progressive Disclosure, specific Evidence Badges & Synchronized Selection", async () => {
  const graph = await buildGraph("tests/fixtures/react-app");
  const html = generateDashboardHtml(graph, { offline: true });

  // Progressive Disclosure toolbar controls
  assert.ok(html.includes("btnGraphLevel1"), "Should have Level 1 System button");
  assert.ok(html.includes("btnGraphLevel2"), "Should have Level 2 Modules button");
  assert.ok(html.includes("btnGraphLevel3"), "Should have Level 3 Dependencies button");
  assert.ok(html.includes("setGraphLevel"), "Should include setGraphLevel function");
  assert.ok(html.includes("expandNeighbours"), "Should include expandNeighbours function");
  assert.ok(html.includes("collapseGraph"), "Should include collapseGraph function");
  assert.ok(html.includes("filterByRelation"), "Should include filterByRelation function");

  // Specific evidence status badges (not just blanket VERIFIED)
  assert.ok(html.includes("status-static"), "Should have status-static CSS class");
  assert.ok(html.includes("status-observed"), "Should have status-observed CSS class");
  assert.ok(html.includes("status-inferred"), "Should have status-inferred CSS class");
  assert.ok(html.includes("status-unresolved"), "Should have status-unresolved CSS class");
  assert.ok(html.includes("renderEvidenceBadge"), "Should include renderEvidenceBadge function");

  // Synchronized Selection and source inspector
  assert.ok(html.includes("active-flow-step"), "Should have active-flow-step CSS class");
  assert.ok(html.includes("inspectSourceLine"), "Should include inspectSourceLine function");
  assert.ok(html.includes("findAndSelectSymbol"), "Should include findAndSelectSymbol function");

  // Clean overview metrics and explore buttons
  assert.ok(html.includes("layer-metric-row"), "Should have layer metric row CSS");
  assert.ok(html.includes("explore-layer-btn"), "Should have explore layer button CSS");
  assert.ok(html.includes("exploreLayer"), "Should include exploreLayer function");
});

test("Graph Query classifyLayer and getSourceSnippet handle client_script and multi-folder roots", async () => {
  const { classifyLayer, getSourceSnippet } = await import("../dist/graph-query.js");

  // classifyLayer with client_script
  assert.equal(classifyLayer({ id: "script1", kind: "client_script", label: "map.js" }), "frontend");

  // Multi-folder getSourceSnippet path resolution
  const testDirA = resolve("tests/fixtures/react-app");
  const snippet = await getSourceSnippet([testDirA], "src/App.tsx", 1);
  assert.ok(!snippet.error, "Should resolve file snippet without error");
  assert.ok(snippet.content.includes("export function App"), "Should contain source code content");
  assert.equal(snippet.targetLine, 1);
});

test("Dashboard UI provides dynamic Relation Filter Buttons, bidirectional cross-view sync, and collapsible inspector", async () => {
  const graph = await buildGraph("tests/fixtures/storefront");
  const html = generateDashboardHtml(graph, { offline: true });

  // 1. Dynamic Relation Filter Buttons in toolbar and explorer
  assert.ok(html.includes("relationFilterBar"), "Should contain #relationFilterBar in toolbar");
  assert.ok(html.includes("leftRelationChipsBar"), "Should contain #leftRelationChipsBar in left panel");
  assert.ok(html.includes("getDistinctRelations"), "Should include getDistinctRelations function");
  assert.ok(html.includes("renderRelationButtons"), "Should include renderRelationButtons function");
  assert.ok(html.includes("relation-pill-btn"), "Should have relation-pill-btn CSS class");
  assert.ok(html.includes("relation-tag-btn"), "Should have relation-tag-btn CSS class");

  // 2. Bidirectional sync functions
  assert.ok(html.includes("syncSelectionWithFlow"), "Should include syncSelectionWithFlow function");
  assert.ok(html.includes("updateAiContextBar"), "Should include updateAiContextBar function");
  assert.ok(html.includes("aiActiveContextBar"), "Should contain #aiActiveContextBar element");
  assert.ok(html.includes("ai-context-banner"), "Should have ai-context-banner CSS class");

  // 3. Inspector navigation action buttons and collapsible panel
  assert.ok(html.includes("focusSelectedInGraph"), "Should include focusSelectedInGraph action");
  assert.ok(html.includes("focusSelectedInFlow"), "Should include focusSelectedInFlow action");
  assert.ok(html.includes("focusSelectedInImpact"), "Should include focusSelectedInImpact action");
  assert.ok(html.includes("toggleInspector"), "Should include toggleInspector function");
  assert.ok(html.includes("rightInspectorPanel"), "Should have #rightInspectorPanel id");
  assert.ok(html.includes(".right-panel.collapsed"), "Should have .right-panel.collapsed CSS");
  assert.ok(html.includes("reopenInspectorBtn"), "Should contain #reopenInspectorBtn");
  assert.ok(html.includes("inspector-top-row"), "Should have inspector-top-row class");
  assert.ok(html.includes("inspector-entity-meta"), "Should have inspector-entity-meta class");
  assert.ok(html.includes("inspector-quick-actions"), "Should have inspector-quick-actions class");
  assert.ok(html.includes("overflow-wrap: anywhere"), "Should have overflow-wrap: anywhere for unsquished titles");

  // 4. Trace Path banner and Interactive Impact cards
  assert.ok(html.includes("traceBanner"), "Should contain #traceBanner element");
  assert.ok(html.includes("clearTracePath"), "Should include clearTracePath function");
  assert.ok(html.includes("impact-results-container"), "Should have impact-results-container CSS");
  assert.ok(html.includes("impact-node-pill"), "Should have impact-node-pill CSS");
  assert.ok(html.includes("canvas-controls-main-row"), "Should have canvas-controls-main-row class");
  assert.ok(html.includes("relation-filter-bar-container"), "Should have relation-filter-bar-container class");
  assert.ok(html.includes("method-mini-tag"), "Should have method-mini-tag class");
  assert.ok(html.includes("formatSmartNodeLabel"), "Should include formatSmartNodeLabel function");

  // 5. Valid client-side JS syntax
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, "HTML must contain <script>");
  assert.doesNotThrow(() => {
    new Function(scriptMatch[1]);
  }, "Generated client-side script must be 100% valid JavaScript without syntax errors");
});

test("Canonical calculateProjectMetrics provides consistent counts across layers, sidebar, and evidence", async () => {
  const { calculateProjectMetrics } = await import("../dist/metrics.js");
  const graph = await buildGraph("tests/fixtures/storefront");

  const metrics = calculateProjectMetrics(graph);
  assert.equal(metrics.totalNodes, graph.nodes.length, "Total nodes must match graph");
  assert.equal(metrics.totalEdges, graph.edges.length, "Total edges must match graph");

  // Sum of layer totals must equal total nodes
  const layerSum = Object.values(metrics.layers).reduce((acc, l) => acc + l.total, 0);
  assert.equal(layerSum, metrics.totalNodes, "Sum of all layer nodes must equal total nodes");

  // Sidebar counts must be non-negative and properly bucketed
  assert.ok(metrics.sidebarCounts.frontend >= 0);
  assert.ok(metrics.sidebarCounts.backend_routes >= 0);
  assert.ok(metrics.sidebarCounts.api_client >= 0);
  assert.ok(metrics.sidebarCounts.data_layer >= 0);

  // Evidence status sum must equal total edges
  const evidenceSum = metrics.evidenceStatus.statically_established +
    metrics.evidenceStatus.observed +
    metrics.evidenceStatus.inferred +
    metrics.evidenceStatus.unresolved;
  assert.equal(evidenceSum, metrics.totalEdges, "Evidence status sum must equal total edges");
});

test("Impact analysis distinguishes confirmed_impact, no_impact_identified, and analysis_incomplete", async () => {
  const { analyzeImpact, toMarkdown } = await import("../dist/impact.js");
  const graph = await buildGraph("tests/fixtures/storefront");

  // 1. Analysis incomplete: symbol cannot be mapped to graph
  const unmappedReport = analyzeImpact(graph, [], ["NonExistentSymbol_XYZ123"]);
  assert.equal(unmappedReport.status, "analysis_incomplete", "Should report analysis_incomplete when symbol is unmapped");
  assert.equal(unmappedReport.testRecommendationType, "full_suite_fallback", "Should fallback to full suite on unmapped symbol");
  assert.ok(unmappedReport.unknowns.length > 0, "Should document unknowns");
  const unmappedMd = toMarkdown(unmappedReport);
  assert.ok(unmappedMd.includes("ANALYSIS INCOMPLETE"), "Markdown report must show status banner");
  assert.ok(unmappedMd.includes("Conservative Full-Suite Fallback"), "Markdown must explain full suite fallback");

  // 2. Confirmed impact: modifying an existing component
  const existingComp = graph.nodes.find((n) => n.attributes?.isReactComponent || n.kind === "ui_component");
  if (existingComp) {
    const report = analyzeImpact(graph, [], [existingComp.label]);
    assert.ok(report.direct.length > 0, "Direct impact must find the node");
    assert.ok(report.status === "confirmed_impact" || report.status === "no_impact_identified");
    assert.ok(report.statusExplanation.length > 0, "Must provide explanation");
  }
});

test("Multi-root source snippet provides rootIdentifier, repoRelativePath, and detailed diagnostics when file is missing", async () => {
  const { getSourceSnippet } = await import("../dist/graph-query.js");
  const testDirA = resolve("tests/fixtures/react-app");
  const testDirB = resolve("tests/fixtures/storefront");

  // 1. Existing file
  const foundSnippet = getSourceSnippet([testDirA, testDirB], "src/App.tsx", 1);
  assert.equal(foundSnippet.exists, true, "File must exist");
  assert.ok(foundSnippet.rootIdentifier, "Must report root identifier");
  assert.ok(foundSnippet.repoRelativePath, "Must report repo-relative path");

  // 2. Missing file returns diagnostics
  const missingSnippet = getSourceSnippet([testDirA, testDirB], "src/NonExistentFile.tsx", 10);
  assert.equal(missingSnippet.exists, false, "File must not exist");
  assert.ok(missingSnippet.diagnostic, "Must return diagnostic object");
  assert.equal(missingSnippet.diagnostic.searchedRoots.length, 2, "Must report both searched roots");
  assert.ok(missingSnippet.diagnostic.reason.includes("does not exist"), "Must state diagnostic reason");
});

test("Dashboard UI provides Searchable Grouped Combobox, 7-stage Swimlane, and Copy-to-Clipboard", async () => {
  const graph = await buildGraph("tests/fixtures/storefront");
  const html = generateDashboardHtml(graph, { offline: true });

  // 1. Searchable grouped combobox
  assert.ok(html.includes("flow-combobox-wrapper"), "Must include .flow-combobox-wrapper");
  assert.ok(html.includes("flowSearchInput"), "Must include #flowSearchInput");
  assert.ok(html.includes("flowComboboxDropdown"), "Must include #flowComboboxDropdown");
  assert.ok(html.includes("selectFlowItem"), "Must include selectFlowItem function");
  assert.ok(html.includes("toggleFlowCombobox"), "Must include toggleFlowCombobox function");
  assert.ok(html.includes("filterFlowCombobox"), "Must include filterFlowCombobox function");

  // 2. 7-stage swimlane and distinct stages
  assert.ok(html.includes("1. Frontend Component"), "Must have Step 1 Frontend");
  assert.ok(html.includes("2. API Client Request"), "Must have Step 2 API Client");
  assert.ok(html.includes("3. Backend Route"), "Must have Step 3 Backend Route");
  assert.ok(html.includes("4. Route Handler"), "Must have Step 4 Route Handler");
  assert.ok(html.includes("5. Domain Service"), "Must have Step 5 Domain Service");
  assert.ok(html.includes("6. Database Operation"), "Must have Step 6 DB Operation");
  assert.ok(html.includes("7. Database Table / Schema"), "Must have Step 7 DB Table");

  // 3. Copy-to-clipboard and code block syntax
  assert.ok(html.includes("copyCode"), "Must include copyCode function");
  assert.ok(html.includes("copyMessageText"), "Must include copyMessageText function");
  assert.ok(html.includes("code-block-wrapper"), "Must have code-block-wrapper CSS");
  assert.ok(html.includes("copy-msg-btn"), "Must have copy-msg-btn CSS");

  // 4. Client-side metrics service integration
  assert.ok(html.includes("calculateProjectMetrics"), "Must include calculateProjectMetrics function");
  assert.ok(html.includes("getNodeDisplayLabel"), "Must include getNodeDisplayLabel function");
});




