# Five-phase delivery plan

Each phase has a working local implementation. The unchecked work is deliberately retained so the project does not overstate framework coverage or reliability.

## Phase 1 — evidence-backed cross-stack graph

- [x] TypeScript CLI, unified graph, JSON and SQLite index
- [x] React-style `fetch`/Axios requests, Express routes, local calls, and common database-client operations
- [x] Literal FastAPI routes and request calls
- [x] Source-linked endpoint trace and HTML report
- [x] Next.js App/Pages Router adapter
- [x] Imported TypeScript call resolution and Prisma/SQL schema-entity discovery
- [ ] Full Python `ast` adapter (the current adapter is deliberately literal-only)

## Phase 2 — change-impact intelligence

- [x] `impact` command accepts changed paths or a Git base diff
- [x] Traverses evidence paths and explains direct/downstream impact
- [x] Recommends mapped tests; automatically falls back to the full discovered suite when no mapping is available
- [x] Symbol-oriented Git hunk parsing, with file-level fallback for unsafe cases
- [x] Response-field consumer mapping for statically resolvable wrapper calls
- [ ] Incremental graph updates (full re-scan is retained until cross-file invalidation is proven safe)

## Phase 3 — execution evidence and drift

- [x] Import OpenTelemetry JSON HTTP/database spans
- [x] Preserve observed evidence separately from static evidence
- [x] Compare OpenAPI JSON declarations, routes, and observations with `drift`
- [x] OpenAPI JSON plus conservative YAML `paths` support
- [x] Local OTLP HTTP/JSON receiver, test-run correlation, and configurable observed-evidence staleness
- [ ] Service-span topology and native protobuf OTLP (needs a collector/protobuf implementation)

## Phase 4 — CI quality gate

- [x] JSON rules configuration and warn/review/block findings
- [x] Local composite GitHub Action and pull-request workflow
- [x] Markdown impact summary in the GitHub step summary
- [x] SARIF output from the rules engine
- [ ] Publish/version the action and prove it against a real pull request (requires repository and GitHub authority)

## Phase 5 — developer and agent intelligence

- [x] Graph query command and retained scan summaries (`history`)
- [x] Read-only newline-delimited JSON-RPC MCP server with endpoint and impact tools
- [x] Evidence-linked explanations rather than AI-invented relationships
- [x] Interactive filterable local HTML report and retained scan-history risk signals
- [ ] React/React Flow dashboard, authentication, and remote/team storage (each needs product-hosting and identity decisions)

## Acceptance benchmark

Use your React application and its API server as the benchmark fixture. Make controlled changes—a removed route, a response-field rename, a validation change, and a backend function failure—and record:

| Metric | Target question |
| --- | --- |
| Impact recall | Did RepoPath find the real consumers and tests? |
| False positives | Did it recommend unrelated files or tests? |
| Test-selection safety | Did it fall back to a broader suite whenever mapping was incomplete? |
| Evidence coverage | Can every report item point to source, contract, or trace evidence? |
