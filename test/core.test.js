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
