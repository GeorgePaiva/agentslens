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

before(() => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
    resolve();
  });
}));

after(() => new Promise((resolve) => {
  server.close(() => {
    require('../db').closeDb();
    try { fs.unlinkSync(process.env.AGENTLENS_DB); } catch (_) {}
    resolve();
  });
}));

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
        try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
        catch (_) { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
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

test('GET /history retorna objeto paginado com ao menos um item após POST', async () => {
  await request('POST', '/analyze', { path: path.resolve('.') });
  const res = await request('GET', '/history');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items), 'deve ter items como array');
  assert.ok(res.body.items.length >= 1, 'deve ter ao menos um item');
  assert.equal(typeof res.body.total, 'number', 'deve ter total');
  assert.equal(typeof res.body.limit, 'number', 'deve ter limit');
  assert.equal(typeof res.body.offset, 'number', 'deve ter offset');
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

test('OPTIONS /github retorna 204 com headers CORS', async () => {
  const res = await request('OPTIONS', '/github', null);
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('OPTIONS /analyze retorna 204 com headers CORS', async () => {
  const res = await request('OPTIONS', '/analyze', null);
  assert.equal(res.status, 204);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('GET /history retorna header Access-Control-Allow-Origin', async () => {
  const res = await request('GET', '/history');
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('POST /github sem body retorna 400', async () => {
  const res = await request('POST', '/github', {});
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /github sem repoId retorna 400', async () => {
  const res = await request('POST', '/github', { name: 'repo', result: {} });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /github sem name retorna 400', async () => {
  const res = await request('POST', '/github', { repoId: 'owner/repo', result: {} });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /github sem result retorna 400', async () => {
  const res = await request('POST', '/github', { repoId: 'owner/repo', name: 'repo' });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /github com body válido retorna 200 com id e repo_name', async () => {
  const res = await request('POST', '/github', { repoId: 'owner/repo', name: 'repo', result: { totalContextTokens: 42 } });
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.id, 'number');
  assert.equal(res.body.repo_name, 'repo');
  assert.equal(res.body.repo_path, 'owner/repo');
});

test('GET /history lista entradas de /github e /analyze juntas', async () => {
  await request('POST', '/github', { repoId: 'owner/mixed', name: 'mixed', result: {} });
  await request('POST', '/analyze', { path: path.resolve('.') });
  const res = await request('GET', '/history');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some(e => e.repo_path === 'owner/mixed'), 'deve conter entrada do github');
  assert.ok(res.body.items.some(e => e.repo_path !== 'owner/mixed'), 'deve conter entrada local');
});

test('GET /history/:id retorna result completo de entrada do /github', async () => {
  const post = await request('POST', '/github', { repoId: 'owner/detail', name: 'detail', result: { totalContextTokens: 99 } });
  const id = post.body.id;
  const res = await request('GET', `/history/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, id);
  assert.ok(res.body.result, 'deve ter campo result');
  assert.equal(res.body.result.totalContextTokens, 99);
  assert.equal(res.body.repo_path, 'owner/detail');
});

test('DELETE /history/:id remove entrada do /github', async () => {
  const post = await request('POST', '/github', { repoId: 'owner/todelete', name: 'todelete', result: {} });
  const id = post.body.id;
  const del = await request('DELETE', `/history/${id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);
  const get = await request('GET', `/history/${id}`);
  assert.equal(get.status, 404);
});

test('DELETE /history/:id com id inexistente retorna 404', async () => {
  const res = await request('DELETE', '/history/999999');
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});

test('rota desconhecida retorna 404', async () => {
  const res = await request('GET', '/rota-inexistente');
  assert.equal(res.status, 404);
  assert.ok(res.body.error);
});

test('POST /analyze com body JSON inválido retorna 400', async () => {
  const res = await new Promise((resolve, reject) => {
    const payload = 'isso nao e json';
    const url = new URL('/analyze', baseUrl);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = http.request(options, r => {
      let data = '';
      r.on('data', chunk => { data += chunk; });
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: r.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /analyze com name customizado retorna esse nome', async () => {
  const res = await request('POST', '/analyze', { path: path.resolve('.'), name: 'meu-repo-custom' });
  assert.equal(res.status, 200);
  assert.equal(res.body.repoName, 'meu-repo-custom');
});

test('POST /analyze retorna header Access-Control-Allow-Origin', async () => {
  const res = await request('POST', '/analyze', { path: path.resolve('.') });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('POST /github retorna header Access-Control-Allow-Origin', async () => {
  const res = await request('POST', '/github', { repoId: 'owner/cors-test', name: 'cors-test', result: {} });
  assert.equal(res.status, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('respostas JSON têm Content-Type application/json', async () => {
  const res = await request('GET', '/history');
  assert.ok(res.headers['content-type'].includes('application/json'));
});

test('GET /history retorna entradas em ordem decrescente de id', async () => {
  await request('POST', '/github', { repoId: 'owner/order-a', name: 'order-a', result: {} });
  await request('POST', '/github', { repoId: 'owner/order-b', name: 'order-b', result: {} });
  const res = await request('GET', '/history');
  assert.equal(res.status, 200);
  const ids = res.body.items.map(e => e.id);
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i - 1] >= ids[i], 'ids devem estar em ordem decrescente');
  }
});

test('GET /history items têm campos de metadados esperados', async () => {
  await request('POST', '/github', { repoId: 'owner/meta', name: 'meta', result: {} });
  const res = await request('GET', '/history');
  const item = res.body.items[0];
  assert.ok('id' in item, 'deve ter id');
  assert.ok('created_at' in item, 'deve ter created_at');
  assert.ok('repo_name' in item, 'deve ter repo_name');
  assert.ok('repo_path' in item, 'deve ter repo_path');
  assert.ok('cli_version' in item, 'deve ter cli_version');
});

test('POST /analyze retorna foundByTool e uniqueRefs na resposta', async () => {
  const res = await request('POST', '/analyze', { path: path.resolve('.') });
  assert.equal(res.status, 200);
  assert.ok(res.body.foundByTool !== undefined, 'deve ter foundByTool');
  assert.ok(Array.isArray(res.body.uniqueRefs), 'deve ter uniqueRefs como array');
});

test('DELETE /history/:id duas vezes retorna 404 na segunda', async () => {
  const post = await request('POST', '/github', { repoId: 'owner/double-del', name: 'double-del', result: {} });
  const id = post.body.id;
  const first = await request('DELETE', `/history/${id}`);
  assert.equal(first.status, 200);
  const second = await request('DELETE', `/history/${id}`);
  assert.equal(second.status, 404);
  assert.ok(second.body.error);
});

test('GET /history/:id com id não-numérico retorna 400', async () => {
  const res = await request('GET', '/history/abc');
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('DELETE /history/:id com id não-numérico retorna 400', async () => {
  const res = await request('DELETE', '/history/abc');
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('GET /history/:id com id zero retorna 400', async () => {
  const res = await request('GET', '/history/0');
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('GET /history/:id com id negativo retorna 400', async () => {
  const res = await request('GET', '/history/-1');
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('DELETE /history/:id com id negativo retorna 400', async () => {
  const res = await request('DELETE', '/history/-1');
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test('POST /github com body JSON inválido retorna 400', async () => {
  const res = await new Promise((resolve, reject) => {
    const payload = 'nao e json';
    const url = new URL('/github', baseUrl);
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    };
    const req = http.request(options, r => {
      let data = '';
      r.on('data', chunk => { data += chunk; });
      r.on('end', () => {
        try { resolve({ status: r.statusCode, body: JSON.parse(data) }); }
        catch (_) { resolve({ status: r.statusCode, body: data }); }
      });
    });
    req.on('error', () => resolve({ status: 0, body: {} }));
    req.write(payload);
    req.end();
  });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});
