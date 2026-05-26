# AgentLens — API REST, SQLite e Testes — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar testes automatizados com `node:test`, uma API REST HTTP com histórico em SQLite, e um README simplificado — sem tocar em `agentlens-core.js` ou `cli.js`.

**Architecture:** `db.js` isola o SQLite; `server.js` serve a API HTTP nativa e delega análise para `analyzeLocalRepo`; `test/core.test.js` testa o core existente; `test/api.test.js` faz testes de integração subindo o servidor em porta aleatória.

**Tech Stack:** Node.js ≥ 18, `node:test`, `node:assert/strict`, `better-sqlite3`, `http` nativo.

---

## Mapeamento de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json` | Modificar | Adicionar `better-sqlite3`, script `test` |
| `db.js` | Criar | Init SQLite, CRUD de análises |
| `server.js` | Criar | API HTTP nativa (4 endpoints) |
| `test/core.test.js` | Criar | Testes unitários do agentlens-core.js |
| `test/api.test.js` | Criar | Testes de integração da API |
| `README.md` | Modificar | Três seções: App, CLI, Servidor |

---

## Task 1: Setup — dependências e script de testes

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Adicionar better-sqlite3 e script test ao package.json**

Substituir o bloco `"scripts"` e adicionar `"dependencies"` em `package.json`:

```json
"scripts": {
  "start": "node cli.js",
  "smoke:npx": "npm exec --yes --force --package . agentlens -- --version",
  "test": "node --test test/*.test.js",
  "server": "node server.js"
},
"dependencies": {
  "better-sqlite3": "^9.4.3"
},
```

- [ ] **Step 2: Instalar dependência**

```bash
npm install
```

Expected: `package-lock.json` criado/atualizado, pasta `node_modules/better-sqlite3` presente.

- [ ] **Step 3: Criar diretório de testes**

```bash
mkdir -p test
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3 and test script"
```

---

## Task 2: Testes unitários do core

**Files:**
- Create: `test/core.test.js`

- [ ] **Step 1: Criar test/core.test.js**

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  AGENT_TOOLS,
  PRICING,
  HEALTH_LIMITS,
  parseReferences,
  analyzeLocalRepo,
} = require('../agentlens-core');

test('AGENT_TOOLS tem 7 entradas com campos obrigatórios', () => {
  assert.equal(AGENT_TOOLS.length, 7);
  for (const tool of AGENT_TOOLS) {
    assert.ok(tool.id, 'tool.id presente');
    assert.ok(tool.name, 'tool.name presente');
    assert.ok(Array.isArray(tool.files), 'tool.files é array');
    assert.ok(tool.files.length > 0, 'tool.files não vazio');
  }
});

test('PRICING tem ao menos 10 modelos com input e output numéricos', () => {
  const models = Object.keys(PRICING);
  assert.ok(models.length >= 10, `esperado >=10 modelos, encontrado ${models.length}`);
  for (const model of models) {
    assert.equal(typeof PRICING[model].input, 'number', `${model}.input deve ser number`);
    assert.equal(typeof PRICING[model].output, 'number', `${model}.output deve ser number`);
  }
});

test('HEALTH_LIMITS tem ideal/warn/max para cada tool, em ordem crescente', () => {
  for (const [toolId, limits] of Object.entries(HEALTH_LIMITS)) {
    assert.equal(typeof limits.ideal, 'number', `${toolId}.ideal deve ser number`);
    assert.equal(typeof limits.warn, 'number', `${toolId}.warn deve ser number`);
    assert.equal(typeof limits.max, 'number', `${toolId}.max deve ser number`);
    assert.ok(limits.ideal <= limits.warn, `${toolId}: ideal <= warn`);
    assert.ok(limits.warn <= limits.max, `${toolId}: warn <= max`);
  }
});

test('parseReferences retorna array', () => {
  assert.ok(Array.isArray(parseReferences('')));
  assert.ok(Array.isArray(parseReferences('sem refs aqui')));
});

