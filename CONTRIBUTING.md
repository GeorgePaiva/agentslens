# Contributing to AgentLens

## Setup

```bash
git clone https://github.com/GeorgePaiva/agentslens.git
cd agentslens
npm install
npm test
```

Node.js >= 18 required.

## Architecture

Five files do real work — read `CLAUDE.md` for a full breakdown. The short version:

- `agentlens-core.js` — universal UMD module, no side effects, runs in Node and browser
- `cli.js` — CLI entry point, do not modify without running a smoke test
- `agentlens.html` — self-contained web app, all HTML/CSS/JS in one file
- `server.js` — HTTP REST server, delegates analysis to `agentlens-core.js`
- `db.js` — SQLite persistence via `better-sqlite3`

## Running tests

```bash
npm test
```

50 tests across two files. All must pass before opening a PR.

## Code style

- No comments anywhere — not inline, not block, not docstrings
- No external dependencies beyond `better-sqlite3`
- `agentlens-core.js` must remain a UMD module (runs in browser with no build step)

## Pull requests

- One concern per PR
- Tests must pass in CI
- Keep `agentlens-core.js` and `cli.js` changes minimal and backward-compatible
