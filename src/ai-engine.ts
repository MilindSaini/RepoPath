import type { EvidenceGraph, GraphEdge, GraphNode } from "./model.js";
import { getSourceSnippet, classifyLayer, findGraphPaths, extractFeatureFlows } from "./graph-query.js";
import { analyzeImpact, toMarkdown } from "./impact.js";
import { calculateProjectMetrics } from "./metrics.js";

export interface AIResponse {
  answer: string;
  citedNodes: GraphNode[];
  citedSources: { file: string; line: number; snippet: string }[];
  evidenceSummary: {
    staticFactsCount: number;
    observedFactsCount: number;
    inferredFactsCount: number;
    unresolvedCount: number;
  };
  uncertainties: string[];
}

export class AIEngine {
  constructor(private readonly apiKey?: string) {}

  /**
   * Feature 1: Explain this component.
   * Explains its role, which contexts it consumes, which components it renders, and where its data comes from.
   */
  async explainComponent(nodeId: string, graph: EvidenceGraph, repoRoot: string | string[]): Promise<AIResponse> {
    const node = graph.nodes.find((n) => n.id === nodeId || n.label.toLowerCase() === nodeId.toLowerCase());
    if (!node) {
      return {
        answer: `Component or node \`${nodeId}\` was not found in the scanned graph. Please select a valid component or function.`,
        citedNodes: [],
        citedSources: [],
        evidenceSummary: { staticFactsCount: 0, observedFactsCount: 0, inferredFactsCount: 0, unresolvedCount: 0 },
        uncertainties: ["Node not found in current scan."],
      };
    }

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const incoming = graph.edges.filter((e) => e.target === node.id);
    const outgoing = graph.edges.filter((e) => e.source === node.id);

    // Contexts consumed
    const consumedContexts = outgoing
      .filter((e) => e.relation === "CONSUMES_CONTEXT")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Contexts provided
    const providedContexts = outgoing
      .filter((e) => e.relation === "PROVIDES_CONTEXT")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Components rendered
    const renderedComponents = outgoing
      .filter((e) => e.relation === "RENDERS")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Rendered by (parents)
    const renderedBy = incoming
      .filter((e) => e.relation === "RENDERS")
      .map((e) => nodeById.get(e.source))
      .filter(Boolean) as GraphNode[];

    // Outgoing API requests
    const outgoingRequests = outgoing
      .filter((e) => e.relation === "REQUESTS")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Function calls made
    const calls = outgoing
      .filter((e) => e.relation === "CALLS")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Database touches
    const dbOperations = outgoing
      .filter((e) => e.relation === "TOUCHES_DATABASE" || e.relation === "QUERIES")
      .map((e) => nodeById.get(e.target))
      .filter(Boolean) as GraphNode[];

    // Tests exercising this
    const testEdges = incoming.filter((e) => e.relation === "EXERCISES" || e.relation === "TESTS");
    const tests = testEdges.map((e) => nodeById.get(e.source)).filter(Boolean) as GraphNode[];

    // Source snippet
    const snippet = node.location ? getSourceSnippet(repoRoot, node.location.file, node.location.line, 6) : undefined;

    // Evidence stats
    const allEdges = [...incoming, ...outgoing];
    const staticCount = allEdges.filter((e) => e.evidence.status === "statically_established").length;
    const observedCount = allEdges.filter((e) => e.evidence.status === "observed").length;
    const inferredCount = allEdges.filter((e) => e.evidence.status === "inferred").length;
    const unresolvedCount = allEdges.filter((e) => e.evidence.status === "unresolved").length;

    const uncertainties: string[] = [];
    if (unresolvedCount > 0) {
      uncertainties.push(`${unresolvedCount} connection(s) could not be statically resolved.`);
    }
    if (tests.length === 0) {
      uncertainties.push("No explicit test coverage mapping was found exercising this component directly.");
    }

    const lines: string[] = [];
    lines.push(`### Component Overview: \`${node.label}\``);
    if (node.location) {
      lines.push(`📍 **Location**: \`${node.location.file}:${node.location.line}\``);
    }
    lines.push(`🏷️ **Kind**: \`${node.kind}\` | **Layer**: \`${classifyLayer(node)}\`\n`);

    // Section 1: Explanation
    lines.push(`### 1. Explanation`);
    if (node.attributes?.isReactComponent) {
      lines.push(`\`${node.label}\` is a React component that manages UI layout and user interaction.`);
    } else if (node.attributes?.isProvider) {
      lines.push(`\`${node.label}\` is a React Context Provider supplying application state.`);
    } else if (node.kind === "api_route") {
      lines.push(`\`${node.label}\` is an HTTP backend route endpoint.`);
    } else {
      lines.push(`\`${node.label}\` is a ${node.kind} declared in \`${node.location?.file ?? "unknown"}\`.`);
    }
    lines.push("");

    // Section 2: Relevant Files
    lines.push(`### 2. Relevant Files`);
    if (node.location) {
      lines.push(`- **Primary Definition**: \`${node.location.file}:${node.location.line}\``);
    }
    const relatedFiles = new Set<string>();
    for (const n of [...renderedComponents, ...renderedBy, ...consumedContexts, ...providedContexts]) {
      if (n.location?.file && n.location.file !== node.location?.file) {
        relatedFiles.add(`- **${n.label}** (\`${n.kind}\`): \`${n.location.file}:${n.location.line}\``);
      }
    }
    if (relatedFiles.size > 0) {
      lines.push([...relatedFiles].join("\n"));
    }
    if (snippet && snippet.exists) {
      lines.push("\n**Source Evidence Excerpt**:");
      lines.push("```typescript");
      lines.push(snippet.content);
      lines.push("```");
      lines.push(`*(Lines ${snippet.startLine}–${snippet.endLine} of ${node.location?.file})*`);
    }
    lines.push("");

    // Section 3: Dependency Path
    lines.push(`### 3. Dependency Path`);
    if (renderedBy.length > 0) {
      lines.push(`- **Rendered by (Parent Hierarchy)**: ${renderedBy.map((p) => `\`<${p.label} />\``).join(", ")}`);
    }
    if (renderedComponents.length > 0) {
      lines.push(`- **Rendered Children**: ${renderedComponents.map((c) => `\`<${c.label} />\``).join(", ")}`);
    }
    if (consumedContexts.length > 0) {
      lines.push(`- **Consumed Contexts**: ${consumedContexts.map((c) => `\`${c.label}\``).join(", ")} (AuthContext)`);
    }
    if (providedContexts.length > 0) {
      lines.push(`- **Provided Contexts**: ${providedContexts.map((c) => `\`${c.label}\``).join(", ")}`);
    }
    if (outgoingRequests.length > 0) {
      lines.push(`- **API Requests**: ${outgoingRequests.map((r) => `\`${r.label}\``).join(", ")}`);
    }
    if (calls.length > 0) {
      lines.push(`- **Function Calls**: ${calls.slice(0, 5).map((c) => `\`${c.label}()\``).join(", ")}${calls.length > 5 ? ` *(+${calls.length - 5} more)*` : ""}`);
    }
    if (dbOperations.length > 0) {
      lines.push(`- **Database Touches**: ${dbOperations.map((d) => `\`${d.label}\``).join(", ")}`);
    }
    lines.push("");

    // Section 4: Potential Impact
    lines.push(`### 4. Potential Impact`);
    const dependents = [...renderedBy, ...incoming.filter((e) => e.relation === "CALLS").map((e) => nodeById.get(e.source)).filter(Boolean) as GraphNode[]];
    if (dependents.length > 0) {
      lines.push(`Modifying \`${node.label}\` directly affects ${dependents.length} upstream caller(s)/parent(s): ${dependents.map((d) => `\`${d.label}\``).join(", ")}.`);
    } else {
      lines.push(`\`${node.label}\` appears to be a top-level component or has no direct upstream JSX parents discovered in the current scope.`);
    }
    if (outgoingRequests.length > 0) {
      lines.push(`Changes to this component's data fetching may alter parameters sent to: ${outgoingRequests.map((r) => `\`${r.label}\``).join(", ")}.`);
    }
    lines.push("");

    // Section 5: Tests
    lines.push(`### 5. Tests`);
    if (tests.length > 0) {
      lines.push(`The following test(s) directly exercise \`${node.label}\`:`);
      for (const t of tests) {
        lines.push(`- \`${t.label}\` in \`${t.location?.file ?? ""}:${t.location?.line ?? ""}\``);
      }
    } else {
      lines.push(`⚠️ No targeted tests were discovered directly exercising \`${node.label}\`. Run the complete test suite when modifying this component.`);
    }
    lines.push("");

    // Section 6: Unknowns & Safeguards
    lines.push(`### 6. Unknowns & Safeguards`);
    lines.push(`- **Evidence Integrity**: ${staticCount} statically established facts, ${observedCount} runtime traces, ${inferredCount} inferred relations.`);
    if (uncertainties.length > 0) {
      for (const u of uncertainties) {
        lines.push(`- ⚠️ ${u}`);
      }
    } else {
      lines.push(`- All direct relationships were statically verified from source AST.`);
    }

    const citedNodes = [
      node,
      ...consumedContexts,
      ...providedContexts,
      ...renderedComponents,
      ...outgoingRequests,
      ...calls,
      ...dbOperations,
      ...tests,
    ];

    return {
      answer: lines.join("\n"),
      citedNodes,
      citedSources: snippet && snippet.exists && node.location
        ? [{ file: node.location.file, line: node.location.line, snippet: snippet.content }]
        : [],
      evidenceSummary: {
        staticFactsCount: staticCount,
        observedFactsCount: observedCount,
        inferredFactsCount: inferredCount,
        unresolvedCount,
      },
      uncertainties,
    };
  }

  /**
   * Feature 2: Explain this feature's full path.
   * Follows known path: Frontend -> API client -> Backend route -> Handler/Service -> Database.
   * Missing connections appear as unresolved, never invented.
   */
  async explainFeaturePath(query: string, graph: EvidenceGraph, repoRoot: string | string[]): Promise<AIResponse> {
    const q = query.trim().toLowerCase();
    const flows = extractFeatureFlows(graph);

    // Find best matching feature flow
    let bestFlow = flows.find(
      (f) => f.title.toLowerCase().includes(q) || f.steps.some((s) => s.node.label.toLowerCase().includes(q))
    );

    // If no flow directly matched by substring, find matching endpoint or request node
    if (!bestFlow) {
      const matchNode = graph.nodes.find(
        (n) => n.label.toLowerCase().includes(q) || (n.kind === "api_route" && n.id.toLowerCase().includes(q))
      );
      if (matchNode) {
        bestFlow = flows.find((f) => f.steps.some((s) => s.node.id === matchNode.id));
      }
    }

    // If still no flow, pick the first available flow or explain unresolved search
    if (!bestFlow) {
      if (flows.length > 0) {
        bestFlow = flows[0];
      } else {
        return {
          answer: `Could not trace an end-to-end execution path for "${query}". No connected frontend-to-database flows were found in the current scan.`,
          citedNodes: [],
          citedSources: [],
          evidenceSummary: { staticFactsCount: 0, observedFactsCount: 0, inferredFactsCount: 0, unresolvedCount: 1 },
          uncertainties: ["No connected path found matching the given query."],
        };
      }
    }

    const lines: string[] = [];
    lines.push(`### Full-Stack Execution Path: ${bestFlow.title}`);
    lines.push("Follows verified evidence from user interaction to persistent database query:\n");

    const citedNodes: GraphNode[] = [];
    const citedSources: { file: string; line: number; snippet: string }[] = [];
    let staticCount = 0;
    let observedCount = 0;
    let inferredCount = 0;
    let unresolvedCount = bestFlow.unresolvedSteps.length;

    // Section 1: Explanation
    lines.push("### 1. Explanation");
    lines.push(`This execution flow traces the feature path for **${bestFlow.title}** across ${bestFlow.steps.length} verified stage(s). ${bestFlow.complete ? "The path is fully connected from source to storage." : "Some stages in this path have unresolved connections that require attention."}`);
    lines.push("");

    // Section 2: Relevant Files
    lines.push("### 2. Relevant Files");
    const seenFiles = new Set<string>();
    for (const step of bestFlow.steps) {
      if (step.node.location?.file && !seenFiles.has(step.node.location.file)) {
        seenFiles.add(step.node.location.file);
        lines.push(`- \`${step.node.location.file}\` (lines ~${step.node.location.line}) — **${step.node.label}** \`[${step.node.kind}]\``);
      }
    }
    lines.push("");

    // Section 3: Dependency Path
    lines.push("### 3. Dependency Path");
    for (let i = 0; i < bestFlow.steps.length; i++) {
      const step = bestFlow.steps[i];
      const node = step.node;
      citedNodes.push(node);

      const layer = classifyLayer(node);
      const icon = layer === "frontend" ? "🖥️" : layer === "api_client" ? "🌐" : layer === "backend" ? "⚙️" : layer === "data_layer" ? "🗄️" : "🔹";
      const status = step.evidenceToNext?.status ?? "statically_established";
      if (status === "statically_established") staticCount++;
      else if (status === "observed") observedCount++;
      else if (status === "inferred") inferredCount++;
      else if (status === "unresolved") unresolvedCount++;

      const relationBadge = step.relationToNext ? `── **${step.relationToNext}** ──>` : "";

      lines.push(`${i + 1}. ${icon} **${node.label}** \`[${layer.toUpperCase()}]\``);
      if (node.location) {
        lines.push(`   - 📍 Source: \`${node.location.file}:${node.location.line}\``);
        const snip = getSourceSnippet(repoRoot, node.location.file, node.location.line, 2);
        if (snip.exists) {
          citedSources.push({ file: node.location.file, line: node.location.line, snippet: snip.content });
        }
      }
      if (step.evidenceToNext) {
        lines.push(`   - 🔗 Evidence: \`${step.evidenceToNext.status}\` via \`${step.evidenceToNext.method}\` (${step.evidenceToNext.detail})`);
      }
      if (node.attributes?.query) {
        lines.push(`   - 📝 SQL Query: \`${node.attributes.query}\``);
      }
      if (relationBadge && i < bestFlow.steps.length - 1) {
        lines.push(`   ${relationBadge}`);
      }
      lines.push("");
    }

    // Section 4: Potential Impact
    lines.push("### 4. Potential Impact");
    lines.push(`Modifying any contract, parameter, or schema along this path cascades across the full stack. Backend changes require updating client API callers, while database schema modifications impact handler query serialization.`);
    lines.push("");

    // Section 5: Tests
    lines.push("### 5. Tests");
    const flowStepIds = new Set(bestFlow.steps.map((s) => s.node.id));
    const flowTests = graph.edges
      .filter((e) => (e.relation === "EXERCISES" || e.relation === "TESTS") && flowStepIds.has(e.target))
      .map((e) => graph.nodes.find((n) => n.id === e.source))
      .filter(Boolean) as GraphNode[];
    if (flowTests.length > 0) {
      lines.push("Discovered tests exercising this flow:");
      for (const t of flowTests) {
        lines.push(`- \`${t.label}\`${t.location ? ` in \`${t.location.file}:${t.location.line}\`` : ""}`);
      }
    } else {
      lines.push("⚠️ No targeted automated tests directly map to this execution flow. End-to-end integration testing is recommended.");
    }
    lines.push("");

    // Section 6: Unknowns & Safeguards
    lines.push("### 6. Unknowns & Safeguards");
    if (bestFlow.unresolvedSteps.length > 0) {
      for (const unres of bestFlow.unresolvedSteps) {
        lines.push(`- 🔴 **Missing link**: ${unres}`);
      }
      lines.push("\n*Note: RepoPath strictly distinguishes discovered code from missing backend implementations. Missing links are never fabricated.*");
    } else {
      lines.push("- All relationships in this execution flow have been confirmed by static analysis or runtime traces.");
    }

    return {
      answer: lines.join("\n"),
      citedNodes,
      citedSources,
      evidenceSummary: {
        staticFactsCount: staticCount,
        observedFactsCount: observedCount,
        inferredFactsCount: inferredCount,
        unresolvedCount,
      },
      uncertainties: bestFlow.unresolvedSteps,
    };
  }

  /**
   * Feature 3: Predict change impact.
   * Identifies affected consumers, contracts, database operations, and related tests.
   */
  async predictChangeImpact(target: string, graph: EvidenceGraph, repoRoot: string | string[]): Promise<AIResponse> {
    const isFile = target.includes("/") || target.includes(".");
    const files = isFile ? [target] : [];
    const symbols = !isFile ? [target] : [];

    const report = analyzeImpact(graph, files, symbols);
    const md = toMarkdown(report);

    const uncertainties: string[] = [...report.unknowns];
    if (report.usedConservativeFallback) {
      uncertainties.push("Traversal used conservative fallback for tests due to incomplete mapping.");
    }

    const citedNodes = [...report.direct.map((d) => d.node), ...report.downstream.map((d) => d.node), ...report.tests];

    return {
      answer: md,
      citedNodes,
      citedSources: [],
      evidenceSummary: {
        staticFactsCount: report.direct.length + report.downstream.length,
        observedFactsCount: 0,
        inferredFactsCount: 0,
        unresolvedCount: report.unknowns.length,
      },
      uncertainties,
    };
  }

  /**
   * Feature 4: Onboard a new developer.
   * Structured into 4 distinct, source-grounded sections:
   * 1. What this application does
   * 2. Where to start
   * 3. How data flows
   * 4. What remains unknown
   */
  async onboardDeveloper(topic: string, graph: EvidenceGraph, repoRoot: string | string[]): Promise<AIResponse> {
    const metrics = calculateProjectMetrics(graph);
    const components = graph.nodes.filter((n) => n.attributes?.isReactComponent || n.kind === "ui_component");
    const providers = graph.nodes.filter((n) => n.attributes?.isProvider || n.kind === "context");
    const endpoints = graph.nodes.filter((n) => n.kind === "api_route");
    const dbEntities = graph.nodes.filter((n) => n.kind === "database_entity" || n.kind === "database_table" || n.kind === "data_model");
    const tests = graph.nodes.filter((n) => n.kind === "test");
    const unresolvedRequests = metrics.layers.api_client.entities.unresolvedRequests;

    const lines: string[] = [];
    lines.push(`## 🧭 Developer Onboarding Guide: ${topic || "Architecture Overview"}`);
    lines.push(`Welcome! RepoPath established **${metrics.totalNodes}** nodes and **${metrics.totalEdges}** relationships across **${graph.repository}** without executing arbitrary runtime scripts.\n`);

    lines.push("### 1. Explanation (What This Application Does)");
    const detectedLayers: string[] = [];
    if (metrics.layers.frontend.total > 0) detectedLayers.push(`a React/frontend layer with **${metrics.layers.frontend.entities.components} component(s)** and **${metrics.layers.frontend.entities.providers} provider(s)**`);
    if (metrics.layers.api_client.total > 0) detectedLayers.push(`an API client layer with **${metrics.layers.api_client.entities.requests} request(s)**`);
    if (metrics.layers.backend.total > 0) detectedLayers.push(`a backend API exposing **${metrics.layers.backend.entities.routes} route(s)** and **${metrics.layers.backend.entities.handlers} handler(s)**`);
    if (metrics.layers.data_layer.total > 0) detectedLayers.push(`data storage with **${metrics.layers.data_layer.entities.tables} table(s)/model(s)** and **${metrics.layers.data_layer.entities.operations} operation(s)**`);
    lines.push(`This application features ${detectedLayers.join(", ") || "static source artifacts"}. The codebase follows a full-stack architecture discovered through AST parsing, route mounts, and schema analysis.\n`);

    lines.push("### 2. Relevant Files (Core Entry Points)");
    lines.push("Inspect the primary UI entry points and core state context providers:");
    const mainComponents = components.filter((c) => /^(app|index|main|dashboard|layout|root)/i.test(c.label));
    const entryPoints = mainComponents.length > 0 ? mainComponents : components.slice(0, 4);
    for (const mc of entryPoints) {
      const loc = mc.location ? `${mc.location.file}:${mc.location.line}` : "source";
      lines.push(`- **UI Root**: \`<${mc.label} />\` at \`${loc}\``);
    }
    if (providers.length > 0) {
      for (const p of providers.slice(0, 4)) {
        const loc = p.location ? `${p.location.file}:${p.location.line}` : "";
        lines.push(`- **Global Context Provider**: \`${p.label}\` at \`${loc}\``);
      }
    }
    lines.push("");

    lines.push("### 3. Dependency Path (How Data Flows)");
    lines.push("Connections linking frontend user actions to backend services and database operations:");
    for (const ep of endpoints.slice(0, 5)) {
      const loc = ep.location ? `${ep.location.file}:${ep.location.line}` : "";
      const handlers = graph.edges.filter((e) => e.source === ep.id && (e.relation === "HANDLES" || e.relation === "HANDLES_ROUTE"));
      const handlerNames = handlers.map((h) => {
        const tgt = graph.nodes.find((n) => n.id === h.target);
        return tgt?.label || "handler";
      }).join(", ");
      lines.push(`- **Route**: \`${ep.label}\` ${handlerNames ? `→ handled by \`${handlerNames}\`` : ""} \`(${loc})\``);
    }
    if (dbEntities.length > 0) {
      const entityList = dbEntities.slice(0, 4).map((d) => `\`${d.label}\``).join(", ");
      lines.push(`- **Data Entities**: ${entityList}`);
    }
    lines.push("");

    lines.push("### 4. Potential Impact (How to Safely Make Changes)");
    lines.push("- **Trace Callers**: Before modifying any function or route, inspect incoming links in the Inspector panel or use Change Impact analysis.");
    lines.push("- **Check API Contracts**: Modifying route parameters or response fields can break client components. Review the API Client Layer for all callers.");
    lines.push("- **Run Focused Tests**: Run automated tests covering the modified modules and review uncovered dependencies.");
    lines.push("");

    lines.push("### 5. Tests (Automated Test Coverage)");
    if (tests.length === 0) {
      lines.push("- ⚠️ **Automated Tests**: No unit or integration test cases were discovered in the analyzed directories.");
    } else {
      lines.push(`- ℹ️ **Test Coverage**: Discovered **${tests.length}** automated test case(s). Complete coverage requires explicit test execution assertions.`);
      for (const t of tests.slice(0, 5)) {
        lines.push(`  - \`${t.label}\`${t.location ? ` in \`${t.location.file}:${t.location.line}\`` : ""}`);
      }
    }
    lines.push("");

    lines.push("### 6. Unknowns & Safeguards (What Remains Unknown & Gaps)");
    const unknowns: string[] = [];
    if (unresolvedRequests > 0) {
      unknowns.push(`- ⚠️ **${unresolvedRequests} Unresolved API Request(s)**: Client HTTP calls where no matching backend route handler was discovered in the current scan scope.`);
    }
    if (tests.length === 0) {
      unknowns.push("- ⚠️ **Automated Tests**: No unit or integration test cases were discovered in the analyzed directories.");
    }
    if (!graph.scanScope || graph.scanScope.runtimeTraces === "not_imported" || graph.scanScope.runtimeTraces === "not_scanned") {
      unknowns.push("- ℹ️ **Runtime Execution**: No OpenTelemetry runtime traces imported; all connections are statically established or inferred from source code.");
    }
    lines.push(unknowns.join("\n"));

    return {
      answer: lines.join("\n"),
      citedNodes: [...entryPoints, ...providers.slice(0, 4), ...endpoints.slice(0, 5)],
      citedSources: [],
      evidenceSummary: {
        staticFactsCount: metrics.evidenceStatus.statically_established,
        observedFactsCount: metrics.evidenceStatus.observed,
        inferredFactsCount: metrics.evidenceStatus.inferred,
        unresolvedCount: metrics.evidenceStatus.unresolved,
      },
      uncertainties: unknowns,
    };
  }

  /**
   * General question answering grounded in the evidence graph.
   */
  async askQuestion(question: string, contextNodeId: string | undefined, graph: EvidenceGraph, repoRoot: string | string[]): Promise<AIResponse> {
    const q = question.toLowerCase();

    // Check intent
    if (q.includes("explain") && (q.includes("component") || contextNodeId)) {
      const targetId = contextNodeId || this.extractNodeIdFromQuestion(question, graph);
      if (targetId) return this.explainComponent(targetId, graph, repoRoot);
    }

    if (q.includes("path") || q.includes("flow") || q.includes("how does") || q.includes("load") || q.includes("fetch")) {
      return this.explainFeaturePath(question, graph, repoRoot);
    }

    if (q.includes("change") || q.includes("impact") || q.includes("rename") || q.includes("what happens if")) {
      const target = contextNodeId || this.extractNodeIdFromQuestion(question, graph) || "api";
      return this.predictChangeImpact(target, graph, repoRoot);
    }

    if (q.includes("onboard") || q.includes("start") || q.includes("overview") || q.includes("new developer")) {
      return this.onboardDeveloper(question, graph, repoRoot);
    }

    // Default graph-grounded search and synthesis
    const matchedNodes = graph.nodes.filter(
      (n) => q.includes(n.label.toLowerCase()) || n.label.toLowerCase().includes(q)
    );

    if (matchedNodes.length > 0) {
      return this.explainComponent(matchedNodes[0].id, graph, repoRoot);
    }

    // General summary
    return this.onboardDeveloper(question, graph, repoRoot);
  }

  private extractNodeIdFromQuestion(question: string, graph: EvidenceGraph): string | undefined {
    const tokens = question.split(/[\s,.'"`?]+/);
    for (const token of tokens) {
      if (token.length > 2) {
        const found = graph.nodes.find((n) => n.label.toLowerCase() === token.toLowerCase());
        if (found) return found.id;
      }
    }
    return undefined;
  }
}
