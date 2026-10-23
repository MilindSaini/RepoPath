# Product scope

## Product statement

RepoPath is a local-first, evidence-backed change-impact tool for full-stack applications. It helps developers connect frontend flows, HTTP endpoints, backend implementations, and tests without presenting a guess as a fact.

Its central question is: **which user-facing flows might my code change affect, and what test evidence covers them?**

## First release scope

The first release scans React/Next-style TypeScript or JavaScript source, Express routes, and FastAPI routes; discovers API requests; matches canonical HTTP endpoints; and links each result to the relevant source location. Common test request patterns are included as static evidence.

Runtime traces, Git change impact, OpenAPI import, database mapping, dashboards, hosted infrastructure, AI chat, and universal language support are intentionally outside this release.

## Evidence vocabulary

- **Observed** — captured from a runtime trace or test execution (not yet implemented).
- **Statically established** — found by a language or framework analyzer.
- **Inferred** — plausible but needs validation.

RepoPath preserves unknown and unresolved relationships rather than upgrading them to certainty.
