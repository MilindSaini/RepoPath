import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdir, rm, stat } from "node:fs/promises";
import { buildGraph } from "../dist/core.js";
import { canonicalPath, GraphBuilder } from "../dist/model.js";
import { persistGraph } from "../dist/store.js";

test("URL normalization strips protocols, host, and template base-URL expressions", () => {
  assert.equal(canonicalPath("${NL2SQL_API_URL}/ask-ai"), "/ask-ai");
  assert.equal(canonicalPath("{NL2SQL_API_URL}/ask-ai"), "/ask-ai");
  assert.equal(canonicalPath("${API_CONFIG.BASE_URL}/api/dashboard/summary"), "/api/dashboard/summary");
  assert.equal(canonicalPath("{API_CONFIG.BASE_URL}/api/dashboard/summary"), "/api/dashboard/summary");
  assert.equal(canonicalPath("${process.env.REACT_APP_API_URL}/api/v1/data"), "/api/v1/data");
  assert.equal(canonicalPath("http://127.0.0.1:8000/ask-ai"), "/ask-ai");
  assert.equal(canonicalPath("https://api.example.com/api/test?foo=bar"), "/api/test");
});

test("findMatchingEndpoint supports suffix matching across base URL prefixes and 'ALL' method", () => {
  const gb = new GraphBuilder("test-repo");
  gb.addNode({ id: "endpoint:POST /ask-ai", kind: "api_route", label: "POST /ask-ai" });
  gb.addNode({ id: "endpoint:GET /api/dashboard/last-update", kind: "api_route", label: "GET /api/dashboard/last-update" });
  gb.addNode({ id: "endpoint:ALL /api/proxy/*", kind: "api_route", label: "ALL /api/proxy/*" });

  // Suffix matching: client calls with /api prefix, server has /ask-ai
  const m1 = gb.findMatchingEndpoint("POST", "/api/ask-ai");
  assert.ok(m1, "Should match /ask-ai for /api/ask-ai");
  assert.equal(m1.id, "endpoint:POST /ask-ai");

  // Suffix matching: server has /api prefix, client calls /dashboard/last-update
  const m2 = gb.findMatchingEndpoint("GET", "/dashboard/last-update");
  assert.ok(m2, "Should match /api/dashboard/last-update for /dashboard/last-update");
  assert.equal(m2.id, "endpoint:GET /api/dashboard/last-update");

  // ALL method matches any HTTP method
  const m3 = gb.findMatchingEndpoint("POST", "/api/proxy/123");
  assert.ok(m3, "ALL endpoint should match POST request");
  assert.equal(m3.id, "endpoint:ALL /api/proxy/*");
});

