import assert from "node:assert/strict";
import test from "node:test";
import { buildGraph } from "../dist/core.js";
import { architectureMarkdown, buildApiOperations, buildProjectBrief, exploreContracts, retrieveEvidence, runHealthChecks } from "../dist/intelligence.js";
import { resolve } from "node:path";

test("intelligence produces evidence-bounded project brief, contracts, and architecture", async () => {
  const graph = await buildGraph("tests/fixtures/storefront");
  const brief = buildProjectBrief(graph);
  assert.equal(brief.evidence.discovered, graph.nodes.length);
  assert.equal(brief.evidence.verified, graph.edges.filter((edge) => edge.evidence.status === "statically_established").length);
  assert.ok(brief.summary.includes("frontend"));
  assert.ok(exploreContracts(graph).length > 0);
  const operations = buildApiOperations(graph);
  assert.ok(operations.length >= graph.nodes.filter((node) => node.kind === "api_route").length);
  assert.ok(operations.some((operation) => operation.resolution === "MATCHED"));
  assert.ok(operations.every((operation) => operation.operationId.startsWith("operation:")));
  assert.ok(architectureMarkdown(graph).includes("```mermaid"));
});

test("health checks and retrieval retain uncertainty instead of inventing relationships", async () => {
  const graph = await buildGraph("tests/fixtures/storefront");
  const findings = runHealthChecks(graph);
  assert.ok(Array.isArray(findings));
  const retrieved = retrieveEvidence("orders dashboard", graph, resolve("tests/fixtures/storefront"));
  assert.ok(retrieved.nodes.length > 0);
  assert.ok(retrieved.sources.every((source) => source.exists || source.content === ""));
});
