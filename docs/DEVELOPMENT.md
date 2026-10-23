# Development guide

## Commands

```bash
npm install
npm run build
npm test
node dist/cli.js scan tests/fixtures/storefront --out /tmp/repopath-demo
node dist/cli.js trace GET /api/orders/{id} --index /tmp/repopath-demo/graph.json
node dist/cli.js report --format html --index /tmp/repopath-demo/graph.json
node dist/cli.js impact --index /tmp/repopath-demo/graph.json --changed api/orders.ts
node dist/cli.js drift --index /tmp/repopath-demo/graph.json
node dist/cli.js rules --index /tmp/repopath-demo/graph.json --changed api/orders.ts --config examples/repopath.rules.json
```

## Development loop

1. Add or adjust a fixture that demonstrates the relationship.
2. Extend the narrowest appropriate analyzer adapter.
3. Preserve evidence and uncertainty in the normalized graph.
4. Run `npm test` and inspect `graph.json` before expanding scope.

Do not add a relationship based on an unverified naming convention when the source does not establish it. Emit no edge, or later emit a clearly `inferred` one with its rationale.

## Testing your React application

Run RepoPath against the root that contains both the React frontend and API server, or run it separately for each repository and keep their reports distinct. RepoPath does not call your live API or store response bodies; React `fetch` and Axios call sites are statically matched to Express/FastAPI routes. To add runtime evidence, export an OpenTelemetry JSON trace from a safe local/integration-test run and pass it with `--traces`.

For OpenAPI, add `--openapi path/to/openapi.json` or a conventional YAML document whose `paths` mapping uses normal two/four-space indentation. Complex YAML constructs should be converted to JSON before import so RepoPath does not guess their meaning.
