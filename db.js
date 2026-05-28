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

function listAnalyses({ limit = 50, offset = 0 } = {}) {
  return getDb()
    .prepare("SELECT id, created_at, repo_name, repo_path, cli_version, json_extract(result_json,'$.totalContextTokens') as total_context_tokens FROM analyses ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, offset);
}

function countAnalyses() {
  return getDb().prepare('SELECT COUNT(*) as total FROM analyses').get().total;
}

function getStats() {
  const db = getDb();
  const { total } = db.prepare('SELECT COUNT(*) as total FROM analyses').get();
  const { total_tokens } = db.prepare("SELECT COALESCE(SUM(json_extract(result_json,'$.totalContextTokens')),0) as total_tokens FROM analyses").get();
  const { last_created_at } = db.prepare('SELECT MAX(created_at) as last_created_at FROM analyses').get();
  return { total_analyses: total, total_tokens_analyzed: total_tokens, last_analysis_at: last_created_at };
}

function searchAnalyses(q) {
  const like = `%${q}%`;
  return getDb()
    .prepare("SELECT id, created_at, repo_name, repo_path, cli_version, json_extract(result_json,'$.totalContextTokens') as total_context_tokens FROM analyses WHERE repo_name LIKE ? OR repo_path LIKE ? ORDER BY id DESC")
    .all(like, like);
}

function getAnalysis(id) {
  const row = getDb().prepare('SELECT * FROM analyses WHERE id = ?').get(id);
  if (!row) return null;
  const { result_json, ...rest } = row;
  return { ...rest, result: JSON.parse(result_json) };
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

module.exports = { saveAnalysis, listAnalyses, countAnalyses, getStats, searchAnalyses, getAnalysis, deleteAnalysis, closeDb };
