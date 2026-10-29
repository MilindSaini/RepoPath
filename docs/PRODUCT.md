# Product scope

## Product statement

RepoPath is a local-first, evidence-backed change-impact tool for full-stack applications. It helps developers connect frontend flows, HTTP endpoints, backend implementations, and tests without presenting a guess as a fact.

Its central question is: **which user-facing flows might my code change affect, and what test evidence covers them?**

## Core product promise

RepoPath answers: **which user-facing flows might my code change affect, and what evidence supports that answer?**

It distinguishes itself from heuristic linters and code graphs through strict **evidence honesty**:
1. **Never guess a connection**: Plausible but unverified links are labeled `inferred`, never promoted to fact.
2. **Never hide absence**: An unperformed check (e.g. backend not scanned or tests not analyzed) is never reported as zero risk or 100% coverage.
3. **No relationship duplication**: Stored facts reflect independent code relationships, not inflated bidirectional mirror edges.
4. **Source provenance**: Every relationship, response field, and endpoint link points to its exact source file, line number, or trace ID.

## Implemented scope

RepoPath provides a local-first, five-phase workflow:
- **Static code graph**: Scans TypeScript/JavaScript (React, Next.js, Express) and Python (FastAPI). Models components, context providers/consumers, routes, local/imported calls, database clients, and response fields.
- **Contract & schema integration**: Imports OpenAPI JSON/YAML operations and response schema fields (`DECLARES_FIELD`); maps Prisma/SQL schema entities.
- **Execution evidence**: Imports OpenTelemetry JSON traces for observed HTTP requests, joined database queries, and test correlations without storing credentials or payload bodies.
- **Change impact intelligence**: Traverses direct and downstream impacts from changed files or Git base diffs, safely recommending mapped tests (or conservative full-suite fallback).
- **Quality gate & developer tooling**: Evaluates JSON policy rules, generates GitHub Actions PR markdown summaries, provides an interactive filterable HTML report, local queries, history tracking, and a read-only MCP server.
- **Guided intelligence surfaces**: Provides a project brief, guided/expert dashboard modes, source navigation with safe multi-root resolution, architecture health checks, API contract exploration, evidence retrieval, and generated Mermaid architecture documentation.
- **API Intelligence Explorer**: Provides a searchable operation catalog with matched, unresolved, external, static-asset, missing-contract, and untested states. Each operation links route/request/handler evidence to response fields, data dependencies, consumers, tests, runtime coverage, and change-impact guidance.

Universal language support, hosted team storage, and autonomous code modification remain intentionally outside current scope.

## Evidence vocabulary

- **Observed** — captured from an imported runtime trace or test execution span.
- **Statically established** — statically verified by the TypeScript compiler, AST, OpenAPI parser, or schema analyzer.
- **Inferred** — derived from client property access, destructuring, or naming conventions; plausible but unverified by an explicit schema or type declaration.
- **Unresolved** — identified as an external or dynamic call whose target cannot be statically determined.
- **Stale** — previously observed evidence exceeding the configured freshness window.

RepoPath preserves unknown and unresolved relationships rather than upgrading them to certainty.
