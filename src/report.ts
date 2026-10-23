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
  const rows = endpoints.map((endpoint) => endpointRow(endpoint, graph.edges, nodeById)).join("\n");
  const evidence = graph.edges.reduce((counts, edge) => ({ ...counts, [edge.evidence.status]: (counts[edge.evidence.status] ?? 0) + 1 }), {} as Record<string, number>);
  const components = graph.nodes.filter((node) => node.attributes?.isReactComponent);
  const calls = graph.edges.filter((edge) => ["CALLS", "RENDERS", "PASSES_CALLBACK", "PROVIDES_CONTEXT", "CONSUMES_CONTEXT"].includes(edge.relation));
  const unresolved = graph.edges.filter((edge) => edge.evidence.status === "unresolved");

  // Separate API metrics
  const apiRequests = graph.nodes.filter((node) => node.kind === "api_request");
  const unresolvedRequests = apiRequests.filter((node) => node.attributes?.pathResolution === "unresolved");
  const apiFields = graph.nodes.filter((node) => node.kind === "api_field");
  const canonicalCount = graph.edges.length;

  const relationshipRows = graph.edges.map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `${edge.relation} ${source} ${target} ${edge.evidence.status} ${edge.evidence.location.file} ${edge.evidence.detail}`.toLowerCase();
    return `<tr data-search="${escape(search)}" data-observed="${isObserved}"><td>${escape(edge.relation)}</td><td>${escape(source)}</td><td>${escape(target)}</td><td>${escape(edge.evidence.status)}</td><td>${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</td></tr>`;
  }).join("");
  const observedState = evidence.observed ? `${evidence.observed} observed relationships` : "No runtime evidence imported for this scan.";

  // Scan scope display
  const scope = graph.scanScope;
  const scopeHtml = scope ? `<section><h2>Scan scope</h2><table><thead><tr><th>Area</th><th>Status</th></tr></thead><tbody>${Object.entries(scope).map(([key, value]) => `<tr data-search="${escape(key)} ${escape(value)}" data-observed="false"><td>${escape(key)}</td><td>${escape(value)}</td></tr>`).join("")}</tbody></table></section>` : "";

  // Component and call paths with search data
  const callListItems = calls.map((edge) => {
    const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
    const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `${edge.relation} ${sourceLabel} ${targetLabel} ${edge.evidence.location.file} ${edge.evidence.detail}`.toLowerCase();
    return `<li data-search="${escape(search)}" data-observed="${isObserved}"><code>${escape(edge.relation)}</code> ${escape(sourceLabel)} → ${escape(targetLabel)} — ${escape(edge.evidence.location.file)}:${edge.evidence.location.line} (${escape(edge.evidence.detail)})</li>`;
  }).join("");

  // Unresolved list with search data
  const unresolvedListItems = unresolved.map((edge) => {
    const isObserved = edge.evidence.status === "observed";
    const search = `${edge.relation} ${edge.evidence.detail} ${edge.evidence.location.file}`.toLowerCase();
    return `<li data-search="${escape(search)}" data-observed="${isObserved}"><code>${escape(edge.relation)}</code> ${escape(edge.evidence.detail)} — ${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</li>`;
  }).join("");

  // Response fields section
  const fieldEdges = graph.edges.filter((edge) => ["READS_FIELD", "CONSUMES_FIELD", "DECLARES_FIELD"].includes(edge.relation));
  const fieldRows = fieldEdges.map((edge) => {
    const source = nodeById.get(edge.source)?.label ?? edge.source;
    const target = nodeById.get(edge.target)?.label ?? edge.target;
    const isObserved = edge.evidence.status === "observed";
    const search = `${edge.relation} ${source} ${target} ${edge.evidence.status} ${edge.evidence.location.file}`.toLowerCase();
    return `<tr data-search="${escape(search)}" data-observed="${isObserved}"><td>${escape(target)}</td><td>${escape(edge.relation)}</td><td>${escape(source)}</td><td>${escape(edge.evidence.status)}</td><td>${escape(edge.evidence.location.file)}:${edge.evidence.location.line}</td></tr>`;
  }).join("");
  const fieldSectionHtml = fieldEdges.length ? `<section><h2>API response fields (${apiFields.length} fields)</h2><table><thead><tr><th>Field</th><th>Relation</th><th>Component / Origin</th><th>Status</th><th>Location</th></tr></thead><tbody>${fieldRows}</tbody></table></section>` : "";

  const revisionNote = graph.revision ? `Commit: <code>${escape(graph.revision.slice(0, 12))}</code>.` : "No source revision recorded.";

  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>RepoPath report</title><style>body{font:16px system-ui;max-width:1180px;margin:3rem auto;padding:0 1rem;color:#17211a}h1{margin-bottom:.2rem}small{color:#536057}.stats{display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0}.stat{background:#f2f5f2;border-radius:8px;padding:.65rem 1rem}.controls{display:flex;gap:.7rem;align-items:center;margin:1rem 0}input{font:inherit;padding:.5rem;width:min(32rem,100%)}article{border:1px solid #d6dfd7;border-radius:10px;padding:1rem;margin:1rem 0}code{background:#f2f5f2;padding:.15rem .3rem;border-radius:4px}ul{margin-bottom:0}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #d6dfd7;padding:.45rem;text-align:left;font-size:.9rem}section{margin:1.5rem 0}</style><h1>RepoPath evidence report</h1><small>Scanned ${escape(graph.repository)} at ${escape(graph.scannedAt)}. ${revisionNote} Static, observed, and stale evidence remain distinct.</small><section class="stats"><div class="stat"><strong>${endpoints.length}</strong> backend routes found</div><div class="stat"><strong>${apiRequests.length}</strong> outgoing API requests</div><div class="stat"><strong>${unresolvedRequests.length}</strong> unresolved request URLs</div><div class="stat"><strong>${components.length}</strong> React components</div><div class="stat"><strong>${apiFields.length}</strong> response fields</div><div class="stat"><strong>${graph.nodes.length}</strong> nodes</div><div class="stat"><strong>${graph.edges.length}</strong> relationships (${canonicalCount} canonical facts)</div><div class="stat"><strong>${evidence.observed ?? 0}</strong> observed</div><div class="stat"><strong>${evidence.stale ?? 0}</strong> stale</div></section><p>${escape(observedState)}</p><div class="controls"><input id="filter" type="search" placeholder="Filter endpoint, component, function, or evidence"><label><input id="observed" type="checkbox"> observed only</label></div><section><h2>API dependencies</h2><main>${rows || "<p>No backend routes were found in the scanned source.</p>"}</main></section><section><h2>Component and call paths</h2>${callListItems ? `<ul>${callListItems}</ul>` : "<p>No component or call relationships were found.</p>"}</section><section><h2>Unresolved relationships</h2>${unresolvedListItems ? `<ul>${unresolvedListItems}</ul>` : "<p>None.</p>"}</section>${fieldSectionHtml}${scopeHtml}<section><h2>Evidence detail</h2><table><thead><tr><th>Relation</th><th>Source</th><th>Target</th><th>Status</th><th>Location</th></tr></thead><tbody>${relationshipRows || "<tr><td colspan='5'>No relationships found.</td></tr>"}</tbody></table></section><script>const filter=document.querySelector('#filter'),observed=document.querySelector('#observed');function apply(){const q=filter.value.toLowerCase();document.querySelectorAll('[data-search]').forEach(el=>{const matches=(!q||el.dataset.search.includes(q))&&(!observed.checked||el.dataset.observed==='true');if(el.tagName==='TR'){el.style.display=matches?'':'none';}else{el.hidden=!matches;}})}filter.addEventListener('input',apply);observed.addEventListener('change',apply)</script></html>`;
}

function endpointRow(endpoint: GraphNode, edges: GraphEdge[], nodes: Map<string, GraphNode>): string {
  const related = edges.filter((edge) => edge.source === endpoint.id || edge.target === endpoint.id);
  const list = related.map((edge) => {
    const node = nodes.get(edge.source === endpoint.id ? edge.target : edge.source);
    return `<li><code>${escape(edge.relation)}</code> ${escape(node?.label ?? "unknown")} — ${escape(edge.evidence.location.file)}:${edge.evidence.location.line}; ${escape(edge.evidence.detail)}</li>`;
  }).join("");
  const search = [endpoint.label, ...related.map((edge) => `${nodes.get(edge.source === endpoint.id ? edge.target : edge.source)?.label ?? ""} ${edge.evidence.detail}`)].join(" ").toLowerCase();
  return `<article data-search="${escape(search)}" data-observed="${related.some((edge) => edge.evidence.status === "observed")}"><h2>${escape(displayEndpoint(endpoint.id))}</h2><ul>${list || "<li>No linked evidence</li>"}</ul></article>`;
}
function escape(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