test("anonymous route handler callbacks own their API calls; no whole-file edge cascades", async () => {
  const code = `
    import express from "express";
    import axios from "axios";
    const app = express();

    app.post("/api/ask-ai", async (req, res) => {
      const resp = await axios.post("http://127.0.0.1:8000/ask-ai", { q: req.body.q });
      const { answer } = resp.data;
      res.json({ answer });
    });

    export function unrelatedHelper(data: any) {
      const formatted = JSON.stringify(data);
      const trimmed = data.trimmedText.trim();
      return trimmed;
    }
  `;
  const tmpDir = "/tmp/repopath-test-route-owner";
  await mkdir(tmpDir, { recursive: true });
  await writeFile(`${tmpDir}/server.ts`, code);
  try {
    const graph = await buildGraph(tmpDir);
    // Request owner should be the route handler, NOT file:server.ts
    const reqNode = graph.nodes.find((n) => n.kind === "api_request");
    assert.ok(reqNode, "Request node should exist");

    const reqEdge = graph.edges.find((e) => e.relation === "REQUESTS" && e.target === reqNode.id);
    assert.ok(reqEdge, "REQUESTS edge should exist");
    assert.ok(reqEdge.source.includes("<route handler:"), `Owner should be route handler, got ${reqEdge.source}`);

    // unrelatedHelper should NOT have READS_FIELD edges for stringify or trim
    const readsEdges = graph.edges.filter((e) => e.relation === "READS_FIELD");
    for (const edge of readsEdges) {
      assert.ok(!edge.source.includes("unrelatedHelper"), `unrelatedHelper should not read API fields, got: ${edge.source} -> ${edge.target}`);
      assert.ok(!edge.target.includes("stringify"), "JSON.stringify should not be treated as API field");
      assert.ok(!edge.target.includes("trim"), "trim() should not be treated as API field");
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("CommonJS require() router mounts and ArrayLiteral route paths", async () => {
  const tmpDir = "/tmp/repopath-test-cjs-array";
  await mkdir(tmpDir, { recursive: true });
  const serverCode = `
    const express = require('express');
    const app = express();
    const subRouter = require('./sub-router');

    app.use('/api/sub', subRouter);
    app.get(['/dashboard/last-update', '/api/dashboard/last-update'], (req, res) => {
      res.json({ time: 123 });
    });
  `;
  const subRouterCode = `
    const express = require('express');
    const router = express.Router();
    router.get('/items', (req, res) => res.json([]));
    module.exports = router;
  `;
  await writeFile(`${tmpDir}/server.js`, serverCode);
  await writeFile(`${tmpDir}/sub-router.js`, subRouterCode);
  try {
    const graph = await buildGraph(tmpDir);
    // CommonJS mounted router route
    const subRoute = graph.nodes.find((n) => n.id === "endpoint:GET /api/sub/items");
    assert.ok(subRoute, "Sub router route should be mounted with /api/sub prefix");

    // Array route paths
    const r1 = graph.nodes.find((n) => n.id === "endpoint:GET /dashboard/last-update");
    const r2 = graph.nodes.find((n) => n.id === "endpoint:GET /api/dashboard/last-update");
    assert.ok(r1, "Array route 1 should be registered");
    assert.ok(r2, "Array route 2 should be registered");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("object-literal service methods, property access calls, and caching wrappers", async () => {
  const tmpDir = "/tmp/repopath-test-service-methods";
  await mkdir(tmpDir, { recursive: true });
  const serviceCode = `
    export const api = {
      auth: {
        sendOTP: (phone: string) => fetch("/api/auth/otp", { method: "POST" }),
      },
    };

    export const fetchWithCache = async (url: string, params: any) => {
      const p = (async () => {
        return await fetch(url, { method: "POST" });
      })();
      return await p;
    };
  `;
  const callerCode = `
    import { api, fetchWithCache } from "./service";
    export function doLogin() {
      api.auth.sendOTP("1234567890");
      fetchWithCache("/api/dashboard/stats", {});
    }
  `;
  await writeFile(`${tmpDir}/service.ts`, serviceCode);
  await writeFile(`${tmpDir}/caller.ts`, callerCode);
  try {
    const graph = await buildGraph(tmpDir);
    // Method declaration in namedFunctions
    const fnNode = graph.nodes.find((n) => n.id.includes("api.auth.sendOTP"));
    assert.ok(fnNode, "api.auth.sendOTP should exist as a function node");

    // Property access call resolves to definition
    const callsEdge = graph.edges.find((e) => e.relation === "CALLS" && e.target.includes("api.auth.sendOTP"));
    assert.ok(callsEdge, "doLogin should CALL api.auth.sendOTP");

    // fetchWithCache detected as network wrapper
    const statsReq = graph.nodes.find((n) => n.id.includes("POST /api/dashboard/stats"));
    assert.ok(statsReq, "Request through fetchWithCache should resolve with POST method");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("direct axios(config) and database operations in TS & Python", async () => {
  const tmpDir = "/tmp/repopath-test-db-axios";
  await mkdir(tmpDir, { recursive: true });
  const tsCode = `
    import axios from "axios";
    export async function proxyHandler(req: any) {
      await axios({ method: "POST", url: "/api/upstream" });
    }
    export async function getDbData(pool: any) {
      const sql = "SELECT * FROM pincode_master";
      await pool.query(sql);
    }
  `;
  const pyCode = `
def run_query():
    sql = "SELECT id FROM all_pensioners_clean"
    cur.execute(sql)
  `;
  const schemaCode = `
    CREATE TABLE pincode_master (id INT);
    CREATE VIEW all_pensioners_clean AS SELECT 1;
  `;
  await writeFile(`${tmpDir}/backend.ts`, tsCode);
  await writeFile(`${tmpDir}/db.py`, pyCode);
  await writeFile(`${tmpDir}/schema.sql`, schemaCode);
  try {
    const graph = await buildGraph(tmpDir);
    // Direct axios({ method, url })
    const axiosReq = graph.nodes.find((n) => n.id.includes("POST /api/upstream"));
    assert.ok(axiosReq, "Direct axios(config) should create api_request");

    // TS database operation linked to schema entity
    const tsDb = graph.nodes.find((n) => n.kind === "database_operation" && n.id.includes("backend.ts"));
    assert.ok(tsDb, "TS database operation should be created");
    const pmEntity = graph.nodes.find((n) => n.id.includes("pincode_master"));
    assert.ok(pmEntity, "pincode_master database_entity should exist");
    const tsEdge = graph.edges.find((e) => e.source === tsDb.id && e.target === pmEntity.id && e.relation === "TOUCHES_DATABASE");
    assert.ok(tsEdge, "TS database op should link to pincode_master entity");

    // Python database operation linked to schema entity
    const pyDb = graph.nodes.find((n) => n.kind === "database_operation" && n.id.includes("db.py"));
    assert.ok(pyDb, "Python cur.execute should create database_operation");
    const apEntity = graph.nodes.find((n) => n.id.includes("all_pensioners_clean"));
    assert.ok(apEntity, "all_pensioners_clean database_entity should exist");
    const pyEdge = graph.edges.find((e) => e.source === pyDb.id && e.target === apEntity.id && e.relation === "TOUCHES_DATABASE");
    assert.ok(pyEdge, "Python database op should link to all_pensioners_clean entity");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("SQLite dead freelist is reclaimed and risk signals report accurately", async () => {
  const tmpDir = "/tmp/repopath-test-sqlite-compact";
  await mkdir(tmpDir, { recursive: true });
  try {
    const reactFixture = new URL("../tests/fixtures/react-app/", import.meta.url).pathname;
    const graph = await buildGraph(reactFixture);
    const { sqlitePath } = await persistGraph(graph, tmpDir);

    const s = await stat(sqlitePath);
    assert.ok(s.size < 500 * 1024, `SQLite index should be compact (< 500KB), got ${s.size} bytes`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("riskSignals does not report 'complete' when 0 endpoints are linked to requests", async () => {
  const { readFile } = await import("node:fs/promises");
  const tmpDir = "/tmp/repopath-test-coverage-truth";
  await mkdir(tmpDir, { recursive: true });
  const code = `
    test("does something without requests", () => {
      const x = 1 + 1;
      expect(x).toBe(2);
    });
  `;
  await writeFile(`${tmpDir}/dummy.test.ts`, code);
  try {
    const graph = await buildGraph(tmpDir);
    await persistGraph(graph, tmpDir);
    const history = JSON.parse(await readFile(`${tmpDir}/history.json`, "utf8"));
    const entry = history[0];
    assert.equal(entry.risk.discoveredTests, 1, "Should discover 1 test");
    assert.equal(entry.risk.coverageStatus, "partial", "Coverage must be partial when 0 endpoints are linked to requests");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("cross-service multi-repo route matching (TS Express calling Python FastAPI)", async () => {
  const tmpDir = "/tmp/repopath-test-cross-service";
  await mkdir(tmpDir, { recursive: true });
  const pyCode = `
from fastapi import FastAPI
app = FastAPI()

@app.post("/ask-ai")
def ask_ai(data: dict):
    return {"reply": "ok"}
  `;
  const tsCode = `
import express from "express";
import axios from "axios";
const app = express();

app.post("/api/ask-ai", async (req, res) => {
  const resp = await axios.post("\${NL2SQL_API_URL}/ask-ai", req.body);
  res.json(resp.data);
});
  `;
  await writeFile(`${tmpDir}/api.py`, pyCode);
  await writeFile(`${tmpDir}/server.ts`, tsCode);
  try {
    const graph = await buildGraph(tmpDir);
    const pyEndpoint = graph.nodes.find((n) => n.id === "endpoint:POST /ask-ai");
    assert.ok(pyEndpoint, "Python route POST /ask-ai should be registered");

    const tsEndpoint = graph.nodes.find((n) => n.id === "endpoint:POST /api/ask-ai");
    assert.ok(tsEndpoint, "TS route POST /api/ask-ai should be registered");

    const reqNode = graph.nodes.find((n) => n.kind === "api_request" && n.id.includes("{NL2SQL_API_URL}/ask-ai"));
    assert.ok(reqNode, "TS request to NL2SQL should exist");

    // The request should TARGET the Python FastAPI route, NOT self-loop to the TS route!
    const targetEdge = graph.edges.find((e) => e.source === reqNode.id && e.relation === "TARGETS");
    assert.ok(targetEdge, "Request should have a TARGETS edge");
    assert.equal(targetEdge.target, "endpoint:POST /ask-ai", "Request should target Python FastAPI endpoint POST /ask-ai");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("imported API_ENDPOINTS config resolution and static asset import resolution", async () => {
  const tmpDir = "/tmp/repopath-test-config-endpoints";
  await mkdir(tmpDir, { recursive: true });
  const configCode = `
export const API_ENDPOINTS = {
  AUTH: {
    SEND_OTP: "/api/auth/send-otp",
  },
};
  `;
  const serviceCode = `
import { API_ENDPOINTS } from "./config";
import statesGeoJson from "./IndiaMap/states.geojson";

const apiService = {
  post: (url: string, data: any) => fetch(url, { method: "POST" }),
};

export const api = {
  auth: {
    sendOTP: (phone: string) => apiService.post(API_ENDPOINTS.AUTH.SEND_OTP, { phone }),
  },
};

export function loadMap() {
  fetch(statesGeoJson);
}
  `;
  await mkdir(`${tmpDir}/IndiaMap`, { recursive: true });
  await writeFile(`${tmpDir}/IndiaMap/states.geojson`, "{}");
  await writeFile(`${tmpDir}/config.ts`, configCode);
  await writeFile(`${tmpDir}/service.ts`, serviceCode);
  try {
    const graph = await buildGraph(tmpDir);
    // API_ENDPOINTS.AUTH.SEND_OTP should resolve to /api/auth/send-otp
    const reqNode = graph.nodes.find((n) => n.kind === "api_request" && n.id.includes("POST /api/auth/send-otp"));
    assert.ok(reqNode, "Request with imported config endpoint should resolve");

    // static asset should create static_asset node and FETCHES_ASSET edge
    const assetNode = graph.nodes.find((n) => n.kind === "static_asset" && n.id.includes("states.geojson"));
    assert.ok(assetNode, "Imported GeoJSON asset should be detected as static_asset");
    const fetchAssetEdge = graph.edges.find((e) => e.relation === "FETCHES_ASSET" && e.target === assetNode.id);
    assert.ok(fetchAssetEdge, "Should create FETCHES_ASSET edge to GeoJSON node");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("Python multiline f\"\"\" and direct string SQL table extraction", async () => {
  const tmpDir = "/tmp/repopath-test-py-sql";
  await mkdir(tmpDir, { recursive: true });
  const pyCode = `
def update_records():
    sql = f"""
    UPDATE all_pensioners
    SET status = 'active'
    WHERE id = 1
    """
    cursor.execute(sql)

def delete_records():
    cur.execute("DELETE FROM raw_csv_exports WHERE id = 2")
  `;
  const schemaCode = `
CREATE TABLE all_pensioners (id INT);
CREATE TABLE raw_csv_exports (id INT);
  `;
  await writeFile(`${tmpDir}/script.py`, pyCode);
  await writeFile(`${tmpDir}/schema.sql`, schemaCode);
  try {
    const graph = await buildGraph(tmpDir);
    const dbOps = graph.nodes.filter((n) => n.kind === "database_operation" && n.location?.file?.endsWith(".py"));
    assert.equal(dbOps.length, 2, "Should detect 2 Python DB operations");

    // Verify all_pensioners table linked via TOUCHES_DATABASE
    const apEntity = graph.nodes.find((n) => n.id.includes("all_pensioners"));
    assert.ok(apEntity, "all_pensioners entity should exist");
    const apTouch = graph.edges.find((e) => e.relation === "TOUCHES_DATABASE" && e.target === apEntity.id);
    assert.ok(apTouch, "Should touch all_pensioners table from f\"\"\" query");

    // Verify raw_csv_exports table linked via TOUCHES_DATABASE
    const rcEntity = graph.nodes.find((n) => n.id.includes("raw_csv_exports"));
    assert.ok(rcEntity, "raw_csv_exports entity should exist");
    const rcTouch = graph.edges.find((e) => e.relation === "TOUCHES_DATABASE" && e.target === rcEntity.id);
    assert.ok(rcTouch, "Should touch raw_csv_exports table from direct string query");
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

