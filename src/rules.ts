import { readFileSync } from "node:fs";
import type { EvidenceGraph, GraphNode } from "./model.js";
import type { ImpactReport } from "./impact.js";

export interface Rule { id: string; description?: string; scope?: string; action: "warn" | "review" | "block"; }
export interface RuleConfig { rules: Rule[]; criticalEndpoints?: string[]; }
export interface Finding { ruleId: string; action: Rule["action"]; message: string; node?: GraphNode; }

export function loadRules(path?: string): RuleConfig { if (!path) return { rules: [] }; return JSON.parse(readFileSync(path, "utf8")) as RuleConfig; }

export function evaluateRules(graph: EvidenceGraph, impact: ImpactReport, config: RuleConfig): Finding[] {
  const findings: Finding[] = [];
  const endpoints = graph.nodes.filter((node) => node.kind === "api_route");
  const requestedRoutes = new Set(graph.edges.filter((edge) => edge.relation === "TARGETS" && graph.edges.some((request) => request.relation === "REQUESTS" && request.target === edge.source)).map((edge) => edge.target));
  for (const rule of config.rules) {
    if (rule.id === "api-contract-required") {
      for (const endpoint of endpoints.filter((node) => requestedRoutes.has(node.id) && !graph.edges.some((edge) => edge.relation === "DECLARES" && edge.target === node.id))) {
        findings.push({ ruleId: rule.id, action: rule.action, node: endpoint, message: `${endpoint.label} has a frontend request but no imported OpenAPI declaration.` });
      }
    }
    if (rule.id === "test-coverage-required") {
      for (const endpoint of endpoints.filter((node) => config.criticalEndpoints?.includes(node.label) && impact.direct.concat(impact.downstream).some((item) => item.node.id === node.id))) {
        const mapped = graph.edges.some((edge) => edge.relation === "TARGETS" && edge.target === endpoint.id && graph.edges.some((request) => request.relation === "EXERCISES" && request.target === edge.source));
        if (!mapped) findings.push({ ruleId: rule.id, action: rule.action, node: endpoint, message: `Critical changed endpoint ${endpoint.label} has no statically mapped test request.` });
      }
    }
    if (rule.id === "no-secrets-in-traces") {
      const leaked = graph.edges.find((edge) => edge.evidence.method === "opentelemetry_import" && /(authorization|password|secret|token)/i.test(edge.evidence.detail));
      if (leaked) findings.push({ ruleId: rule.id, action: rule.action, message: "Potential secret-bearing trace evidence was retained; remove it before sharing reports." });
    }
  }
  return findings;
}

export function findingsToSarif(findings: Finding[]): Record<string, unknown> {
  const rules = [...new Map(findings.map((finding) => [finding.ruleId, { id: finding.ruleId, shortDescription: { text: finding.ruleId } }])).values()];
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "RepoPath", rules } },
      results: findings.map((finding) => ({
        ruleId: finding.ruleId,
        level: finding.action === "block" ? "error" : finding.action === "review" ? "warning" : "note",
        message: { text: finding.message },
        locations: finding.node?.location ? [{ physicalLocation: { artifactLocation: { uri: finding.node.location.file }, region: { startLine: finding.node.location.line } } }] : undefined,
      })),
    }],
  };
}
