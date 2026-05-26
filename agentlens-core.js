// agentlens-core.js — shared analysis module
// Works in browser (window.AgentLensCore) and Node.js (require('./agentlens-core'))
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.AgentLensCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ══════════════════════════════════════
  // PRICING DATA (per 1M tokens, USD)
  // ══════════════════════════════════════
  const PRICING = {
    'claude-opus-4.6':       { name:'Claude Opus 4.6',      provider:'Anthropic', input:5.00,  output:25.00, cacheRead:0.50,   cacheWrite:6.25  },
    'claude-sonnet-4.6':     { name:'Claude Sonnet 4.6',     provider:'Anthropic', input:3.00,  output:15.00, cacheRead:0.30,   cacheWrite:3.75  },
    'claude-sonnet-4.5':     { name:'Claude Sonnet 4.5',     provider:'Anthropic', input:3.00,  output:15.00, cacheRead:0.30,   cacheWrite:3.75  },
    'claude-haiku-4.5':      { name:'Claude Haiku 4.5',      provider:'Anthropic', input:1.00,  output:5.00,  cacheRead:0.10,   cacheWrite:1.25  },
    'gpt-5.4':               { name:'GPT-5.4',               provider:'OpenAI',    input:2.50,  output:15.00, cacheRead:0.25,   cacheWrite:null  },
    'gpt-5.3-codex':         { name:'GPT-5.3 Codex',         provider:'OpenAI',    input:1.75,  output:14.00, cacheRead:0.175,  cacheWrite:null  },
    'cursor-composer-2':     { name:'Composer 2',            provider:'Cursor',    input:0.50,  output:2.50,  cacheRead:0.20,   cacheWrite:null  },
    'cursor-composer-2-fast':{ name:'Composer 2 Fast',       provider:'Cursor',    input:1.50,  output:7.50,  cacheRead:0.35,   cacheWrite:null  },
    'cursor-composer-1.5':   { name:'Composer 1.5',          provider:'Cursor',    input:3.50,  output:17.50, cacheRead:0.35,   cacheWrite:3.50  },
    'cursor-auto':           { name:'Cursor Auto',           provider:'Cursor',    input:1.25,  output:6.00,  cacheRead:0.25,   cacheWrite:null  },
    'gemini-2.5-pro':        { name:'Gemini 2.5 Pro',        provider:'Google',    input:1.25,  output:10.00, cacheRead:0.125,  cacheWrite:null  },
    'gemini-2.5-flash':      { name:'Gemini 2.5 Flash',      provider:'Google',    input:0.30,  output:2.50,  cacheRead:0.03,   cacheWrite:null  },
    'deepseek-v3':           { name:'DeepSeek V3',           provider:'DeepSeek',  input:0.14,  output:0.28,  cacheRead:0.014,  cacheWrite:null  },
    'deepseek-r1':           { name:'DeepSeek R1',           provider:'DeepSeek',  input:0.55,  output:2.19,  cacheRead:0.055,  cacheWrite:null  },
    'kimi-k2':               { name:'Kimi K2',               provider:'Moonshot',  input:0.60,  output:2.50,  cacheRead:0.15,   cacheWrite:null  },
    'qwen3-max':             { name:'Qwen3 Max',             provider:'Alibaba',   input:0.78,  output:3.90,  cacheRead:0.078,  cacheWrite:null  },
    'qwen3.5-plus':          { name:'Qwen3.5 Plus',          provider:'Alibaba',   input:0.26,  output:1.56,  cacheRead:0.026,  cacheWrite:null  },
    'grok-3':                { name:'Grok 3',                provider:'xAI',       input:3.00,  output:15.00, cacheRead:0.30,   cacheWrite:null  },
    'mistral-large':         { name:'Mistral Large 3',       provider:'Mistral',   input:0.50,  output:1.50,  cacheRead:null,   cacheWrite:null  },
    'mistral-medium-3':      { name:'Mistral Medium 3',      provider:'Mistral',   input:0.40,  output:2.00,  cacheRead:0.04,   cacheWrite:null  },
  };

  // ══════════════════════════════════════
  // AGENT TOOLS REGISTRY
  // ══════════════════════════════════════
  const AGENT_TOOLS = [
    { id:'codex',    name:'OpenAI Codex',   icon:'⚡', color:'#10a37f', files:['AGENTS.md','agents.md'] },
    { id:'claude',   name:'Claude Code',    icon:'🔮', color:'#d97706', files:['CLAUDE.md','CLAUDE.local.md','claude.md'] },
    { id:'cursor',   name:'Cursor',         icon:'🖱️', color:'#2563eb', files:['.cursorrules','.cursor/rules','.cursor/rules/main.mdc','.cursor/rules/default.mdc'] },
    { id:'copilot',  name:'GitHub Copilot', icon:'🐙', color:'#6d28d9', files:['.github/copilot-instructions.md'] },
    { id:'windsurf', name:'Windsurf',       icon:'🏄', color:'#0d9488', files:['.windsurfrules'] },
    { id:'aider',    name:'Aider',          icon:'🤝', color:'#db2777', files:['CONVENTIONS.md','.aider.conf.yml'] },
    { id:'devin',    name:'Devin',          icon:'🤖', color:'#7c3aed', files:['.devin/instructions.md','DEVIN.md'] },
  ];

  const TOOL_COLORS = {};
  AGENT_TOOLS.forEach(t => { TOOL_COLORS[t.id] = t.color; });

  // ══════════════════════════════════════
  // HEALTH LIMITS
  // ══════════════════════════════════════
  const HEALTH_LIMITS = {
    codex:    { ideal:3000, warn:6000,  max:8000,  note:'healthCodexWarn' },
    claude:   { ideal:2000, warn:5000,  max:20000, note:'healthClaudeWarn' },
    cursor:   { ideal:2000, warn:5000,  max:10000, note:null },
    copilot:  { ideal:1500, warn:3000,  max:5000,  note:'healthCopilotWarn' },
    windsurf: { ideal:2000, warn:5000,  max:10000, note:null },
    aider:    { ideal:2000, warn:5000,  max:10000, note:null },
    devin:    { ideal:2000, warn:5000,  max:10000, note:null },
  };

  // ══════════════════════════════════════
  // PURE UTILITIES
  // ══════════════════════════════════════
  function estimateTokens(t) { return Math.round(t.length / 4); }

  function fmtTok(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

  function fmtUSD(n) {
    return n < 0.01 ? '<$0.01' : n < 1 ? '$' + n.toFixed(3) : n < 1000 ? '$' + n.toFixed(2) : '$' + Math.round(n).toLocaleString();
  }

  function toolPill(tid) {
    const c = TOOL_COLORS[tid] || '#6b7280';
    return `style="background:${c}22;color:${c};border-radius:99px;padding:1px 7px;font-size:.67rem;font-weight:700;"`;
  }

  function healthGrade(tokens, limit) {
    const ratio = tokens / limit.warn;
    if (ratio <= 0.5) return { label:'healthLean',     color:'var(--green)',  bg:'var(--green-l)',  pct: Math.min(100, (tokens / limit.max) * 100) };
    if (ratio <= 1.0) return { label:'healthModerate', color:'var(--yellow)', bg:'var(--yellow-l)', pct: Math.min(100, (tokens / limit.max) * 100) };
    if (ratio <= 1.6) return { label:'healthHeavy',    color:'var(--orange)', bg:'var(--orange-l)', pct: Math.min(100, (tokens / limit.max) * 100) };
    return                   { label:'healthBloated',  color:'var(--red)',    bg:'var(--red-l)',    pct: 100 };
  }

  // ══════════════════════════════════════
  // REFERENCE PARSER
  // ══════════════════════════════════════
  function addR(map, raw, type) {
    const p = raw.replace(/^\.\//, '').replace(/^\//, '');
    if (!p || p.startsWith('http') || p.length > 200) return;
    if (!map.has(p)) map.set(p, { path: p, type });
  }

  function normalizeRefPath(p) {
    return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  }

  function resolveRefPath(basePath, refPath) {
    const raw = normalizeRefPath(refPath);
    if (!raw) return '';
    if (!raw.startsWith('.')) return raw;
    const baseParts = normalizeRefPath(basePath).split('/').filter(Boolean);
    if (baseParts.length) baseParts.pop();
    for (const part of raw.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (baseParts.length) baseParts.pop();
        continue;
      }
      baseParts.push(part);
    }
    return baseParts.join('/');
  }

  function shouldParseNestedRefs(p) {
    return /\.(md|mdx|txt|json|ya?ml|toml|ini|cfg|conf)$/i.test(normalizeRefPath(p));
  }

  function calcToolViewTokens(foundByTool, uniqueRefs) {
    const totals = {};
    for (const [toolId, file] of Object.entries(foundByTool || {})) {
      let total = estimateTokens(file.content || '');
      for (const ref of uniqueRefs || []) {
        if (ref.found && ref.fromTools && ref.fromTools.includes(toolId)) total += ref.tokens || 0;
      }
      totals[toolId] = total;
    }
    return totals;
  }

  function calcMaxToolViewTokens(foundByTool, uniqueRefs) {
    const totals = Object.values(calcToolViewTokens(foundByTool, uniqueRefs));
    return totals.length ? Math.max(...totals) : 0;
  }

  function calcAllContextTokens(foundByTool, uniqueRefs) {
    const seen = new Set();
    let total = 0;
    for (const file of Object.values(foundByTool || {})) {
      const path = normalizeRefPath(file && file.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      total += estimateTokens(file.content || '');
    }
    for (const ref of uniqueRefs || []) {
      const path = normalizeRefPath(ref && ref.path);
      if (!ref.found || !path || seen.has(path)) continue;
      seen.add(path);
      total += ref.tokens || 0;
    }
    return total;
  }

  function calcRefTok(uniqueRefs) {
    return (uniqueRefs || []).filter(r => r.found).reduce((s, r) => s + r.tokens, 0);
  }

  function buildRefGraph(foundByTool, loadRef) {
    const refPool = new Map();
    const parsedCache = new Map();
    const queue = [];

    function enqueue(toolId, basePath, ref) {
      const resolvedPath = resolveRefPath(basePath, ref.path);
      if (!resolvedPath) return;
      if (!refPool.has(resolvedPath)) {
        refPool.set(resolvedPath, { path: resolvedPath, type: ref.type, fromTools: [toolId], found: false, content: null, tokens: 0 });
        queue.push({ toolId, path: resolvedPath });
        return;
      }
      const existing = refPool.get(resolvedPath);
      if (!existing.fromTools.includes(toolId)) {
        existing.fromTools.push(toolId);
        queue.push({ toolId, path: resolvedPath });
      }
    }

    for (const [toolId, file] of Object.entries(foundByTool || {})) {
      for (const ref of parseReferences(file.content || '')) enqueue(toolId, file.path, ref);
    }

    while (queue.length) {
      const current = queue.shift();
      const entry = refPool.get(current.path);
      if (!entry) continue;
      if (!entry.found && entry.content == null) {
        const loaded = loadRef(current.path);
        if (loaded && loaded.found) {
          entry.found = true;
          entry.content = loaded.content;
          entry.tokens = estimateTokens(loaded.content);
        } else {
          entry.found = false;
          entry.content = null;
          entry.tokens = 0;
        }
      }
      if (!entry.found || !entry.content || !shouldParseNestedRefs(entry.path)) continue;
      if (!parsedCache.has(entry.path)) parsedCache.set(entry.path, parseReferences(entry.content));
      for (const ref of parsedCache.get(entry.path)) enqueue(current.toolId, entry.path, ref);
    }
    return Array.from(refPool.values());
  }

  function parseReferences(content) {
    const found = new Map();
    for (const line of content.split('\n')) {
      const t = line.trim();
      let m = t.match(/^@import\s+["']?([^\s"']+)["']?/);
      if (m) { addR(found, m[1], 'import'); continue; }
      m = t.match(/^[!]?include[:\s]+["']?([^\s"']+\.[a-zA-Z0-9]+)["']?/i);
      if (m) { addR(found, m[1], 'include'); continue; }
      m = t.match(/^@(?:file\s+)?([^\s@#(:{]+\.[a-zA-Z0-9]+)/);
      if (m && !m[1].startsWith('http')) { addR(found, m[1], 'ref'); continue; }
      const lr = /\[([^\]]*)\]\(([^)]+)\)/g; let lm;
      while ((lm = lr.exec(line)) !== null) {
        const h = lm[2].split('#')[0].trim();
        if (h && !h.startsWith('http') && !h.startsWith('mailto') && h.includes('.')) addR(found, h, 'link');
      }
      m = t.match(/^context[_-]?files?:\s*\[([^\]]+)\]/i);
      if (m) { m[1].split(',').forEach(f => { const p = f.trim().replace(/["']/g, ''); if (p) addR(found, p, 'context'); }); continue; }
    }
    return Array.from(found.values());
  }

  function gitPatternToRegex(pattern, anchored) {
    let r = '';
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '*' && pattern[i + 1] === '*') {
        r += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else if (c === '*') {
        r += '[^/]*';
      } else if (c === '?') {
        r += '[^/]';
      } else if (/[.+^${}()|[\]\\]/.test(c)) {
        r += '\\' + c;
      } else {
        r += c;
      }
    }
    return anchored
      ? new RegExp('^' + r + '(/.*)?$')
      : new RegExp('(^|/)' + r + '(/.*)?$');
  }

  // ══════════════════════════════════════
  // LOCAL REPO ANALYZER (Node.js only)
  // Uses lazy require() — never executed in browser
  // Returns fromTools as Array (JSON-serializable)
  // ══════════════════════════════════════
  function analyzeLocalRepo(repoPath, repoName) {
    const fs   = require('fs');
    const path = require('path');

    const MAX_FILE_BYTES = 512 * 1024;
    const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '__pycache__', '.cache']);
    const abs = p => path.resolve(repoPath, p);

    const gitignorePatterns = [];
    try {
      const giContent = fs.readFileSync(abs('.gitignore'), 'utf8');
      for (const line of giContent.split('\n')) {
        let p = line.trim();
        if (!p || p.startsWith('#')) continue;
        const negate = p.startsWith('!');
        if (negate) p = p.slice(1);
        const anchored = p.startsWith('/');
        if (anchored) p = p.slice(1);
        if (p.endsWith('/')) p = p.slice(0, -1);
        if (!p) continue;
        gitignorePatterns.push({ negate, anchored, pattern: p });
      }
    } catch (e) {}

    function isGitignored(relPath) {
      if (!gitignorePatterns.length) return false;
      let ignored = false;
      for (const { negate, anchored, pattern } of gitignorePatterns) {
        if (gitPatternToRegex(pattern, anchored).test(relPath)) ignored = !negate;
      }
      return ignored;
    }

    // Normalize path to forward slashes (cross-platform)
    const norm = p => p.replace(/\\/g, '/');

    function readFileCapped(filePath) {
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return null;
        if (stat.size > MAX_FILE_BYTES) {
          const buf = Buffer.alloc(MAX_FILE_BYTES);
          const fd = fs.openSync(filePath, 'r');
          fs.readSync(fd, buf, 0, MAX_FILE_BYTES, 0);
          fs.closeSync(fd);
          return buf.toString('utf8') + '\n\n[...file truncated at 512KB by agentlens...]';
        }
        return fs.readFileSync(filePath, 'utf8');
      } catch (e) { return null; }
    }

    // Collect agent config files
    const foundByTool = {};
    for (const tool of AGENT_TOOLS) {
      for (const filePath of tool.files) {
        const fullPath = abs(filePath);
        if (!foundByTool[tool.id] && fs.existsSync(fullPath)) {
          const content = readFileCapped(fullPath);
          if (content !== null) {
            foundByTool[tool.id] = { path: norm(filePath), content };
            break;
          }
        }
      }
    }

    const foundTools = AGENT_TOOLS.filter(t => foundByTool[t.id]);
    if (!foundTools.length) {
      return { ok: true, repoName, localPath: norm(repoPath), foundByTool: {}, uniqueRefs: [], agentTok: 0, refTok: 0, totalContextTokens: 0, noFiles: true };
    }

    const uniqueRefs = buildRefGraph(foundByTool, refPath => {
      if (isGitignored(norm(refPath))) return { found: false, content: null };
      const resolved = path.resolve(repoPath, refPath);
      const content = readFileCapped(resolved);
      if (content === null) return { found: false, content: null };
      return { found: true, content };
    });

    const agentTok = foundTools.reduce((s, t) => s + estimateTokens(foundByTool[t.id].content), 0);
    const refTok   = calcRefTok(uniqueRefs);
    const viewTokensByTool = calcToolViewTokens(foundByTool, uniqueRefs);
    const allContextTokens = calcAllContextTokens(foundByTool, uniqueRefs);

    return {
      ok: true,
      repoName,
      localPath: norm(repoPath),
      foundByTool,
      uniqueRefs,
      agentTok,
      refTok,
      viewTokensByTool,
      allContextTokens,
      totalContextTokens: calcMaxToolViewTokens(foundByTool, uniqueRefs),
      noFiles: false,
    };
  }

  return {
    PRICING,
    AGENT_TOOLS,
    TOOL_COLORS,
    HEALTH_LIMITS,
    estimateTokens,
    fmtTok,
    fmtUSD,
    toolPill,
    healthGrade,
    parseReferences,
    analyzeLocalRepo,
  };
}));
