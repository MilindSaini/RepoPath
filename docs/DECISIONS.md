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
