# RepoPath project notebook

This directory is the durable source of truth for continuing development. Update the roadmap and decision log in the same change as a material implementation decision.

| Document | Purpose |
| --- | --- |
| [Product scope](PRODUCT.md) | Problem, users, promise, and non-goals |
| [Architecture](ARCHITECTURE.md) | Evidence graph and component boundaries |
| [Roadmap](ROADMAP.md) | Deliverables and acceptance criteria |
| [Decisions](DECISIONS.md) | Decisions that should not be rediscovered later |
| [Development guide](DEVELOPMENT.md) | Setup, validation, and contribution loop |

## Status

**Five-phase local workflow implemented with evidence integrity hardening.** The scanner, impact/test selection, contract and trace import, response-field analysis, CI rule/action scaffold, query/history, interactive multi-section filterable HTML report, and read-only MCP server are fully functional.

Recent correctness milestones:
- **Canonical Fact Deduplication**: Storing canonical relationships (`DECLARES`) without reverse-edge duplication (`DEFINED_IN`), reporting both raw edges and canonical fact counts.
- **Strict React Provider & Context Semantics**: Separating provider components (`function`) from context objects (`context`), correctly modeling `App — RENDERS → AuthProvider — PROVIDES_CONTEXT → AuthContext ← CONSUMES_CONTEXT ← useAuth`.
- **Stable Request Identities**: Eliminating `"unresolved:"` path prefixes for resolved URLs and isolating origin resolution from path resolution.
- **Response-Field Mapping**: Mapping destructured and property-accessed fields (`READS_FIELD`, `CONSUMES_FIELD` with `inferred` status) and OpenAPI response schema fields (`DECLARES_FIELD` with `statically_established` status).
- **Truthful Scan Scope**: Reporting explicit `scanScope` (frontend, backend, contracts, tests, runtime traces) and distinguishing `complete`, `partial`, and `not_analyzed` coverage states.
- **Git Commit Provenance**: Capturing commit SHAs for auditable evidence without stderr leaks.

## Checking a React application

From the RepoPath repository, build the CLI once:

```bash
npm install
npm run build
```

Scan a React application by passing its project directory:

```bash
node dist/cli.js scan /path/to/my-react-app
```

The scan reads `.js`, `.jsx`, `.ts`, and `.tsx` source files. It detects React-style component declarations, JSX component rendering, callback props, `createContext()` declarations, context providers and `useContext` consumers, response-field consumption (`res.data.items`, destructuring), `fetch` and Axios requests, local function calls, and supported test files. It does not run the application or make live HTTP requests.

The command writes these files inside the React project:

```text
/path/to/my-react-app/.repopath/graph.json
/path/to/my-react-app/.repopath/index.sqlite
/path/to/my-react-app/.repopath/history.json
```

Generate and open the HTML report:

```bash
node dist/cli.js report \
  --index /path/to/my-react-app/.repopath/graph.json \
  --output /path/to/my-react-app/.repopath/report.html
```

The generated report features live filtering across all sections (endpoints, component paths, unresolved calls, response fields, scan scope, and the evidence table) and cleanly separates:
- **Backend routes found** (e.g. 0 when scanning a frontend repository alone)
- **Outgoing API requests** (e.g. 4 discovered requests)
- **Unresolved request URLs** (e.g. 1 dynamic URL without a statically resolvable path)
- **API response fields** (e.g. 14 fields read by frontend components)
- **Relationships and canonical facts** (raw stored edges vs distinct facts)

Inspect API routes, components, or requests from the command line:

```bash
node dist/cli.js query --kind api_route --index /path/to/my-react-app/.repopath/graph.json
node dist/cli.js query --kind function --search Dashboard --index /path/to/my-react-app/.repopath/graph.json
node dist/cli.js trace GET /api/orders/{id} --index /path/to/my-react-app/.repopath/graph.json
```

For a full-stack repository, scan the directory containing both the React frontend and the backend:

```bash
node dist/cli.js scan /path/to/full-stack-app \
  --openapi /path/to/full-stack-app/openapi.json
```

This connects frontend requests to backend routes when the route is found in the scanned source or declared by an imported OpenAPI contract. If the React app is separate from the backend, scan them separately; the `scanScope` will accurately reflect `backend: not_scanned` and `tests: not_analyzed`, preventing zero-risk misinterpretations.

To check what may be affected by a change:

```bash
node dist/cli.js impact \
  --index /path/to/my-react-app/.repopath/graph.json \
  --changed src/components/Orders.tsx
```

If runtime evidence is available as exported OpenTelemetry JSON, include it during scanning:

```bash
node dist/cli.js scan /path/to/my-react-app \
  --traces /path/to/traces.json
```

The report keeps static relationships, unresolved relationships, and runtime-observed relationships separate. A successful scan is evidence about source structure; it is not a substitute for running the React application or its test suite.
