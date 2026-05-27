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
  assert.ok(refs.some(r => r.path.includes('AGENTS.md')), 'deve extrair AGENTS.md');
  assert.ok(refs.some(r => r.path.includes('docs/guide.md')), 'deve extrair docs/guide.md');
});

test('analyzeLocalRepo retorna campos obrigatórios', () => {
  const result = analyzeLocalRepo(path.resolve('.'), 'agentlens');
  assert.equal(typeof result.repoName, 'string', 'repoName deve ser string');
  assert.equal(typeof result.totalContextTokens, 'number', 'totalContextTokens deve ser number');
  assert.ok(Array.isArray(result.uniqueRefs), 'uniqueRefs deve ser array');
  assert.equal(typeof result.foundByTool, 'object', 'foundByTool deve ser object');
  assert.equal(typeof result.ok, 'boolean', 'ok deve ser boolean');
});

test('analyzeLocalRepo usa o repoName passado como argumento', () => {
  const result = analyzeLocalRepo(path.resolve('.'), 'nome-especifico');
  assert.equal(result.repoName, 'nome-especifico');
});

test('analyzeLocalRepo foundByTool usa IDs de tools válidos', () => {
  const validIds = new Set(['codex', 'claude', 'cursor', 'copilot', 'windsurf', 'aider', 'devin']);
  const result = analyzeLocalRepo(path.resolve('.'), 'agentlens');
  for (const toolId of Object.keys(result.foundByTool)) {
    assert.ok(validIds.has(toolId), `toolId inesperado: ${toolId}`);
  }
});

test('AGENT_TOOLS contém os IDs esperados', () => {
  const ids = AGENT_TOOLS.map(t => t.id);
  for (const expected of ['codex', 'claude', 'cursor', 'copilot', 'windsurf', 'aider', 'devin']) {
    assert.ok(ids.includes(expected), `tool '${expected}' não encontrado`);
  }
});

test('parseReferences extrai paths com !include e include:', () => {
  const refs = parseReferences('!include docs/guide.md\ninclude: rules/base.md');
  assert.ok(refs.some(r => r.path.includes('docs/guide.md')), 'deve extrair !include');
  assert.ok(refs.some(r => r.path.includes('rules/base.md')), 'deve extrair include:');
});

test('parseReferences extrai paths com @file', () => {
  const refs = parseReferences('@file config/settings.yml');
  assert.ok(refs.some(r => r.path.includes('config/settings.yml')), 'deve extrair @file');
});

test('parseReferences extrai links de markdown', () => {
  const refs = parseReferences('Veja [guia](docs/guide.md) e [regras](rules/base.md)');
  assert.ok(refs.some(r => r.path.includes('docs/guide.md')), 'deve extrair link markdown');
  assert.ok(refs.some(r => r.path.includes('rules/base.md')), 'deve extrair segundo link');
});

test('parseReferences extrai context_files em linha única', () => {
  const refs = parseReferences('context_files: [src/main.js, docs/api.md]');
  assert.ok(refs.some(r => r.path.includes('src/main.js')), 'deve extrair primeiro arquivo');
  assert.ok(refs.some(r => r.path.includes('docs/api.md')), 'deve extrair segundo arquivo');
});

test('parseReferences ignora URLs http/https', () => {
  const refs = parseReferences('@import https://example.com/file.md\n[link](https://example.com/doc.md)');
  assert.equal(refs.length, 0, 'não deve extrair URLs externas');
});

test('parseReferences desduplicaentradas com mesmo caminho', () => {
  const refs = parseReferences('@AGENTS.md\n@AGENTS.md\n@AGENTS.md');
  const count = refs.filter(r => r.path === 'AGENTS.md').length;
  assert.equal(count, 1, 'caminho duplicado deve aparecer apenas uma vez');
});
