# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the CLI locally
node cli.js
node cli.js /path/to/repo
node cli.js --path . --path ../other-repo
node cli.js --stdout   # print JSON to stdout
node cli.js --version

# Test the npm-published version locally
npm exec --yes --force --package . agentlens -- --version

# Install globally for local development
npm link
agentlens --version
```

There are no automated tests. Smoke-test changes by running `node cli.js` on this repo itself.

## Architecture

This is a zero-dependency Node.js CLI + standalone HTML web app. The project has three files that do real work:

**`agentlens-core.js`** — Universal UMD module. Runs in both Node.js (`require()`) and the browser (`window.AgentLensCore`). Contains:
- `AGENT_TOOLS` registry: the 7 supported tools and which files each uses
- `PRICING` table: token costs per model across 20+ LLMs
- `HEALTH_LIMITS`: per-tool ideal/warn/max token thresholds
- `parseReferences(content)`: extracts file references from `@import`, `!include`, markdown links, and inline code paths
- `analyzeLocalRepo(localPath, name)`: Node.js-only function that walks the filesystem, finds agent config files, resolves all referenced files, deduplicates them, counts tokens, and returns a structured result object
- `analyzeGitHubRepo(owner, repo, token)`: browser-only function that does the same via the GitHub API

**`cli.js`** — CLI entry point. Parses args, loads `.agentlens.json` config, calls `analyzeLocalRepo`, builds a report data object, writes two sibling output files: `agentlens-report.html` and `agentlens-report.json`.

**`agentlens.html`** — The complete web app and HTML report viewer in a single self-contained file. When the CLI generates a report, it injects a bootstrap `<script>` tag into a copy of this template pointing to the sibling JSON file. The viewer also supports loading public GitHub repos live via the GitHub API, the Compare tab for multi-repo comparison, and an English/Portuguese language toggle.

### Report data flow

```
analyzeLocalRepo() → result object
  → buildReportData() → reportData (agentlens-report.json)
  → inject bootstrap tag into agentlens.html → agentlens-report.html
```

The HTML viewer reads the sibling JSON on load, then renders everything client-side.

### Config resolution priority in CLI

1. `--path` flags (skips config file)
2. `.agentlens.json` in current directory (or `--config` path)
3. Default: scan current directory

## Publishing

```bash
npm publish
```

The `files` field in `package.json` controls what gets published: `agentlens.html`, `agentlens-core.js`, `cli.js`, and `.agentlens.example.json`.
