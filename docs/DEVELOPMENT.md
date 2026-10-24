# Development guide

## Commands

```bash
# Build TypeScript and run full test suite (11 test suites)
npm install
npm run build
npm test

# Automated test options
node --test test/*.test.mjs
node --test --watch test/*.test.mjs

# Manual CLI verification with storefront fixture
node dist/cli.js scan tests/fixtures/storefront --out /tmp/repopath-demo
node dist/cli.js trace GET /api/orders/{id} --index /tmp/repopath-demo/graph.json
node dist/cli.js report --format html --index /tmp/repopath-demo/graph.json --output /tmp/repopath-demo/report.html
node dist/cli.js impact --index /tmp/repopath-demo/graph.json --changed api/orders.ts
node dist/cli.js drift --index /tmp/repopath-demo/graph.json
node dist/cli.js rules --index /tmp/repopath-demo/graph.json --changed api/orders.ts --config examples/repopath.rules.json

# Test React fixture (providers, contexts, response fields, normalized requests)
node dist/cli.js scan tests/fixtures/react-app --out /tmp/repopath-react
node dist/cli.js report --format html --index /tmp/repopath-react/graph.json --output /tmp/repopath-react/report.html
```

## Development loop

1. **Add or adjust a fixture**: Place regression fixtures in `tests/fixtures/` that demonstrate the target pattern (e.g. React context providers, response field destructuring, OpenAPI schema).
2. **Extend the narrowest appropriate analyzer adapter**: Keep adapters independent (`src/analyzers/typescript.ts`, `python.ts`, `openapi.ts`, `traces.ts`, `schema.ts`).
3. **Preserve evidence and uncertainty in the normalized graph**:
   - Use canonical relations (`DECLARES`); do not store reverse duplicates (`DEFINED_IN`).
   - Separate provider components (`function`) from context objects (`context`).
   - Track stable request IDs without baking `"unresolved:"` into the identifier when the URL path is known.
   - Emit `READS_FIELD` / `CONSUMES_FIELD` with `inferred` status for client property access; emit `DECLARES_FIELD` with `statically_established` status for OpenAPI response schemas.
4. **Check scan scope and risk states**: Verify `scanScope` in `history.json` faithfully reports whether frontend, backend, contracts, tests, and traces were analyzed.
5. **Run `npm test` and inspect `graph.json`**: Ensure all assertions pass before expanding scope.

Do not add a relationship based on an unverified naming convention when the source does not establish it. Emit no edge, or emit a clearly `inferred` one with its rationale.

## Testing your React application

Run RepoPath against your React project directory:

```bash
node dist/cli.js scan /path/to/my-react-app --out /tmp/my-react-scan
node dist/cli.js report --format html --index /tmp/my-react-scan/graph.json --output /tmp/my-react-scan/report.html
```

RepoPath scans source files statically without executing code or calling live APIs:
- **Component & Context Hierarchy**: Maps `App — RENDERS → Provider — PROVIDES_CONTEXT → Context ← CONSUMES_CONTEXT ← useHook`.
- **Response Fields**: Detects destructured properties and `.data.*` accesses, establishing field-level dependency tracking.
- **Truthful Scope**: For a frontend-only repository, the report reflects `backend: not_scanned` and `tests: not_analyzed`, giving accurate, uninflated risk metrics.
- **Full-Stack Projects**: Pass `--openapi path/to/openapi.json` to link frontend requests to declared endpoints and response schemas, or `--traces path/to/traces.json` to add execution evidence.
