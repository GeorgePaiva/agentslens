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
