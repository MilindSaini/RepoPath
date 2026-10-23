import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, unlink } from "node:fs/promises";
import { buildGraph } from "../dist/core.js";
import { endpointTrace, htmlReport } from "../dist/report.js";

const fixture = new URL("../tests/fixtures/storefront/", import.meta.url).pathname;

test("maps frontend, Express, test, and FastAPI evidence to endpoints", async () => {
  const graph = await buildGraph(fixture);
  const order = graph.nodes.find((node) => node.id === "endpoint:GET /api/orders/{id}");
  assert.ok(order);
  const related = graph.edges.filter((edge) => edge.source === order.id || edge.target === order.id);
  assert.equal(related.filter((edge) => edge.relation === "REQUESTS").length, 1);
  assert.equal(related.filter((edge) => edge.relation === "HANDLES").length, 1);
  assert.equal(related.filter((edge) => edge.relation === "EXERCISES").length, 1);
  assert.match(endpointTrace(graph, "GET /api/orders/{id}"), /OrderDetails/);
  assert.ok(graph.nodes.find((node) => node.id === "endpoint:GET /api/health"));
});

test("no DEFINED_IN edges remain (P0: remove duplicate reverse edges)", async () => {
  const graph = await buildGraph(fixture);
  const definedIn = graph.edges.filter((edge) => edge.relation === "DEFINED_IN");
  assert.equal(definedIn.length, 0, `Expected zero DEFINED_IN edges, found ${definedIn.length}`);
  // DECLARES edges should still exist
  const declares = graph.edges.filter((edge) => edge.relation === "DECLARES");
  assert.ok(declares.length > 0, "DECLARES edges should exist");
});

const reactFixture = new URL("../tests/fixtures/react-app/", import.meta.url).pathname;

test("React provider component provides context, not parent (P0: context graph)", async () => {
  const graph = await buildGraph(reactFixture);

  // AuthProvider component should exist as a function node
  const authProvider = graph.nodes.find((node) => node.id.includes("AuthProvider") && node.kind === "function");
  assert.ok(authProvider, "AuthProvider function node should exist");

  // AuthContext should exist as a context node
  const authContext = graph.nodes.find((node) => node.id === "context:AuthContext");
  assert.ok(authContext, "context:AuthContext node should exist");

  // PROVIDES_CONTEXT should come FROM the provider component, not from App
  const providesContext = graph.edges.filter((edge) => edge.relation === "PROVIDES_CONTEXT");
  for (const edge of providesContext) {
    assert.ok(!edge.source.includes("App"), `PROVIDES_CONTEXT should not originate from App, got source: ${edge.source}`);
  }

  // App RENDERS AuthProvider (component hierarchy)
  const appRenders = graph.edges.find((edge) => edge.relation === "RENDERS" && edge.source.includes("App") && edge.target.includes("AuthProvider"));
  assert.ok(appRenders, "App should RENDER AuthProvider");
});

test("useContext creates CONSUMES_CONTEXT edge to correct context node", async () => {
  const graph = await buildGraph(reactFixture);

  const consumes = graph.edges.filter((edge) => edge.relation === "CONSUMES_CONTEXT");
  assert.ok(consumes.length > 0, "Should have CONSUMES_CONTEXT edges");

  // Dashboard consumes AuthContext
  const dashboardConsumes = consumes.find((edge) => edge.source.includes("Dashboard") && edge.target === "context:AuthContext");
  assert.ok(dashboardConsumes, "Dashboard should consume AuthContext");
});

test("API request IDs do not contain 'unresolved' for resolved paths (P0)", async () => {
  const graph = await buildGraph(reactFixture);

  const requests = graph.nodes.filter((node) => node.kind === "api_request");
  for (const request of requests) {
    // Resolved requests should not have "unresolved:" in their ID
    if (request.attributes?.pathResolution === "resolved") {
      assert.ok(!request.id.includes("unresolved:"), `Resolved request should not have 'unresolved:' in ID: ${request.id}`);
    }
  }

  // Truly unresolved requests should have proper attributes
  const unresolvedRequests = requests.filter((node) => node.attributes?.pathResolution === "unresolved");
  for (const request of unresolvedRequests) {
    assert.equal(request.attributes?.originResolution, "unresolved", `Unresolved request should have originResolution=unresolved: ${request.id}`);
  }
});

