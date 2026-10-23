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

**Five-phase local workflow implemented.** The scanner, impact/test selection, contract and trace import, CI rule/action scaffold, query/history, and read-only MCP server are available. [The roadmap](ROADMAP.md) distinguishes those working slices from the framework integrations and production hardening still needed.

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

The scan reads `.js`, `.jsx`, `.ts`, and `.tsx` source files. It detects React-style component declarations, JSX component rendering, callback props, `useContext` usage, `fetch` and Axios requests, local function calls, and supported test files. It does not run the application or make live HTTP requests.

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

This can connect a frontend request to a backend route only when the route is found in the scanned source or declared by the imported OpenAPI contract. If the React app is separate from the backend, scan them separately and do not interpret an unresolved client request as proof that the backend route is missing.

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