test('parseReferences extrai paths com @prefix', () => {
  const refs = parseReferences('@AGENTS.md\n@docs/guide.md');
  assert.ok(refs.some(r => r.includes('AGENTS.md')), 'deve extrair AGENTS.md');
  assert.ok(refs.some(r => r.includes('docs/guide.md')), 'deve extrair docs/guide.md');
});

test('analyzeLocalRepo retorna campos obrigatórios', () => {
  const result = analyzeLocalRepo(path.resolve('.'), 'agentlens');
  assert.equal(typeof result.repoName, 'string', 'repoName deve ser string');
  assert.equal(typeof result.totalContextTokens, 'number', 'totalContextTokens deve ser number');
  assert.ok(Array.isArray(result.uniqueRefs), 'uniqueRefs deve ser array');
  assert.equal(typeof result.foundByTool, 'object', 'foundByTool deve ser object');
  assert.equal(typeof result.ok, 'boolean', 'ok deve ser boolean');
});
```

- [ ] **Step 2: Rodar testes para verificar que passam**

```bash
node --test test/core.test.js
```

Expected: todos os testes `✓ pass`. Se algum falhar, corrigir o teste antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add test/core.test.js
git commit -m "test: add unit tests for agentlens-core"
```

---

## Task 3: Camada de banco de dados (db.js)

**Files:**
- Create: `db.js`

- [ ] **Step 1: Criar db.js**

```js
'use strict';

const Database = require('better-sqlite3');
const path = require('path');

let _db;

function getDb() {
  if (!_db) {
    const dbPath = process.env.AGENTLENS_DB || path.join(process.cwd(), 'agentlens-history.db');
    _db = new Database(dbPath);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS analyses (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at  TEXT NOT NULL,
        repo_path   TEXT NOT NULL,
        repo_name   TEXT NOT NULL,
        cli_version TEXT NOT NULL,
        result_json TEXT NOT NULL
      )
    `);
  }
  return _db;
}

function saveAnalysis({ repo_path, repo_name, cli_version, result }) {
  const stmt = getDb().prepare(
    'INSERT INTO analyses (created_at, repo_path, repo_name, cli_version, result_json) VALUES (?, ?, ?, ?, ?)'
  );
  const info = stmt.run(new Date().toISOString(), repo_path, repo_name, cli_version, JSON.stringify(result));
  return info.lastInsertRowid;
}

function listAnalyses() {
  return getDb()
    .prepare('SELECT id, created_at, repo_name, repo_path, cli_version FROM analyses ORDER BY id DESC')
    .all();
}

function getAnalysis(id) {
  const row = getDb().prepare('SELECT * FROM analyses WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, result: JSON.parse(row.result_json) };
}

function deleteAnalysis(id) {
  const info = getDb().prepare('DELETE FROM analyses WHERE id = ?').run(id);
  return info.changes > 0;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { saveAnalysis, listAnalyses, getAnalysis, deleteAnalysis, closeDb };
```

- [ ] **Step 2: Verificar que db.js carrega sem erros**

```bash
node -e "const db = require('./db'); console.log(Object.keys(db));"
```

Expected: `[ 'saveAnalysis', 'listAnalyses', 'getAnalysis', 'deleteAnalysis', 'closeDb' ]`

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat: add SQLite db layer"
```

---

## Task 4: Servidor HTTP (server.js) — TDD

**Files:**
- Create: `test/api.test.js`
- Create: `server.js`

- [ ] **Step 1: Criar test/api.test.js com testes falhando**

```js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

process.env.AGENTLENS_DB = path.join(os.tmpdir(), `agentlens-test-${Date.now()}.db`);

const { server } = require('../server');

let baseUrl;

before(done => {
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

after(done => {
  server.close(() => {
    require('../db').closeDb();
    try { fs.unlinkSync(process.env.AGENTLENS_DB); } catch (_) {}
    done();
  });
});

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const json = body ? JSON.stringify(body) : null;
    const url = new URL(urlPath, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json' },
    };
    if (json) options.headers['Content-Length'] = Buffer.byteLength(json);
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (json) req.write(json);
    req.end();
  });
}

test('POST /analyze sem path retorna 400', async () => {
  const res = await request('POST', '/analyze', {});
  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'deve ter campo error');
});

test('POST /analyze com path inválido retorna 400', async () => {
  const res = await request('POST', '/analyze', { path: '/caminho/inexistente/xyz' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error, 'deve ter campo error');
});

test('POST /analyze com path válido retorna 200, salva e retorna id', async () => {
  const res = await request('POST', '/analyze', { path: path.resolve('.') });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.id, 'number', 'deve retornar id numérico');
  assert.equal(typeof res.body.repoName, 'string', 'deve retornar repoName');
  assert.equal(typeof res.body.totalContextTokens, 'number', 'deve retornar totalContextTokens');
});

test('GET /history retorna array com ao menos um item após POST', async () => {
  await request('POST', '/analyze', { path: path.resolve('.') });
  const res = await request('GET', '/history');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body), 'deve ser array');
  assert.ok(res.body.length >= 1, 'deve ter ao menos um item');
});

test('GET /history/:id retorna análise completa', async () => {
  const postRes = await request('POST', '/analyze', { path: path.resolve('.') });
  const id = postRes.body.id;
  const res = await request('GET', `/history/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, id);
  assert.ok(res.body.result, 'deve ter campo result com dados da análise');
});

