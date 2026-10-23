import type { EvidenceGraph, GraphNode } from "./model.js";

export interface DriftFinding { type: "declared_not_implemented" | "implemented_not_declared" | "unobserved"; endpoint: GraphNode; message: string; }

export function detectDrift(graph: EvidenceGraph): DriftFinding[] {
  const findings: DriftFinding[] = [];
  for (const endpoint of graph.nodes.filter((node) => node.kind === "api_route")) {
    const declared = graph.edges.some((edge) => edge.relation === "DECLARES" && edge.target === endpoint.id);
    const implemented = graph.edges.some((edge) => edge.relation === "HANDLES" && edge.source === endpoint.id);
    const observed = graph.edges.some((edge) => edge.relation === "OBSERVED" && edge.target === endpoint.id);
    if (declared && !implemented) findings.push({ type: "declared_not_implemented", endpoint, message: "Declared by OpenAPI but no implementation route was found." });
    if (implemented && graph.nodes.some((node) => node.kind === "api_contract") && !declared) findings.push({ type: "implemented_not_declared", endpoint, message: "Implemented route has no matching imported OpenAPI operation." });
    if ((declared || implemented) && !observed) findings.push({ type: "unobserved", endpoint, message: "No imported runtime observation exists. This is not proof that the endpoint is unused." });
  }
  return findings;
}
