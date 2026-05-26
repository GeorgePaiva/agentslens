#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');
const { analyzeLocalRepo, AGENT_TOOLS, fmtTok } = require('./agentlens-core');
const { version: VERSION } = require('./package.json');

// ══════════════════════════════════════
// ARG PARSER
// ══════════════════════════════════════
function parseArgs(argv) {
  const args = { paths: [], config: null, out: null, open: true, stdout: false, version: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version' || a === '-v') { args.version = true; }
    else if (a === '--open')  { args.open = true; }
    else if (a === '--no-open') { args.open = false; }
    else if (a === '--stdout'){ args.stdout = true; }
    else if ((a === '--path' || a === '-p') && argv[i + 1]) { args.paths.push(argv[++i]); }
    else if ((a === '--out'  || a === '-o') && argv[i + 1]) { args.out = argv[++i]; }
    else if ((a === '--config'|| a === '-c') && argv[i + 1]){ args.config = argv[++i]; }
    else if (!a.startsWith('-')) { args.paths.push(a); }
  }
  return args;
}

// ══════════════════════════════════════
// CONFIG FILE READER
// ══════════════════════════════════════
function loadConfig(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ══════════════════════════════════════
// RESOLVE REPOS TO SCAN
// ══════════════════════════════════════
function resolveRepos(args) {
  // Priority 1: --path flags
  if (args.paths.length > 0) {
    const repos = args.paths.map(p => ({
      path: path.resolve(p),
      name: path.basename(path.resolve(p)),
    }));
    return {
      repos,
      baselines: [],
      output: args.out || `${repos[0].name}.html`,
    };
  }

  // Priority 2: .agentlens.json
  const configFile = args.config
    ? path.resolve(args.config)
    : path.resolve('.agentlens.json');

  if (fs.existsSync(configFile)) {
    const cfg = loadConfig(configFile);
    if (cfg) {
      const configDir = path.dirname(configFile);
      const repos = (cfg.repos || [{ path: '.' }]).map(r => ({
        path: path.resolve(configDir, r.path || '.'),
        name: r.name || path.basename(path.resolve(configDir, r.path || '.')),
      }));
      return {
        repos,
        baselines: cfg.baselines || [],
        output: args.out || cfg.output || (repos.length === 1 ? `${repos[0].name}.html` : 'agentlens-report.html'),
      };
    }
  }

  // Priority 3: default — scan current directory
  const folderName = path.basename(path.resolve('.'));
  return {
    repos: [{ path: path.resolve('.'), name: folderName }],
    baselines: [],
    output: args.out || `${folderName}.html`,
  };
}

// ══════════════════════════════════════
// TERMINAL SUMMARY PRINTER
// ══════════════════════════════════════
function printSummary(results) {
  for (const r of results) {
    console.error('');
    if (!r.ok || r.noFiles) {
      console.error(`  ${r.repoName} (${r.localPath})`);
      console.error(`  └── No AI agent config files found`);
      continue;
    }

    const foundTools = AGENT_TOOLS.filter(t => r.foundByTool[t.id]);
    console.error(`  ${r.repoName} (${r.localPath})`);
    for (const tool of foundTools) {
      const tok = Math.round(r.foundByTool[tool.id].content.length / 4);
      console.error(`  ├── ${r.foundByTool[tool.id].path.padEnd(35)} ${fmtTok(tok)} tokens`);
    }
    const foundRefs  = r.uniqueRefs.filter(x => x.found);
    const missingRefs = r.uniqueRefs.filter(x => !x.found);
    if (r.uniqueRefs.length > 0) {
      console.error(`  ├── refs: ${foundRefs.length} resolved, ${missingRefs.length} missing (+${fmtTok(r.refTok)} tokens)`);
    }
    console.error(`  └── Total context: ${fmtTok(r.totalContextTokens)} tokens`);
  }
  console.error('');
}

// ══════════════════════════════════════
// REPORT OUTPUT
// ══════════════════════════════════════
function makeRepoId(repoName, index) {
  const slug = String(repoName || 'repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo';
  return `${slug}-${index + 1}`;
}

function buildReportData(results, baselines, generatedAt) {
  return {
    kind: 'agentlens-report',
    schemaVersion: 1,
    generatedAt,
    cliVersion: VERSION,
    baselines,
    repos: results.map((repo, index) => ({
      repoId: makeRepoId(repo.repoName, index),
      ...repo,
    })),
  };
}

function serializeInlineJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function resolveOutputPaths(output) {
  const rawOutput = path.resolve(output || 'agentlens-report.html');
  const parsed = path.parse(rawOutput);
  const ext = parsed.ext.toLowerCase();

  if (ext === '.json') {
    return {
      htmlPath: path.join(parsed.dir, `${parsed.name}.html`),
      jsonPath: rawOutput,
    };
  }

  if (ext === '.html' || ext === '.htm') {
    return {
      htmlPath: rawOutput,
      jsonPath: path.join(parsed.dir, `${parsed.name}.json`),
    };
  }

  return {
    htmlPath: rawOutput,
    jsonPath: `${rawOutput}.json`,
  };
}

function generateReportHtml(outputPath, bootstrapData) {
  const templatePath = path.join(__dirname, 'agentlens.html');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`agentlens.html not found at ${templatePath}`);
  }

  let html = fs.readFileSync(templatePath, 'utf8');
  const bootstrapJson = serializeInlineJson(bootstrapData);
  html = html.replace(
    '</head>',
    `<script id="agentlens-bootstrap" type="application/json">${bootstrapJson}</script>\n</head>`
  );

  fs.writeFileSync(outputPath, html, 'utf8');
}

