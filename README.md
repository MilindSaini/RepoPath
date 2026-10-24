# RepoPath

RepoPath is a local-first CLI for answering: **which user-facing flows might this code affect, and what evidence supports that answer?**

RepoPath is an evidence-backed change-impact tool. It statically maps frontend requests, React rendering hierarchies and context flows, backend routes and handlers, database operations, response fields, tests, API contracts, and optional runtime observations—while preserving where every relationship came from.

## Quick start

```bash
npm install
npm run build
node dist/cli.js dashboard /path/to/application --port 3333 --open
```

Or run via CLI:

```bash
node dist/cli.js scan /path/to/application --openapi /path/to/openapi.json --traces /path/to/traces.json
node dist/cli.js impact --index /path/to/application/.repopath/graph.json --changed src/orders.ts
node dist/cli.js trace GET /api/orders/{id} --index /path/to/application/.repopath/graph.json
node dist/cli.js report --index /path/to/application/.repopath/graph.json --format interactive-html
```

`dashboard` launches a local-first interactive full-stack application map with an AI assistant, scan wizard, live source code inspector, and 5 dedicated developer views.
`scan` writes a portable graph to `.repopath/graph.json`, a local SQLite index to `.repopath/index.sqlite`, and run history to `.repopath/history.json` beneath the scanned repository. Pass `--out <directory>` to choose another output directory.

No new dependency is required for the implemented features. For a fresh clone, run only `npm install` before `npm run build`.

## Interactive Full-Stack Dashboard & AI Assistant

Launch the dashboard to visually understand the application from UI to database:

```bash
repopath dashboard [directory] [--port 3333] [--open]
```

### Multi-Folder & Multi-Repo Workspaces

RepoPath supports scanning multiple distinct folder locations at once (for example: a React frontend in one directory, an Express/FastAPI backend in another, and database schemas/microservices in a third):

- **CLI Multi-Folder Launch**:
  ```bash
  repopath dashboard /path/to/web /path/to/api /path/to/services --port 3333 --open
  # Or scan directly:
  repopath scan /path/to/web /path/to/api /path/to/services
  ```
- **Dashboard Scan Wizard**: Click **Scan Repository** → use **+ Add Folder Location** to add as many directory paths as needed. Click **Inspect All Folders** to view a per-folder breakdown of languages, detected frameworks, package managers, and file counts before scanning.
- **Unified Architecture Overview**: The dashboard renders a unified cross-service application map with a dedicated **Project Folders & Locations** summary grid, folder filter chips (`📁 All Folders`, `📁 web`, `📁 api`), and node folder badges across the interactive graph canvas, tree navigation, and details inspector.

### The 5-Step Developer Workflow

1. **Select Repository**: Inspect local directory path, automatically detecting languages, frameworks (React, Next.js, Express, FastAPI, Prisma), package managers, and Git working tree status before scanning.
2. **Review Scan Plan**: Preview scoped files, active AST analyzers, ignored directories, and potential warnings without executing repository scripts.
3. **Watch Analysis**: Real-time progress bar across 6 execution stages (Discovery, Symbol Resolution, React Analysis, API Matching, Database & Schema, Validation & SQLite Indexing).
4. **Explore the Application**: Traverse the architecture across 5 synchronized views with an interactive network graph, layer clustering, zoom/pan, and path highlighting.
5. **Ask AI & Change Impact**: Ask questions grounded in graph evidence and live source excerpts, or evaluate downstream impact before changing a function.

### The 5 Main Views

- **🏛️ Architecture Overview**: Logical grouping into Frontend, API Clients, Backend Services, and Data Layer with coverage indicators.
- **🧩 Feature Explorer**: Hierarchical component tree from page root through hooks, state providers, callbacks, and outgoing requests (`App → AuthProvider → Dashboard → fetch()`).
- **⚡ API and Data Flow**: The signature view tracing:
  `Frontend Component` → `API Request` → `Backend Route` → `Handler / Middleware` → `Service` → `Database Query` → `Table / Model`.
  Distinguishes verified links from unresolved steps with explicit evidence pills.
- **💥 Change Impact**: Select a function, field, or Git diff to visualize affected consumers, contracts, database tables, and recommended tests.
- **🤖 AI Assistant**: Dedicated panel providing component explanations, end-to-end feature path tracing, change impact predictions, and new developer onboarding guides.

### Offline Standalone Export

Export the complete interactive dashboard as a self-contained offline HTML file that opens anywhere in a browser without needing a running server:

```bash
repopath report --format interactive-html --output repopath-dashboard.html
```

## Current support

| Input | What is detected |
| --- | --- |
| TypeScript / JavaScript | `fetch`, Axios requests, Express `app`/`router` routes, Next.js App/Pages Router, named route handlers, local/imported function calls, common database clients (Prisma, SQL, Knex, etc.), React components, JSX rendering hierarchy, React Context providers/consumers, response-field consumption, and common test files |
| Python | Literal FastAPI decorators and common `requests`/`httpx`/test-client calls |
| OpenAPI | OpenAPI JSON and conventional YAML `paths` imported as contracts, declaring endpoints and response schema fields (`DECLARES_FIELD`) |
| OpenTelemetry | Exported JSON traces, or local HTTP/JSON receipt, imported as observed HTTP/database evidence; sensitive span attributes are never stored |

## Key Capabilities & Evidence Integrity

- **Canonical Relationships (No Duplicates)**: Stores canonical relationships (e.g. `file DECLARES symbol`, `App RENDERS AuthProvider`) without artificial reverse-edge inflation (`DEFINED_IN` removed; reverse navigation queried dynamically).
- **Accurate React Context Hierarchy**: Models provider components (`AuthProvider`) as function/component nodes and context objects (`AuthContext`) as context nodes. Parent components render providers (`App RENDERS AuthProvider`), providers supply context (`AuthProvider PROVIDES_CONTEXT AuthContext`), and hooks consume context (`useAuth CONSUMES_CONTEXT AuthContext`).
- **Normalized Request Identities**: Stable IDs (`request:${file}:${line}:${METHOD} ${path}`) separate path resolution from base-URL resolution and backend route matching.
- **Response-Field Mapping**: Maps client response-field access (`items`, `total`, `page`, etc.) via destructuring and property access (`READS_FIELD`, `CONSUMES_FIELD` with status `inferred`), linking to OpenAPI schema declarations (`DECLARES_FIELD` with status `statically_established`).
- **Truthful Scan Scope & Coverage**: Scans declare explicit coverage scope (`scanScope`: frontend, backend, contracts, tests, runtime traces). When tests are absent, coverage is truthfully reported as `not_analyzed` rather than claiming complete test coverage.
- **Git Commit Provenance**: Automatically captures repository commit SHA for scan provenance without stderr leakage.

## Five-phase workflow

1. `scan` builds the evidence-backed graph and records `scanScope`.
2. `impact` traverses direct and downstream impact and safely recommends mapped tests—or the full discovered suite when mapping is incomplete.
3. `drift` compares imported OpenAPI declarations, routes, and observed traces. An unobserved endpoint is never called unused.
4. `rules` evaluates JSON policy rules; [the bundled GitHub Action](.github/actions/repopath/action.yml) publishes pull-request impact reports.
5. `query`, `history`, an interactive HTML report with multi-section live search, and `mcp` provide local exploration, scan-history risk signals, and read-only agent queries.

`mcp` speaks newline-delimited JSON-RPC over standard input/output and exposes only the existing graph evidence.

See [the living project plan](docs/README.md) for the scope, milestones, decisions, and development workflow.
