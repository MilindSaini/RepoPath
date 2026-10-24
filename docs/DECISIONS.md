# Decision log

## 2026-10-22 — local TypeScript CLI first

The CLI orchestrates analyzers and reports. It gives the product a small, testable distribution surface before a dashboard or hosted service.

## 2026-10-22 — evidence is first-class

Every edge retains its source file, line, analyzer, status, confidence, and scan revision. The UI and future impact engine must not collapse static, observed, and inferred evidence into one claim.

## 2026-10-22 — adapters over framework-specific core logic

Each language/framework analyzer produces normalized nodes and edges. Adding NestJS, Fastify, Flask, or Next.js should add an adapter, not fork storage or reporting.

## 2026-10-22 — SQLite plus JSON

SQLite supports local queries and future incremental scanning. JSON makes a scan auditable and easy to attach to bug reports. Neither implies a hosted graph database.

## 2026-10-22 — conservative test selection

If graph traversal cannot reach a mapped test, RepoPath recommends every discovered test rather than silently narrowing the test run. This favors correctness over CI speed.

## 2026-10-22 — runtime traces are imported evidence

The first runtime implementation imports exported OpenTelemetry JSON. RepoPath retains identifiers and timing metadata, but not raw request bodies, credentials, or SQL parameters. It does not infer that an unobserved endpoint is unused.

## 2026-10-22 — request and route identities stay separate

Client requests, server route declarations, and static assets are distinct node kinds. A request only targets a route when a source declaration or imported contract supports the mapping; unresolved requests remain visible without inventing a backend route. React declarations likewise keep one canonical function identity and expose component, hook, and provider attributes.

## 2026-10-22 — canonical relationships over bidirectional duplication

Relationships are stored in one canonical direction (for example, `file DECLARES symbol`, `App RENDERS AuthProvider`). Redundant inverse edges such as `DEFINED_IN` are eliminated from graph storage to prevent artificial relationship inflation (e.g. counting 202 raw edges when only 149 distinct facts exist). Reverse queries are resolved dynamically by querying incoming edges in the graph or SQLite index.

## 2026-10-22 — provider components and context objects are separate entities

Provider components (e.g. `AuthProvider`) have a `function` node identity (`attributes: { isReactComponent: true, isProvider: true }`), while React context objects (e.g. `AuthContext`) are distinct `context` nodes created via `createContext()`. The component hierarchy is represented as `App — RENDERS → AuthProvider`, while the provider's relationship to its context is `AuthProvider — PROVIDES_CONTEXT → AuthContext`. Consumer hooks are connected via `useAuth — CONSUMES_CONTEXT → AuthContext`. Parent components rendering providers are never labeled as context providers.

## 2026-10-22 — stable request identities with explicit resolution attributes

Request IDs derive strictly from the normalized HTTP method and canonical path (`request:${file}:${line}:${METHOD} ${path}`). Node IDs do not embed `"unresolved:"` prefixes when the URL path itself is statically resolved. Path resolution (`pathResolution: "resolved" | "unresolved"`) and origin/backend route matching (`originResolution: "matched" | "unknown" | "unresolved"`) are preserved in node attributes and edge evidence.

## 2026-10-22 — honest scan scope and test coverage states

Zero detected tests or zero backend routes must not be conflated with verified zero-risk findings. Scans declare an explicit `scanScope` (`frontend`, `backend`, `apiContracts`, `tests`, `runtimeTraces`) with distinct coverage states (`complete`, `partial`, `not_scanned`, `not_analyzed`, `not_configured`, `not_imported`). Test coverage is only reported as `"complete"` when tests are actually discovered and verified; otherwise it is recorded as `"not_analyzed"`.

## 2026-10-22 — response fields connect client consumers to schemas

Field consumption is tracked at property level (`items`, `total`, `page`, etc.) from client destructuring and property access (`res.data.field`, `data.field`), generating `api_field` nodes with `READS_FIELD` and `CONSUMES_FIELD` relationships marked as `status: "inferred"`. OpenAPI operations extract response schema properties as `api_field` nodes with `DECLARES_FIELD` relationships marked as `status: "statically_established"`. Both point to the same field identity (`field:${endpoint}:${name}`), linking frontend consumers directly to contract schemas.

## 2026-10-25 — progressive disclosure, evidence statuses & synchronized 3-pane inspector

1. **Progressive Disclosure (Eliminating Graph Overload)**: Center canvas supports three discrete zoom/detail levels:
   - Level 1 (System Architecture): Grouped full-stack tier cards (`Frontend Tier`, `API Client Layer`, `Backend Services`, `Data Layer`, `Tests`) with inter-tier pipeline flow pipes.
   - Level 2 (Modules View): Columnar module structure grouped by directory and layer with relation-type filtering.
   - Level 3 (Dependencies View): Isolated execution/dependency neighborhood centered on the selected node (`graphHops` callers on left, selected entity center, callees on right), with `+ Expand` / `− Collapse` controls.
2. **Differentiated Evidence Badges**: Replaced blanket `VERIFIED` badges with truthful evidence status badges (`● Static Match`, `● Runtime Observed`, `● Inferred`, `⚠ Unresolved`) in API flows and the inspector.
3. **Synchronized 3-Pane Inspector**: Centralized selection state synchronizes the Left Explorer, Center Canvas, API Flow, and Right Inspector (`Selected entity`, `Purpose`, `Source location`, `Incoming links`, `Outgoing links`, `Evidence`, `Impact`). Selecting any flow or step immediately inspects that entity and loads live source code.
4. **Source Mapping Across Multi-Roots**: Multi-folder scanning resolves file excerpts across arbitrary workspace roots by stripping matching directory prefixes and querying common parents safely.
5. **Structured AI Onboarding Output**: Formatted onboarding guides into 4 standardized sections (`What this application does`, `Where to start`, `How data flows`, `What remains unknown & gaps`) plus `How to Safely Make Changes`, with warning/info alert callouts and clickable source/symbol pills.
6. **Semantic Typing for Scripts**: Non-JSX browser scripts (e.g. `public/js/mapHandler.js`) are classified as `client_script` rather than React `ui_component`.