function writeReportJson(reportData, outputPath) {
  fs.writeFileSync(outputPath, JSON.stringify(reportData, null, 2) + '\n', 'utf8');
}

// ══════════════════════════════════════
// OPEN IN BROWSER
// ══════════════════════════════════════
function openBrowser(filePath) {
  const absPath = path.resolve(filePath);
  const { execSync } = require('child_process');
  try {
    const cmd = process.platform === 'win32' ? `start "" "${absPath}"` :
                process.platform === 'darwin' ? `open "${absPath}"` :
                `xdg-open "${absPath}"`;
    execSync(cmd);
  } catch (e) { /* silently ignore */ }
}

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════
async function main() {
  const args = parseArgs(process.argv);

  if (args.version) {
    console.log(`agentlens v${VERSION}`);
    process.exit(0);
  }

  console.error('\nAgentLens — Scanning...\n');

  const { repos, baselines, output } = resolveRepos(args);
  const results = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.path)) {
      console.error(`  ⚠ Path not found: ${repo.path}`);
      continue;
    }
    process.stderr.write(`  Scanning: ${repo.name}...`);
    const result = analyzeLocalRepo(repo.path, repo.name);
    results.push(result);
    process.stderr.write(result.noFiles ? ' no agent configs found\n' : ` ${fmtTok(result.totalContextTokens)} tokens\n`);
  }

  if (!results.length) {
    console.error('  No repos to scan.\n');
    process.exit(1);
  }

  printSummary(results);

  const generatedAt = new Date().toISOString();
  const reportData = buildReportData(results, baselines, generatedAt);

  // --stdout: print JSON and exit
  if (args.stdout) {
    console.log(JSON.stringify(reportData, null, 2));
    return;
  }

  const { htmlPath, jsonPath } = resolveOutputPaths(output);
  writeReportJson(reportData, jsonPath);
  generateReportHtml(htmlPath, {
    kind: 'agentlens-bootstrap',
    schemaVersion: 1,
    defaultReportFile: path.basename(jsonPath),
  });
  const absHtmlPath = path.resolve(htmlPath);
  const fileUrl = `file://${absHtmlPath}`;
  const shortName = path.basename(htmlPath);
  const openCmd = process.platform === 'win32' ? `start ${shortName}` : `open ${shortName}`;
  console.error(`  Report saved: ${shortName}\n`);
  console.error(`  To open:  ${openCmd}`);
  console.error(`  URL:      ${fileUrl}\n`);

  if (args.open) openBrowser(htmlPath);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
