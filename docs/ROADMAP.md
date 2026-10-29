# Five-phase delivery plan

Each phase has a working local implementation. The unchecked work is deliberately retained so the project does not overstate framework coverage or reliability.

## Phase 1 — evidence-backed cross-stack graph

- [x] TypeScript CLI, unified graph, JSON and SQLite index
- [x] React-style `fetch`/Axios requests, Express routes, local calls, and common database-client operations
- [x] Literal FastAPI routes and request calls
- [x] Source-linked endpoint trace and HTML report with live multi-section search filtering
- [x] Next.js App/Pages Router adapter
- [x] Imported TypeScript call resolution and Prisma/SQL schema-entity discovery
- [x] Canonical fact deduplication (single `DECLARES` edge, dynamic reverse queries, no redundant `DEFINED_IN`)
- [x] Strict React Context and Provider semantics (provider components as `function`, context objects as `context`, `App — RENDERS → AuthProvider — PROVIDES_CONTEXT → AuthContext ← CONSUMES_CONTEXT ← useAuth`)
- [x] Normalized request identities with explicit `pathResolution` and `originResolution` attributes
- [x] Git revision commit tracking in scan metadata
- [ ] Full Python `ast` adapter (the current adapter is deliberately literal-only)

## Phase 2 — change-impact intelligence

- [x] `impact` command accepts changed paths or a Git base diff
- [x] Traverses evidence paths and explains direct/downstream impact
- [x] Recommends mapped tests; automatically falls back to the full discovered suite when no mapping is available
- [x] Symbol-oriented Git hunk parsing, with file-level fallback for unsafe cases
- [x] Response-field consumer mapping for client destructuring and property access (`READS_FIELD`, `CONSUMES_FIELD`)
- [x] OpenAPI response schema property mapping to endpoints (`DECLARES_FIELD`)
- [x] Truthful scan scope (`scanScope`) and coverage states (`complete`, `partial`, `not_analyzed`)
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
- [x] Interactive full-stack dashboard (Architecture Overview, Feature Explorer, API & Data Flow, Change Impact, AI Assistant)
- [x] Local Node.js service (`repopath dashboard`) with repository detection, scan plan preview, and background job progress
- [x] Grounded AI Assistant engine with source excerpt citations and explicit uncertainty handling
- [x] Standalone offline interactive HTML export (`repopath report --format interactive-html`)
- [x] Guided/expert dashboard mode with project brief and progressive disclosure
- [x] Safe canonical source-root resolution and explicit missing/stale source states
- [x] Architecture health checks and API contract explorer
- [x] Evidence retrieval and generated architecture documentation with Mermaid flows
- [x] API Intelligence Explorer with operation catalog, resolution filters, source-linked implementation details, consumers, data dependencies, tests, and runtime/change evidence states
- [ ] Remote team storage and hosted enterprise SSO (future milestone)

## Acceptance benchmark

Use your React application and its API server as the benchmark fixture. Make controlled changes—a removed route, a response-field rename, a validation change, and a backend function failure—and record:

| Metric | Target question |
| --- | --- |
| Impact recall | Did RepoPath find the real consumers and tests? |
| False positives | Did it recommend unrelated files or tests? |
| Test-selection safety | Did it fall back to a broader suite whenever mapping was incomplete? |
| Evidence coverage | Can every report item point to source, contract, or trace evidence? |

## API Intelligence benchmark

The DLC benchmark scan covers three coordinated applications:
`nl2sql/NL2SQL API Code`, `DLCFrontend/DLCPension`, and `DLCBackendV2/DLCServer`.
The resulting graph contains 934 nodes and 1,195 evidence-backed edges, including
63 API routes, 50 client requests, 152 API fields, 77 database operations,
17 database entities, 476 functions, and 1 discovered test. The API Explorer
keeps 1,008 statically established, 175 inferred, and 12 unresolved edges
distinct, and reports missing contracts and runtime traces explicitly.