test("scan scope reflects actual analysis state (P0: truthful coverage)", async () => {
  const graph = await buildGraph(reactFixture);

  assert.ok(graph.scanScope, "scanScope should be present");
  assert.equal(graph.scanScope.frontend, "complete", "Frontend should be complete for TSX files");
  assert.equal(graph.scanScope.apiContracts, "not_configured", "apiContracts should be not_configured without OpenAPI");
  assert.equal(graph.scanScope.runtimeTraces, "not_imported", "runtimeTraces should be not_imported without traces");
});

test("storefront scan scope reports test coverage correctly", async () => {
  const graph = await buildGraph(fixture);

  assert.ok(graph.scanScope, "scanScope should be present");
  // Storefront has test files, so tests should be "complete"
  const hasTests = graph.nodes.some((node) => node.kind === "test");
  if (hasTests) {
    assert.notEqual(graph.scanScope.tests, "not_analyzed", "Tests should not be 'not_analyzed' when test nodes exist");
  }
});

test("no duplicate context and function nodes for providers", async () => {
  const graph = await buildGraph(reactFixture);

  // There should be exactly one context node per context, not duplicates like context:AuthProvider AND function:AuthProvider
  const contextNodes = graph.nodes.filter((node) => node.kind === "context");
  const contextIds = contextNodes.map((node) => node.id);
  const uniqueContextIds = new Set(contextIds);
  assert.equal(contextIds.length, uniqueContextIds.size, "No duplicate context node IDs");

  // Context nodes should be named like *Context, not *Provider
  for (const ctx of contextNodes) {
    assert.ok(!ctx.id.endsWith("Provider") || ctx.id.includes("Context"), `Context node should reference the context, not the provider: ${ctx.id}`);
  }
});

test("restores response-field analysis with api_field nodes and READS_FIELD relationships (P1)", async () => {
  const graph = await buildGraph(reactFixture);

  const fieldNodes = graph.nodes.filter((node) => node.kind === "api_field");
  assert.ok(fieldNodes.length > 0, "Should have discovered api_field nodes");

  const fieldLabels = fieldNodes.map((n) => n.attributes?.field);
  assert.ok(fieldLabels.includes("items"), "Should include 'items' field");
  assert.ok(fieldLabels.includes("total"), "Should include 'total' field");

  const readsEdges = graph.edges.filter((edge) => edge.relation === "READS_FIELD");
  assert.ok(readsEdges.length > 0, "Should have READS_FIELD edges");

  for (const edge of readsEdges) {
    assert.equal(edge.evidence.status, "inferred", "Client field reads should have status 'inferred'");
  }
});

test("OpenAPI schema fields have DECLARES_FIELD with statically_established status (P1)", async () => {
  const openApiDoc = {
    openapi: "3.0.0",
    info: { title: "API", version: "1.0" },
    paths: {
      "/api/videos": {
        get: {
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      items: { type: "array" },
                      page: { type: "integer" },
                      page_size: { type: "integer" },
                      total: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const tmpPath = "/tmp/repopath-test-openapi.json";
  await writeFile(tmpPath, JSON.stringify(openApiDoc));
  try {
    const graph = await buildGraph(fixture, { openapiPath: tmpPath });
    const declaresField = graph.edges.filter((edge) => edge.relation === "DECLARES_FIELD");
    assert.ok(declaresField.length > 0, "Should have DECLARES_FIELD edges from OpenAPI");
    for (const edge of declaresField) {
      assert.equal(edge.evidence.status, "statically_established", "Schema fields should be statically_established");
    }
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
});

test("HTML report includes separate API metrics and search attributes across sections", async () => {
  const graph = await buildGraph(reactFixture);
  const html = htmlReport(graph);

  assert.match(html, /backend routes found/);
  assert.match(html, /outgoing API requests/);
  assert.match(html, /unresolved request URLs/);
  assert.match(html, /canonical facts/);
  assert.match(html, /document\.querySelectorAll\('\[data-search\]'\)/);
});
