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
