import type { EvidenceGraph, GraphEdge, GraphNode } from "./model.js";
import { displayEndpoint } from "./model.js";

export function endpointTrace(graph: EvidenceGraph, selector: string): string {
  const normalized = selector.trim().replace(/\s+/g, " ").toUpperCase();
  const endpoint = graph.nodes.find((node) => node.kind === "api_route" && (node.label.toUpperCase() === normalized || node.id.toUpperCase() === `ENDPOINT:${normalized}`));
  if (!endpoint) return `No endpoint found for ${selector}. Run \`repopath scan\` first, then use the exact METHOD /path shown in the report.`;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.filter((edge) => edge.source === endpoint.id || edge.target === endpoint.id);
  const lines = [`${endpoint.label}`, ""];
  for (const edge of edges) {
    const other = nodeById.get(edge.source === endpoint.id ? edge.target : edge.source);
    const direction = edge.source === endpoint.id ? "→" : "←";
    lines.push(`${direction} ${edge.relation} ${other?.label ?? "unknown"} — ${edge.evidence.status}; ${edge.evidence.location.file}:${edge.evidence.location.line} (${edge.evidence.detail})`);
  }
  return lines.join("\n");
}

export function htmlReport(graph: EvidenceGraph): string {
  const endpoints = graph.nodes.filter((node) => node.kind === "api_route");
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rows = endpoints.map((endpoint) => endpointCard(endpoint, graph.edges, nodeById)).join("\n");
  const evidence = graph.edges.reduce((counts, edge) => ({ ...counts, [edge.evidence.status]: (counts[edge.evidence.status] ?? 0) + 1 }), {} as Record<string, number>);
  const components = graph.nodes.filter((node) => node.attributes?.isReactComponent);
  const calls = graph.edges.filter((edge) => ["CALLS", "RENDERS", "PASSES_CALLBACK", "PROVIDES_CONTEXT", "CONSUMES_CONTEXT"].includes(edge.relation));
  const unresolved = graph.edges.filter((edge) => edge.evidence.status === "unresolved");

  // Separate API, parameter, and test metrics
  const apiRequests = graph.nodes.filter((node) => node.kind === "api_request");
  const unresolvedRequests = apiRequests.filter((node) => node.attributes?.pathResolution === "unresolved");
  const apiFields = graph.nodes.filter((node) => node.kind === "api_field");
  const queryParams = graph.nodes.filter((node) => node.kind === "query_parameter");
  const testNodes = graph.nodes.filter((node) => node.kind === "test");
  const testEdges = graph.edges.filter((edge) => edge.relation === "EXERCISES");
  const canonicalCount = graph.edges.length;

  // Build outgoing client requests HTML
  const requestCards = apiRequests.map((req) => {
    const isUnresolved = req.attributes?.pathResolution === "unresolved";
    const method = String(req.attributes?.httpMethod ?? "API");
    const targetUrl = String(req.attributes?.rawPath ?? req.label);
    const callerEdge = graph.edges.find((e) => e.target === req.id && (e.relation === "CALLS" || e.relation === "REQUESTS"));
    const callerNode = callerEdge ? nodeById.get(callerEdge.source) : undefined;
    const callerLabel = callerNode?.label ?? "Component";
    const loc = req.location ? `${escape(req.location.file)}:${req.location.line}` : (callerEdge ? `${escape(callerEdge.evidence.location.file)}:${callerEdge.evidence.location.line}` : "unknown");
    const search = `request ${method} ${targetUrl} ${callerLabel} ${isUnresolved ? "unresolved" : "resolved"} ${loc}`.toLowerCase();
    
    return `<article class="card route-card" data-section="requests" data-search="${escape(search)}" data-observed="false">
      <div class="card-header">
        <div class="card-title-group">
          <span class="method-badge method-${method.toLowerCase()}">${escape(method)}</span>
          <span class="endpoint-path font-mono">${escape(targetUrl)}</span>
          ${isUnresolved ? `<span class="badge badge-warning">Unresolved URL</span>` : `<span class="badge badge-success">Mapped</span>`}
        </div>
        <button class="btn-icon copy-btn" data-copy="${escape(targetUrl)}" title="Copy URL">📋</button>
      </div>
      <div class="card-body">
        <div class="detail-row"><span class="detail-label">Origin Caller:</span> <code class="code-pill">${escape(callerLabel)}</code></div>
        <div class="detail-row"><span class="detail-label">Source Location:</span> <span class="file-link font-mono">${loc}</span></div>
        ${isUnresolved ? `<div class="unresolved-callout">⚠️ URL cannot be statically determined or base URL configuration is missing. Check dynamic template strings.</div>` : ""}
      </div>
    </article>`;
  }).join("\n");

  // Query parameters section
  const paramEdges = graph.edges.filter((edge) => edge.relation === "SENDS_PARAMETER");
  const paramRows = paramEdges.map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `parameter ${target} ${source} ${edge.evidence.status} ${edge.evidence.location.file}`.toLowerCase();
    return `<tr data-section="params" data-search="${escape(search)}" data-observed="${isObserved}">
      <td><code class="code-pill param-pill">${escape(target)}</code></td>
      <td><span class="entity-name">${escape(source)}</span></td>
      <td><span class="status-pill status-${escape(edge.evidence.status)}">${escape(edge.evidence.status)}</span></td>
      <td><span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span></td>
    </tr>`;
  }).join("");

  // Response fields section (READS_FIELD / DECLARES_FIELD)
  const fieldEdges = graph.edges.filter((edge) => ["READS_FIELD", "DECLARES_FIELD"].includes(edge.relation));
  const fieldRows = fieldEdges.map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `field ${target} ${edge.relation} ${source} ${edge.evidence.status} ${edge.evidence.location.file}`.toLowerCase();
    return `<tr data-section="fields" data-search="${escape(search)}" data-observed="${isObserved}">
      <td><code class="code-pill field-pill">${escape(target)}</code></td>
      <td><span class="badge badge-purple">${escape(edge.relation)}</span></td>
      <td><span class="entity-name">${escape(source)}</span></td>
      <td><span class="status-pill status-${escape(edge.evidence.status)}">${escape(edge.evidence.status)}</span></td>
      <td><span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span></td>
    </tr>`;
  }).join("");

  // Tests section
  const testRows = testEdges.map((edge) => {
    const test = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `test ${test} ${target} ${edge.evidence.location.file}`.toLowerCase();
    return `<tr data-section="tests" data-search="${escape(search)}" data-observed="${isObserved}">
      <td><span class="test-title">🧪 ${escape(test)}</span></td>
      <td><code class="code-pill target-pill">${escape(target)}</code></td>
      <td><span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span></td>
      <td class="text-secondary">${escape(edge.evidence.detail)}</td>
    </tr>`;
  }).join("");

  // Components & calls list
  const callListItems = calls.map((edge) => {
    const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
    const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `component ${edge.relation} ${sourceLabel} ${targetLabel} ${edge.evidence.location.file} ${edge.evidence.detail}`.toLowerCase();
    const relationBadge = edge.relation === "RENDERS" ? "badge-renders" : edge.relation.includes("CONTEXT") ? "badge-context" : "badge-call";
    return `<li class="flow-item" data-section="components" data-search="${escape(search)}" data-observed="${isObserved}">
      <span class="badge ${relationBadge}">${escape(edge.relation)}</span>
      <span class="flow-source">${escape(sourceLabel)}</span>
      <span class="flow-arrow">→</span>
      <span class="flow-target">${escape(targetLabel)}</span>
      <span class="flow-meta font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span>
      <span class="flow-detail">${escape(edge.evidence.detail)}</span>
    </li>`;
  }).join("");

  // Unresolved list
  const unresolvedListItems = unresolved.map((edge) => {
    const isObserved = edge.evidence.status === "observed";
    const search = `unresolved ${edge.relation} ${edge.evidence.detail} ${edge.evidence.location.file}`.toLowerCase();
    return `<li class="unresolved-item" data-section="unresolved" data-search="${escape(search)}" data-observed="${isObserved}">
      <span class="badge badge-warning">${escape(edge.relation)}</span>
      <span class="unresolved-text">${escape(edge.evidence.detail)}</span>
      <span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span>
    </li>`;
  }).join("");

  // Complete relationship table rows
  const relationshipRows = graph.edges.map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `${edge.relation} ${source} ${target} ${edge.evidence.status} ${edge.evidence.location.file} ${edge.evidence.detail}`.toLowerCase();
    return `<tr data-section="evidence" data-search="${escape(search)}" data-observed="${isObserved}">
      <td><span class="badge badge-relation">${escape(edge.relation)}</span></td>
      <td><span class="entity-name">${escape(source)}</span></td>
      <td><span class="entity-name">${escape(target)}</span></td>
      <td><span class="status-pill status-${escape(edge.evidence.status)}">${escape(edge.evidence.status)}</span></td>
      <td><span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span></td>
    </tr>`;
  }).join("");

  const observedState = evidence.observed ? `${evidence.observed} observed relationships` : "No runtime evidence imported for this scan.";

  // Scope metadata table
  const scope = graph.scanScope;
  const scopeRows = scope ? Object.entries(scope).map(([key, value]) => {
    const isComplete = value === "complete";
    const badgeClass = isComplete ? "badge-success" : value === "partial" ? "badge-warning" : "badge-dim";
    return `<tr data-search="${escape(key)} ${escape(value)}" data-observed="false">
      <td><strong>${escape(key)}</strong></td>
      <td><span class="badge ${badgeClass}">${escape(value)}</span></td>
    </tr>`;
  }).join("") : "";

  const scopeHtml = scope ? `
  <section class="scope-grid">
    <div class="panel">
      <div class="panel-header">
        <h3>Analysis coverage by layer</h3>
        <p class="panel-desc">Identifies whether each application layer was within the analyzed scope.</p>
      </div>
      <table class="data-table">
        <thead><tr><th>Layer</th><th>Coverage</th></tr></thead>
        <tbody>${scopeRows}</tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-header">
        <h3>Analyzed scope findings</h3>
        <p class="panel-desc">Verified and inferred risk signals within the completed analysis scope.</p>
      </div>
      <ul class="findings-list">
        <li><span class="finding-icon ${unresolvedRequests.length ? 'icon-warning' : 'icon-check'}">${unresolvedRequests.length ? '⚠️' : '✓'}</span> <strong>${unresolvedRequests.length}</strong> unresolved client request URL(s)</li>
        <li><span class="finding-icon icon-check">✓</span> <strong>${endpoints.length}</strong> server routes mapped</li>
        <li><span class="finding-icon ${testNodes.length ? 'icon-check' : 'icon-neutral'}">${testNodes.length ? '🧪' : '○'}</span> <strong>${testNodes.length}</strong> test cases discovered (${testEdges.length} execution mappings)</li>
        <li><span class="finding-icon ${evidence.stale ? 'icon-warning' : 'icon-check'}">${evidence.stale ? '⚠️' : '✓'}</span> <strong>${evidence.stale ?? 0}</strong> stale evidence entries</li>
      </ul>
    </div>
  </section>` : "";

  // Scan metadata header tags
  const scanMeta = graph.scan ? `
    <div class="meta-chips">
      <span class="chip" title="Unique scan execution ID">ID: <code class="font-mono">${escape(graph.scan.id)}</code> <button class="btn-chip-copy" data-copy="${escape(graph.scan.id)}">📋</button></span>
      <span class="chip">Tool: <code class="font-mono">v${escape(graph.scan.toolVersion)}</code></span>
      <span class="chip">Working tree: <code class="font-mono ${graph.scan.workingTree === 'clean' ? 'text-green' : 'text-amber'}">${escape(graph.scan.workingTree)}</code></span>
      <span class="chip">Config: <code class="font-mono">${escape(graph.scan.configHash ?? 'default')}</code></span>
    </div>` : "";

  const revisionNote = graph.revision ? `Commit: <code>${escape(graph.revision.slice(0, 12))}</code>.` : "No source revision recorded.";

  // Safe serialized embedded graph for export
  const safeGraphJson = JSON.stringify(graph).replace(/<\/script/gi, '<\\/script');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RepoPath — Full-Stack Evidence Report</title>
  <style>
    :root {
      --bg-base: #07090e;
      --bg-surface: #0f1523;
      --bg-elevated: #151e32;
      --bg-hover: #1c2742;
      --border-subtle: #1c263c;
      --border-accent: #2e3d5f;
      --border-bright: #38bdf8;
      
      --text-bright: #f8fafc;
      --text-main: #e2e8f0;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      
      --accent-blue: #38bdf8;
      --accent-blue-bg: rgba(56, 189, 248, 0.12);
      --accent-green: #10b981;
      --accent-green-bg: rgba(16, 185, 129, 0.12);
      --accent-amber: #f59e0b;
      --accent-amber-bg: rgba(245, 158, 11, 0.12);
      --accent-rose: #f43f5e;
      --accent-rose-bg: rgba(244, 63, 94, 0.12);
      --accent-purple: #a855f7;
      --accent-purple-bg: rgba(168, 85, 247, 0.12);
      --accent-indigo: #6366f1;
      
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Consolas, "Liberation Mono", monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      background: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font-sans);
      font-size: 15px;
      line-height: 1.6;
      padding: 0 0 4rem;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    
    /* Layout Container */
    .container {
      max-width: 1440px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }
    
    /* Top Header Bar */
    header.top-header {
      background: linear-gradient(180deg, #101627 0%, var(--bg-base) 100%);
      border-bottom: 1px solid var(--border-subtle);
      padding: 2.2rem 0 1.8rem;
      margin-bottom: 2rem;
    }
    .header-inner {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 1.25rem;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      background: linear-gradient(135deg, #38bdf8 0%, #6366f1 100%);
      border-radius: 12px;
      font-size: 22px;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.35);
    }
    .brand-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-bright);
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .brand-subtitle {
      font-size: 0.88rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
    }
    .header-actions {
      display: flex;
      gap: 0.65rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .repo-banner {
      font-size: 0.9rem;
      color: var(--text-muted);
      background: rgba(15, 21, 35, 0.7);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.75rem 1.15rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .meta-chips {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .chip {
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      padding: 0.2rem 0.65rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-chip-copy {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.8rem;
      padding: 0;
      line-height: 1;
    }
    .btn-chip-copy:hover { color: var(--accent-blue); }
    
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.55rem 1rem;
      border-radius: var(--radius-sm);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
      border: 1px solid transparent;
      text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--bg-elevated);
      color: var(--text-main);
      border-color: var(--border-subtle);
    }
    .btn-secondary:hover {
      background: var(--bg-hover);
      border-color: var(--border-accent);
      color: var(--text-bright);
    }
    .btn-icon {
      background: none;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      cursor: pointer;
      padding: 0.35rem 0.55rem;
      font-size: 0.9rem;
      transition: all 0.15s ease;
    }
    .btn-icon:hover {
      color: var(--accent-blue);
      background: var(--bg-hover);
      border-color: var(--border-subtle);
    }
    
    /* Stats Grid */
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1.15rem 1.25rem;
      transition: all 0.2s ease;
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }
    .stat:hover {
      border-color: var(--border-bright);
      background: var(--bg-elevated);
      transform: translateY(-2px);
      box-shadow: var(--shadow-card);
    }
    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text-bright);
      line-height: 1.1;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: baseline;
      gap: 0.35rem;
    }
    .stat-label {
      font-size: 0.82rem;
      color: var(--text-muted);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .stat-sub {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
    }
    .stat.highlight-warning {
      border-color: rgba(245, 158, 11, 0.4);
      background: rgba(245, 158, 11, 0.05);
    }
    .stat.highlight-warning .stat-value { color: var(--accent-amber); }
    
    .observed-state {
      font-size: 0.85rem;
      color: var(--text-dim);
      margin-top: -1rem;
      margin-bottom: 1.5rem;
      padding: 0.5rem 0.85rem;
      background: rgba(15, 21, 35, 0.4);
      border-radius: var(--radius-sm);
      display: inline-block;
    }
    
    /* Scope Grid */
    .scope-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2.25rem;
    }
    @media (max-width: 900px) {
      .scope-grid { grid-template-columns: 1fr; }
    }
    .panel {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 1.4rem 1.6rem;
      box-shadow: var(--shadow-card);
    }
    .panel-header { margin-bottom: 1rem; }
    .panel-header h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 0.25rem;
    }
    .panel-desc {
      font-size: 0.84rem;
      color: var(--text-muted);
    }
    .findings-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }
    .findings-list li {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.92rem;
      color: var(--text-main);
      padding: 0.5rem 0.75rem;
      background: var(--bg-elevated);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-subtle);
    }
    .finding-icon {
      font-size: 0.95rem;
      line-height: 1;
    }
    
    /* Controls Bar & Tabs */
    .controls-wrapper {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(7, 9, 14, 0.85);
      backdrop-filter: blur(16px);
      padding: 0.85rem 0;
      margin-bottom: 1.75rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .controls {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
      justify-content: space-between;
    }
    .search-box-wrap {
      position: relative;
      flex: 1;
      min-width: 280px;
      max-width: 520px;
    }
    .search-icon {
      position: absolute;
      left: 1rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-dim);
      pointer-events: none;
    }
    input[type="search"] {
      width: 100%;
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 0.65rem 1rem 0.65rem 2.6rem;
      font: inherit;
      font-size: 0.92rem;
      color: var(--text-bright);
      outline: none;
      transition: all 0.15s ease;
    }
    input[type="search"]:focus {
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
      background: var(--bg-surface);
    }
    .tab-bar {
      display: flex;
      gap: 0.4rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .tab-btn {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      padding: 0.4rem 0.85rem;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .tab-btn:hover {
      color: var(--text-bright);
      border-color: var(--border-accent);
      background: var(--bg-elevated);
    }
    .tab-btn.active {
      background: var(--accent-blue-bg);
      border-color: var(--accent-blue);
      color: var(--accent-blue);
      font-weight: 600;
    }
    .tab-count {
      background: rgba(255, 255, 255, 0.08);
      padding: 0.1rem 0.45rem;
      border-radius: 10px;
      font-size: 0.75rem;
    }
    .filter-toggles {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .checkbox-label {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      cursor: pointer;
      user-select: none;
    }
    .match-counter {
      font-size: 0.82rem;
      color: var(--text-dim);
    }
    
    /* Section Headers */
    section {
      margin: 2.5rem 0;
    }
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 0.75rem;
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--text-bright);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .section-meta {
      font-size: 0.85rem;
      color: var(--text-dim);
    }
    
    /* Route Cards Grid */
    .routes-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow: hidden;
      transition: all 0.2s ease;
      box-shadow: var(--shadow-card);
    }
    .card:hover {
      border-color: var(--border-accent);
      transform: translateY(-1px);
    }
    .card-header {
      padding: 0.85rem 1.25rem;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .endpoint-path {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-bright);
    }
    .card-body {
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .handlers-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .handler-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.88rem;
      flex-wrap: wrap;
    }
    .detail-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.88rem;
    }
    .detail-label {
      color: var(--text-dim);
      font-size: 0.82rem;
      min-width: 120px;
    }
    .unresolved-callout {
      margin-top: 0.5rem;
      background: var(--accent-amber-bg);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--radius-sm);
      padding: 0.6rem 0.85rem;
      font-size: 0.82rem;
      color: #fbbf24;
    }
    
    /* Flow List */
    .flow-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .flow-item {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.88rem;
      flex-wrap: wrap;
    }
    .flow-item:hover {
      background: var(--bg-elevated);
      border-color: var(--border-accent);
    }
    .flow-source, .flow-target {
      font-weight: 600;
      color: var(--text-bright);
    }
    .flow-arrow {
      color: var(--accent-blue);
      font-weight: bold;
    }
    .flow-meta {
      font-size: 0.8rem;
      margin-left: auto;
    }
    .flow-detail {
      font-size: 0.82rem;
      color: var(--text-dim);
      width: 100%;
      padding-top: 0.25rem;
      border-top: 1px dashed var(--border-subtle);
    }
    
    /* Unresolved items */
    .unresolved-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }
    .unresolved-item {
      background: rgba(245, 158, 11, 0.05);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: var(--radius-sm);
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.88rem;
      flex-wrap: wrap;
    }
    .unresolved-text {
      color: #fde68a;
      flex: 1;
    }
    
    /* Data Tables */
    .table-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      overflow-x: auto;
      box-shadow: var(--shadow-card);
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;
    }
    .data-table th {
      background: var(--bg-elevated);
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      padding: 0.85rem 1.15rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .data-table td {
      padding: 0.85rem 1.15rem;
      border-bottom: 1px solid var(--border-subtle);
      color: var(--text-main);
    }
    .data-table tbody tr {
      transition: background 0.15s ease;
    }
    .data-table tbody tr:hover {
      background: var(--bg-hover);
    }
    .data-table tbody tr:last-child td {
      border-bottom: none;
    }
    
    /* Pills, Badges & Tags */
    .code-pill {
      background: var(--bg-elevated);
      color: var(--accent-blue);
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.84rem;
      border: 1px solid var(--border-subtle);
    }
    .param-pill { color: #f59e0b; }
    .field-pill { color: #a855f7; }
    .target-pill { color: #38bdf8; }
    
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.76rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }
    .badge-success { background: var(--accent-green-bg); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-warning { background: var(--accent-amber-bg); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .badge-dim { background: rgba(148, 163, 184, 0.1); color: var(--text-muted); border: 1px solid var(--border-subtle); }
    .badge-purple { background: var(--accent-purple-bg); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .badge-relation { background: rgba(99, 102, 241, 0.12); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); font-family: var(--font-mono); }
    .badge-renders { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .badge-context { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }
    .badge-call { background: var(--accent-blue-bg); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    
    /* HTTP Method Badges */
    .method-badge {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      letter-spacing: 0.04em;
    }
    .method-get { background: var(--accent-green-bg); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .method-post { background: var(--accent-blue-bg); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
    .method-put, .method-patch { background: var(--accent-amber-bg); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
    .method-delete { background: var(--accent-rose-bg); color: #f87171; border: 1px solid rgba(244, 63, 94, 0.3); }
    .method-all { background: var(--accent-purple-bg); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    
    .status-pill {
      font-size: 0.78rem;
      padding: 0.15rem 0.5rem;
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
    }
    .status-statically_established { color: #34d399; border-color: rgba(16, 185, 129, 0.3); }
    .status-inferred { color: #38bdf8; border-color: rgba(56, 189, 248, 0.3); }
    .status-unresolved { color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); }
    .status-observed { color: #a855f7; border-color: rgba(168, 85, 247, 0.3); }
    .status-stale { color: #f87171; border-color: rgba(244, 63, 94, 0.3); }
    
    .font-mono { font-family: var(--font-mono); }
    .text-bright { color: var(--text-bright); }
    .text-muted { color: var(--text-muted); }
    .text-dim { color: var(--text-dim); }
    .text-green { color: var(--accent-green); }
    .text-amber { color: var(--accent-amber); }
    .text-blue { color: var(--accent-blue); }
    .entity-name { font-weight: 500; color: var(--text-bright); }
    .test-title { font-weight: 500; color: var(--text-bright); }
    
    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: var(--bg-elevated);
      color: var(--text-bright);
      border: 1px solid var(--accent-blue);
      border-radius: var(--radius-md);
      padding: 0.75rem 1.25rem;
      font-size: 0.88rem;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }
    
    /* Print Styles */
    @media print {
      body { background: white; color: black; }
      .controls-wrapper, .header-actions, .btn-icon, .btn-chip-copy { display: none !important; }
      .card, .panel, .table-container { border: 1px solid #ccc; box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="top-header">
    <div class="container header-inner">
      <div class="header-top">
        <div class="brand-group">
          <div class="logo-badge">⚡</div>
          <div>
            <h1 class="brand-title">RepoPath evidence report</h1>
            <div class="brand-subtitle">Full-stack deterministic architecture graph & change-impact telemetry</div>
          </div>
        </div>
        <div class="header-actions">
          <button id="btn-copy-summary" class="btn btn-secondary" title="Copy scan summary to clipboard">📋 Copy Summary</button>
          <button id="btn-expand-all" class="btn btn-secondary">▼ Expand All</button>
          <button id="btn-collapse-all" class="btn btn-secondary">▲ Collapse All</button>
          <button id="btn-export-json" class="btn btn-secondary">📥 Export JSON</button>
          <button onclick="window.print()" class="btn btn-primary">🖨️ Print</button>
        </div>
      </div>
      
      <div class="repo-banner">
        <div>
          Scanned <strong>${escape(graph.repository)}</strong> at <span class="font-mono">${escape(graph.scannedAt)}</span>. ${revisionNote} Static, observed, and stale evidence remain distinct.
        </div>
        ${scanMeta}
      </div>
    </div>
  </header>

  <main class="container">
    <!-- Executive KPI Metric Cards -->
    <section class="stats">
      <div class="stat" data-tab="routes">
        <div class="stat-value text-green">${endpoints.length}</div>
        <div class="stat-label">backend routes found</div>
        <div class="stat-sub">Express / REST endpoints</div>
      </div>
      
      <div class="stat" data-tab="requests">
        <div class="stat-value text-blue">${apiRequests.length}</div>
        <div class="stat-label">outgoing API requests</div>
        <div class="stat-sub">Client fetch / axios calls</div>
      </div>
      
      <div class="stat ${unresolvedRequests.length ? 'highlight-warning' : ''}" data-tab="unresolved">
        <div class="stat-value ${unresolvedRequests.length ? 'text-amber' : ''}">${unresolvedRequests.length}</div>
        <div class="stat-label">unresolved request URLs</div>
        <div class="stat-sub">${unresolvedRequests.length ? 'Needs base-URL contract' : 'Fully resolved'}</div>
      </div>
      
      <div class="stat" data-tab="params">
        <div class="stat-value text-amber">${queryParams.length}</div>
        <div class="stat-label">request parameters</div>
        <div class="stat-sub">Query / payload inputs</div>
      </div>
      
      <div class="stat" data-tab="fields">
        <div class="stat-value text-purple">${apiFields.length}</div>
        <div class="stat-label">response fields</div>
        <div class="stat-sub">Extracted schema contracts</div>
      </div>
      
      <div class="stat" data-tab="tests">
        <div class="stat-value text-bright">${testNodes.length}</div>
        <div class="stat-label">discovered tests</div>
        <div class="stat-sub">${testEdges.length} execution mappings</div>
      </div>
      
      <div class="stat" data-tab="components">
        <div class="stat-value text-bright">${components.length}</div>
        <div class="stat-label">React components</div>
        <div class="stat-sub">UI hierarchy nodes</div>
      </div>
      
      <div class="stat" data-tab="evidence">
        <div class="stat-value text-bright">${graph.nodes.length}</div>
        <div class="stat-label">nodes</div>
        <div class="stat-sub">Graph entities</div>
      </div>
      
      <div class="stat" data-tab="evidence">
        <div class="stat-value text-blue">${graph.edges.length}</div>
        <div class="stat-label">relationships</div>
        <div class="stat-sub">(${canonicalCount} canonical facts)</div>
      </div>
      
      <div class="stat" data-tab="evidence">
        <div class="stat-value text-green">${evidence.observed ?? 0}</div>
        <div class="stat-label">observed</div>
        <div class="stat-sub">${evidence.stale ?? 0} stale</div>
      </div>
    </section>

    <p class="observed-state">${escape(observedState)}</p>

    <!-- Interactive Sticky Search & Tabs Toolbar -->
    <div class="controls-wrapper">
      <div class="controls">
        <div class="search-box-wrap">
          <span class="search-icon">🔍</span>
          <input id="filter" type="search" placeholder="Filter endpoint, component, function, or evidence (Press / to focus)">
        </div>
        
        <div class="tab-bar">
          <button class="tab-btn active" data-tab="all">All</button>
          <button class="tab-btn" data-tab="routes">Routes <span class="tab-count">${endpoints.length}</span></button>
          <button class="tab-btn" data-tab="requests">Requests <span class="tab-count">${apiRequests.length}</span></button>
          <button class="tab-btn" data-tab="params">Params <span class="tab-count">${queryParams.length}</span></button>
          <button class="tab-btn" data-tab="fields">Fields <span class="tab-count">${apiFields.length}</span></button>
          <button class="tab-btn" data-tab="components">Components <span class="tab-count">${components.length}</span></button>
          <button class="tab-btn" data-tab="tests">Tests <span class="tab-count">${testNodes.length}</span></button>
          <button class="tab-btn" data-tab="unresolved">Unresolved <span class="tab-count">${unresolved.length + unresolvedRequests.length}</span></button>
          <button class="tab-btn" data-tab="evidence">Evidence <span class="tab-count">${graph.edges.length}</span></button>
        </div>
        
        <div class="filter-toggles">
          <label class="checkbox-label">
            <input id="observed" type="checkbox"> observed only
          </label>
          <span id="match-counter" class="match-counter">Showing all</span>
        </div>
      </div>
    </div>

    <!-- Analysis Scope & Findings Section -->
    ${scopeHtml}

    <!-- 1. API Dependencies (Routes) -->
    <section class="report-section" data-tab-content="routes">
      <div class="section-header">
        <h2><span>🌐</span> API dependencies</h2>
        <span class="section-meta">${endpoints.length} server routes mapped</span>
      </div>
      <main class="routes-grid">
        ${rows || "<p class='text-muted'>No backend routes were found in the scanned source.</p>"}
      </main>
    </section>

    <!-- 2. Client Requests -->
    ${apiRequests.length ? `
    <section class="report-section" data-tab-content="requests">
      <div class="section-header">
        <h2><span>⚡</span> Outgoing client API requests</h2>
        <span class="section-meta">${apiRequests.length} client requests extracted (${unresolvedRequests.length} unresolved)</span>
      </div>
      <div class="routes-grid">
        ${requestCards}
      </div>
    </section>` : ""}

    <!-- 3. Request Parameters -->
    ${paramEdges.length ? `
    <section class="report-section" data-tab-content="params">
      <div class="section-header">
        <h2><span>📥</span> Request parameters (${queryParams.length} parameters)</h2>
        <span class="section-meta">${paramEdges.length} parameter bindings</span>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Caller / Component</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${paramRows}
          </tbody>
        </table>
      </div>
    </section>` : ""}

    <!-- 4. Response Fields -->
    ${fieldEdges.length ? `
    <section class="report-section" data-tab-content="fields">
      <div class="section-header">
        <h2><span>📤</span> API response fields (${apiFields.length} fields)</h2>
        <span class="section-meta">${fieldEdges.length} field references (canonical READS_FIELD)</span>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Relation</th>
              <th>Component / Origin</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${fieldRows}
          </tbody>
        </table>
      </div>
    </section>` : ""}

    <!-- 5. Discovered Tests -->
    ${testNodes.length ? `
    <section class="report-section" data-tab-content="tests">
      <div class="section-header">
        <h2><span>🧪</span> Discovered tests & coverage (${testNodes.length} tests)</h2>
        <span class="section-meta">${testEdges.length} test-to-target execution mappings</span>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Test Case</th>
              <th>Target Exercised</th>
              <th>Location</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            ${testRows || "<tr><td colspan='4' class='text-muted'>Tests discovered with static imports.</td></tr>"}
          </tbody>
        </table>
      </div>
    </section>` : ""}

    <!-- 6. Components & Call Paths -->
    <section class="report-section" data-tab-content="components">
      <div class="section-header">
        <h2><span>⚛️</span> Component and call paths</h2>
        <span class="section-meta">${calls.length} cross-component execution relationships</span>
      </div>
      ${callListItems ? `<ul class="flow-list">${callListItems}</ul>` : "<p class='text-muted'>No component or call relationships were found.</p>"}
    </section>

    <!-- 7. Unresolved Relationships -->
    <section class="report-section" data-tab-content="unresolved">
      <div class="section-header">
        <h2><span>⚠️</span> Unresolved relationships</h2>
        <span class="section-meta">${unresolved.length} unresolved static references</span>
      </div>
      ${unresolvedListItems ? `<ul class="unresolved-list">${unresolvedListItems}</ul>` : "<p class='text-muted'>None.</p>"}
    </section>

    <!-- 8. Evidence Detail Table -->
    <section class="report-section" data-tab-content="evidence">
      <div class="section-header">
        <h2><span>📋</span> Evidence detail</h2>
        <span class="section-meta">${graph.edges.length} canonical relationships with provenance</span>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Relation</th>
              <th>Source</th>
              <th>Target</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            ${relationshipRows || "<tr><td colspan='5' class='text-muted'>No relationships found.</td></tr>"}
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <div id="toast" class="toast">
    <span id="toast-icon">✓</span>
    <span id="toast-msg">Copied to clipboard</span>
  </div>

  <script id="repopath-raw-data" type="application/json">${safeGraphJson}</script>
  <script>
    (function() {
      const filter = document.querySelector('#filter');
      const observed = document.querySelector('#observed');
      const matchCounter = document.querySelector('#match-counter');
      const tabButtons = document.querySelectorAll('.tab-btn');
      const statCards = document.querySelectorAll('.stat[data-tab]');
      const reportSections = document.querySelectorAll('.report-section');
      const toast = document.querySelector('#toast');
      const toastMsg = document.querySelector('#toast-msg');
      let activeTab = 'all';

      function showToast(msg) {
        if (!toast) return;
        toastMsg.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2200);
      }

      function apply() {
        const q = filter.value.trim().toLowerCase();
        const searchItems = document.querySelectorAll('[data-search]');
        let visibleCount = 0;
        let totalCount = 0;

        searchItems.forEach(el => {
          totalCount++;
          const itemSearch = el.dataset.search || '';
          const itemSection = el.dataset.section || '';
          const isObservedItem = el.dataset.observed === 'true';

          const matchesQuery = !q || itemSearch.includes(q);
          const matchesObserved = !observed.checked || isObservedItem;
          
          let matchesTab = true;
          if (activeTab !== 'all') {
            if (activeTab === 'routes') {
              matchesTab = el.tagName === 'ARTICLE' && el.classList.contains('route-card') && el.dataset.section !== 'requests';
            } else if (activeTab === 'requests') {
              matchesTab = itemSection === 'requests';
            } else if (activeTab === 'params') {
              matchesTab = itemSection === 'params';
            } else if (activeTab === 'fields') {
              matchesTab = itemSection === 'fields';
            } else if (activeTab === 'components') {
              matchesTab = itemSection === 'components';
            } else if (activeTab === 'tests') {
              matchesTab = itemSection === 'tests';
            } else if (activeTab === 'unresolved') {
              matchesTab = itemSection === 'unresolved' || itemSection === 'requests' && itemSearch.includes('unresolved');
            } else if (activeTab === 'evidence') {
              matchesTab = itemSection === 'evidence';
            }
          }

          const isVisible = matchesQuery && matchesObserved && matchesTab;
          if (isVisible) visibleCount++;

          if (el.tagName === 'TR') {
            el.style.display = isVisible ? '' : 'none';
          } else {
            el.hidden = !isVisible;
          }
        });

        // Hide/show section containers based on active tab
        reportSections.forEach(sec => {
          const secTab = sec.dataset.tabContent;
          if (activeTab === 'all' || activeTab === secTab) {
            sec.style.display = '';
          } else {
            sec.style.display = 'none';
          }
        });

        if (matchCounter) {
          matchCounter.textContent = q || observed.checked || activeTab !== 'all' 
            ? visibleCount + ' matching' 
            : 'Showing all';
        }
      }

      filter.addEventListener('input', apply);
      observed.addEventListener('change', apply);

      // Keyboard shortcut '/' to search
      window.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== filter) {
          e.preventDefault();
          filter.focus();
        }
      });

      // Tab switcher
      tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          tabButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeTab = btn.dataset.tab;
          apply();
        });
      });

      // Quick filter from stat cards
      statCards.forEach(card => {
        card.addEventListener('click', () => {
          const tabName = card.dataset.tab;
          if (!tabName) return;
          const targetBtn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
          if (targetBtn) {
            tabButtons.forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            activeTab = tabName;
            apply();
            window.scrollTo({ top: document.querySelector('.controls-wrapper').offsetTop - 20, behavior: 'smooth' });
          }
        });
      });

      // Copy buttons handler
      document.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('[data-copy]');
        if (copyBtn) {
          const text = copyBtn.dataset.copy;
          if (text) {
            navigator.clipboard.writeText(text).then(() => {
              showToast('Copied: ' + text);
            });
          }
        }
      });

      // Copy Summary
      const btnCopySummary = document.querySelector('#btn-copy-summary');
      if (btnCopySummary) {
        btnCopySummary.addEventListener('click', () => {
          const summary = 'RepoPath Scan: ${escape(graph.repository)}\\n' +
            'Routes: ${endpoints.length} | Requests: ${apiRequests.length} (Unresolved: ${unresolvedRequests.length})\\n' +
            'Params: ${queryParams.length} | Fields: ${apiFields.length} | Tests: ${testNodes.length}\\n' +
            'Nodes: ${graph.nodes.length} | Facts: ${canonicalCount} canonical';
          navigator.clipboard.writeText(summary).then(() => {
            showToast('Summary copied to clipboard!');
          });
        });
      }

      // Expand / Collapse all
      const btnExpandAll = document.querySelector('#btn-expand-all');
      const btnCollapseAll = document.querySelector('#btn-collapse-all');
      if (btnExpandAll && btnCollapseAll) {
        btnExpandAll.addEventListener('click', () => {
          document.querySelectorAll('.route-card .card-body').forEach(b => b.style.display = '');
        });
        btnCollapseAll.addEventListener('click', () => {
          document.querySelectorAll('.route-card .card-body').forEach(b => b.style.display = 'none');
        });
      }

      // Export JSON
      const btnExportJson = document.querySelector('#btn-export-json');
      if (btnExportJson) {
        btnExportJson.addEventListener('click', () => {
          const rawEl = document.querySelector('#repopath-raw-data');
          if (!rawEl) return;
          const blob = new Blob([rawEl.textContent], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'repopath-graph.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast('Graph JSON downloaded');
        });
      }
    })();
  </script>
</body>
</html>`;
}

function endpointCard(endpoint: GraphNode, edges: GraphEdge[], nodes: Map<string, GraphNode>): string {
  const related = edges.filter((edge) => edge.source === endpoint.id || edge.target === endpoint.id);
  const display = displayEndpoint(endpoint.id);
  const parts = display.split(" ");
  const method = parts.length > 1 ? parts[0] : "ROUTE";
  const path = parts.length > 1 ? parts.slice(1).join(" ") : display;

  const handlers = related.filter((edge) => edge.relation === "HANDLES");
  const callers = related.filter((edge) => edge.relation === "REQUESTS" || edge.relation === "CALLS" || edge.relation === "TARGETS");
  const otherEdges = related.filter((edge) => edge.relation !== "HANDLES" && edge.relation !== "REQUESTS" && edge.relation !== "CALLS" && edge.relation !== "TARGETS");

  const handlersList = handlers.map((edge) => {
    const node = nodes.get(edge.source === endpoint.id ? edge.target : edge.source);
    return `<li class="handler-item">
      <span class="badge badge-relation">HANDLES</span>
      <code class="code-pill">${escape(node?.label ?? "handler")}</code>
      <span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span>
      <span class="text-dim">(${escape(edge.evidence.detail)})</span>
    </li>`;
  }).join("");

  const callersList = callers.map((edge) => {
    const node = nodes.get(edge.source === endpoint.id ? edge.target : edge.source);
    return `<li class="handler-item">
      <span class="badge badge-call">← ${escape(edge.relation)}</span>
      <span class="entity-name">${escape(node?.label ?? "unknown")}</span>
      <span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span>
    </li>`;
  }).join("");

  const otherList = otherEdges.map((edge) => {
    const node = nodes.get(edge.source === endpoint.id ? edge.target : edge.source);
    return `<li class="handler-item">
      <span class="badge badge-dim">${escape(edge.relation)}</span>
      <span class="text-main">${escape(node?.label ?? "unknown")}</span>
      <span class="font-mono text-muted">${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</span>
    </li>`;
  }).join("");

  const isObserved = related.some((edge) => edge.evidence.status === "observed");
  const search = [
    endpoint.label,
    method,
    path,
    ...related.map((edge) => `${nodes.get(edge.source === endpoint.id ? edge.target : edge.source)?.label ?? ""} ${edge.evidence.detail} ${edge.evidence.location.file}`)
  ].join(" ").toLowerCase();

  return `<article class="card route-card" data-section="routes" data-search="${escape(search)}" data-observed="${isObserved}">
    <div class="card-header">
      <div class="card-title-group">
        <span class="method-badge method-${method.toLowerCase()}">${escape(method)}</span>
        <span class="endpoint-path font-mono">${escape(path)}</span>
      </div>
      <button class="btn-icon copy-btn" data-copy="${escape(display)}" title="Copy endpoint">📋</button>
    </div>
    <div class="card-body">
      ${handlersList ? `<div class="detail-row"><span class="detail-label">Handlers:</span><ul class="handlers-list">${handlersList}</ul></div>` : ""}
      ${callersList ? `<div class="detail-row"><span class="detail-label">Called By:</span><ul class="handlers-list">${callersList}</ul></div>` : ""}
      ${otherList ? `<div class="detail-row"><span class="detail-label">Other:</span><ul class="handlers-list">${otherList}</ul></div>` : ""}
      ${!related.length ? `<p class="text-dim">No linked evidence</p>` : ""}
    </div>
  </article>`;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