test('DELETE /history/:id remove análise e GET retorna 404', async () => {
  const postRes = await request('POST', '/analyze', { path: path.resolve('.') });
  const id = postRes.body.id;
  const delRes = await request('DELETE', `/history/${id}`);
  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.deleted, true);
  const getRes = await request('GET', `/history/${id}`);
  assert.equal(getRes.status, 404);
});

test('GET /history/:id com id inexistente retorna 404', async () => {
  const res = await request('GET', '/history/999999');
  assert.equal(res.status, 404);
  assert.ok(res.body.error, 'deve ter campo error');
});
```

- [ ] **Step 2: Rodar para verificar que falham (server.js não existe)**

```bash
node --test test/api.test.js
```

Expected: erro `Cannot find module '../server'` — confirma que os testes estão prontos para guiar a implementação.

- [ ] **Step 3: Criar server.js**

```js
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { analyzeLocalRepo } = require('./agentlens-core');
const { version: VERSION } = require('./package.json');
const db = require('./db');

const PORT = process.env.PORT || 3000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { reject(new Error('JSON inválido no body')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/|\/$/g, '').split('/');

  try {
    if (req.method === 'POST' && parts[0] === 'analyze') {
      const body = await readBody(req);
      if (!body.path) return send(res, 400, { error: 'path é obrigatório' });
      if (!fs.existsSync(body.path)) return send(res, 400, { error: 'path não encontrado' });
      const repoName = body.name || path.basename(path.resolve(body.path));
      const result = analyzeLocalRepo(body.path, repoName);
      const id = db.saveAnalysis({ repo_path: body.path, repo_name: result.repoName, cli_version: VERSION, result });
      return send(res, 200, { id, ...result });
    }

    if (req.method === 'GET' && parts[0] === 'history' && !parts[1]) {
      return send(res, 200, db.listAnalyses());
    }

    if (req.method === 'GET' && parts[0] === 'history' && parts[1]) {
      const row = db.getAnalysis(Number(parts[1]));
      if (!row) return send(res, 404, { error: 'análise não encontrada' });
      return send(res, 200, row);
    }

    if (req.method === 'DELETE' && parts[0] === 'history' && parts[1]) {
      const deleted = db.deleteAnalysis(Number(parts[1]));
      if (!deleted) return send(res, 404, { error: 'análise não encontrada' });
      return send(res, 200, { deleted: true });
    }

    send(res, 404, { error: 'rota não encontrada' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AgentLens server rodando em http://localhost:${PORT}`);
  });
}

module.exports = { server };
```

- [ ] **Step 4: Rodar todos os testes para verificar que passam**

```bash
npm test
```

Expected: todos os testes em `core.test.js` e `api.test.js` marcados como `✓ pass`.

- [ ] **Step 5: Commit**

```bash
git add server.js test/api.test.js
git commit -m "feat: add REST API server with SQLite history and integration tests"
```

---

## Task 5: Atualizar README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Reescrever README.md**

Substituir o conteúdo completo por:

```markdown
# AgentLens

Scan de repositórios para custos de contexto de agentes de IA. Detecta `CLAUDE.md`, `AGENTS.md`, `.cursorrules` e calcula custos de tokens para os principais LLMs.

Funciona de três formas — escolha a que se encaixa no seu fluxo.

---

## App (HTML)

Zero instalação. Baixe `agentlens.html`, abra no browser.

- Analisa repositórios públicos do GitHub via API
- Carrega relatórios `.json` gerados pelo CLI
- Toggle de idioma PT/EN
- Aba Compare para comparar múltiplos repos

```
1. Baixe agentlens.html
2. Abra no Chrome, Firefox, Safari ou Edge
3. Cole: https://github.com/owner/repo → Analisar
```

---

## CLI

Analisa repositórios locais e gera relatório HTML + JSON.

```bash
# Com npx (sem instalação)
npx @hugofusinato/agentlens
npx @hugofusinato/agentlens /caminho/do/repo
npx @hugofusinato/agentlens --path . --path ../outro-repo

# Ou instale globalmente
npm install -g @hugofusinato/agentlens
agentlens /caminho/do/repo

# Opções úteis
agentlens --stdout          # JSON no stdout
agentlens --no-open         # não abre browser automaticamente
agentlens --out meu-repo    # nome do arquivo de saída
```

Gera `agentlens-report.html` e `agentlens-report.json` no diretório atual.

---

## Servidor com histórico

API REST HTTP que analisa repositórios e persiste os resultados em banco de dados SQLite local.

```bash
npm install
node server.js              # porta 3000 (padrão)
PORT=8080 node server.js    # porta customizada
```

### Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/analyze` | `{ "path": "/caminho/repo" }` — analisa e salva |
| `GET` | `/history` | Lista todas as análises salvas |
| `GET` | `/history/:id` | Análise completa por ID |
| `DELETE` | `/history/:id` | Remove uma análise |

O app HTML pode ser apontado para `GET /history` para exibir o histórico de análises salvas.

O banco de dados fica em `agentlens-history.db` no diretório de trabalho. Cada análise salva a versão do CLI (`cliVersion`) para rastrear compatibilidade entre versões.

---

## Testes

```bash
npm test
```

Roda testes unitários do core e testes de integração da API com `node:test` nativo (Node.js ≥ 18, sem dependências extras).

---

## Config (opcional)

Crie `.agentlens.json` para definir múltiplos repos de uma vez:

```json
{
  "repos": [
    { "path": ".", "name": "meu-repo" },
    { "path": "../outro-repo" }
  ],
  "output": "relatorio.html"
}
```

Veja `.agentlens.example.json` para referência completa.
```

- [ ] **Step 2: Verificar que o README está correto**

```bash
node -e "require('fs').readFileSync('README.md','utf8').split('\n').slice(0,5).forEach(l=>console.log(l))"
```

Expected: primeiras linhas mostram `# AgentLens`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README with App, CLI, and Server sections"
```

---

## Task 6: Verificação final

- [ ] **Step 1: Rodar todos os testes**

```bash
npm test
```

Expected: todos os testes `✓ pass`, sem erros.

- [ ] **Step 2: Smoke test do CLI (sem alterações)**

```bash
node cli.js --version
```

Expected: `agentlens v1.0.3` (core inalterado).

- [ ] **Step 3: Smoke test do servidor**

Terminal 1:
```bash
node server.js
```

Terminal 2:
```bash
curl -s -X POST http://localhost:3000/analyze -H 'Content-Type: application/json' -d "{\"path\": \"$(pwd)\"}" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('id:', d.id, 'tokens:', d.totalContextTokens)"
curl -s http://localhost:3000/history | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('histórico:', d.length, 'entradas')"
```

Expected: id numérico, tokens numérico, histórico com 1+ entradas.
