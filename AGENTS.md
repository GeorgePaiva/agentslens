# AGENTS.md

This file provides guidance to AI coding agents (OpenAI Codex, etc.) when working with code in this repository.

## Rules

- Never add comments to any code in this project — no inline comments, no block comments, no docstrings, nothing.

## Commands

```bash
node cli.js
node cli.js /path/to/repo
node cli.js --path . --path ../other-repo
node cli.js --stdout
node cli.js --no-open
node cli.js --version

node server.js
PORT=4000 node server.js

npm test

node --test test/core.test.js
node --test test/api.test.js

node cli.js --stdout | node -e "process.stdin.resume()"

npm exec --yes --force --package . agentlens -- --version

npm link
agentlens --version
```

## Architecture

Five files do real work:

**`agentlens-core.js`** — Universal UMD module. Runs in both Node.js (`require()`) and the browser (`window.AgentLensCore`). Contains:
- `AGENT_TOOLS` registry: 7 supported tools (Claude, Codex, Cursor, Copilot, Windsurf, Aider, Devin) and which config files each uses
- `PRICING` table: token costs per model across 20+ LLMs
- `HEALTH_LIMITS`: per-tool ideal/warn/max token thresholds used to grade context size
- `parseReferences(content)`: extracts file references from `@import`, `!include`, `@file`, markdown links, and `context_files:` arrays
- `buildRefGraph(foundByTool, loadRef)`: BFS that resolves all referenced files transitively, deduplicates, and assigns `fromTools`
- `analyzeLocalRepo(localPath, name)`: Node.js-only; walks the filesystem, respects `.gitignore`, caps files at 512 KB, returns a structured result object
- Token estimation uses `length / 4`

**`cli.js`** — CLI entry point. Parses args, loads `.agentlens.json` config, calls `analyzeLocalRepo`, writes `<name>.html` and `<name>.json`.

**`agentlens.html`** — Complete web app and HTML report viewer in a single self-contained file. The CLI injects a bootstrap `<script id="agentlens-bootstrap">` tag into a copy of this template. Supports live GitHub repo loading, a Compare tab, and an EN/PT language toggle.

**`server.js`** — Zero-framework HTTP server wrapping `analyzeLocalRepo` behind a REST API, persisting to SQLite via `db.js`:
- `POST /analyze` — `{ path, name? }` → runs analysis, saves to DB, returns result with `id`
- `GET /history` — list all saved analyses (metadata only)
- `GET /history/:id` — full analysis result
- `DELETE /history/:id` — remove a saved analysis

**`db.js`** — SQLite persistence via `better-sqlite3`. DB path defaults to `agentlens-history.db` in cwd; override with `AGENTLENS_DB` env var. Tests use a temp file cleaned up in `after()`.

### Report data flow

```
analyzeLocalRepo() → result object
  → buildReportData() → reportData (<name>.json)
  → inject bootstrap tag into agentlens.html → <name>.html
```

### Config resolution priority in CLI

1. `--path` flags (skips config file)
2. `.agentlens.json` in cwd (or `--config` path)
3. Default: scan current directory

The `baselines` field in `.agentlens.json` lists GitHub repos used as reference points in the Compare tab.

## Publishing

```bash
npm publish
```

The `files` field in `package.json` controls what gets published: `agentlens.html`, `agentlens-core.js`, `cli.js`, `db.js`, `server.js`, and `.agentlens.example.json`.
