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
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some(e => e.repo_path === 'owner/mixed'), 'deve conter entrada do github');
  assert.ok(res.body.some(e => e.repo_path !== 'owner/mixed'), 'deve conter entrada local');
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
