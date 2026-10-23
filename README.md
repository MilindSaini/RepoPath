# RepoPath

RepoPath is a local-first CLI for answering: **which user-facing flows might this code affect, and what evidence supports that answer?**

RepoPath is an evidence-backed change-impact tool. It maps frontend requests, backend routes and calls, database operations, tests, contracts, and optional runtime observations—while preserving where every relationship came from.

## Quick start

```bash
npm install
npm run build
node dist/cli.js scan /path/to/application --openapi /path/to/openapi.json --traces /path/to/traces.json
node dist/cli.js impact --index /path/to/application/.repopath/graph.json --changed src/orders.ts
node dist/cli.js trace GET /api/orders/{id} --index /path/to/application/.repopath/graph.json
node dist/cli.js report --index /path/to/application/.repopath/graph.json --format html
```

`scan` writes a portable graph to `.repopath/graph.json` and a local SQLite index to `.repopath/index.sqlite` beneath the scanned repository. Pass `--out <directory>` to choose another output directory.

No new dependency is required for the implemented features. For a fresh clone, run only `npm install` before `npm run build`.

## Current support

| Input | What is detected |
| --- | --- |
| TypeScript / JavaScript | `fetch`, Axios requests, Express `app`/`router` routes, named route handlers, local function calls, common database clients, React components, and common test files |
| Python | Literal FastAPI decorators and common `requests`/`httpx`/test-client calls |
| OpenAPI | OpenAPI JSON and conventional YAML `paths` imported as contracts and compared with routes |
| OpenTelemetry | Exported JSON traces, or local HTTP/JSON receipt, imported as observed HTTP/database evidence; sensitive span attributes are never stored |

## Five-phase workflow

1. `scan` builds the evidence-backed graph.
2. `impact` traverses direct and downstream impact and safely recommends mapped tests—or the full discovered suite when mapping is incomplete.
3. `drift` compares imported OpenAPI declarations, routes, and observed traces. An unobserved endpoint is never called unused.
4. `rules` evaluates JSON policy rules; [the bundled GitHub Action](.github/actions/repopath/action.yml) publishes pull-request impact reports.
5. `query`, `history`, an interactive HTML report, and `mcp` provide local exploration, scan-history risk signals, and read-only agent queries.

`mcp` speaks newline-delimited JSON-RPC over standard input/output and exposes only the existing graph evidence.

See [the living project plan](docs/README.md) for the scope, milestones, decisions, and development workflow.
