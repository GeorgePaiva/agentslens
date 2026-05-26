# AgentLens — API REST, Banco de Dados e Testes

**Data:** 2026-03-28
**Status:** Aprovado

## Objetivo

Adicionar três capacidades ao projeto sem alterar o core de processamento:

1. Testes automatizados para `agentlens-core.js`
2. API REST HTTP com histórico persistido em SQLite
3. README simplificado cobrindo os três modos de uso

O core (`analyzeLocalRepo`, `PRICING`, `AGENT_TOOLS`, `HEALTH_LIMITS`) permanece inalterado e versionado. CLI, servidor e app HTML consomem a mesma estrutura de dados.

## Estrutura de arquivos

```
agentlens/
├── agentlens-core.js      (existente — sem alterações)
├── cli.js                 (existente — sem alterações)
├── agentlens.html         (existente — sem alterações)
├── db.js                  (novo — inicializa SQLite, exporta funções de acesso)
├── server.js              (novo — API HTTP nativa, porta configurável via env PORT)
├── test/
│   ├── core.test.js       (novo — testes unitários do agentlens-core.js)
│   └── api.test.js        (novo — testes de integração da API)
├── README.md              (atualizado — três seções: App, CLI, Servidor)
└── package.json           (atualizado — adiciona better-sqlite3, script "test")
```

## Banco de dados

Arquivo: `agentlens-history.db` no diretório de trabalho ao subir o servidor.

```sql
CREATE TABLE IF NOT EXISTS analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  repo_path   TEXT NOT NULL,
  repo_name   TEXT NOT NULL,
  cli_version TEXT NOT NULL,
  result_json TEXT NOT NULL
)
```

`result_json` armazena o objeto completo retornado por `analyzeLocalRepo` — o mesmo formato já usado pelo CLI. Isso garante que relatórios antigos e novos sejam compatíveis enquanto `cliVersion` não mudar de schema.

## API REST (`server.js`)

Servidor HTTP nativo Node.js (sem Express). Porta padrão `3000`, configurável via `PORT`.

| Método | Rota            | Descrição                                                  |
|--------|-----------------|------------------------------------------------------------|
| POST   | `/analyze`      | `{ path, name? }` → roda `analyzeLocalRepo`, salva no DB, retorna resultado |
| GET    | `/history`      | Lista todas as análises (campos: `id`, `created_at`, `repo_name`, `cli_version`) |
| GET    | `/history/:id`  | Retorna análise completa por ID                            |
| DELETE | `/history/:id`  | Remove uma análise do banco                                |

Respostas sempre em JSON. Erros retornam `{ error: "mensagem" }` com status HTTP apropriado.

## Testes (`node:test` nativo)

### `test/core.test.js` — unitários
- `parseReferences` extrai corretamente referências `@import`, `!include`, links markdown e paths inline
- `AGENT_TOOLS` contém os 7 tools esperados com campos obrigatórios
- `PRICING` cobre os modelos principais com estrutura `{ input, output }`
- `HEALTH_LIMITS` tem as chaves `ideal`, `warn`, `max` para cada tool
- `analyzeLocalRepo` retorna objeto com campos `repoName`, `totalContextTokens`, `uniqueRefs`, `foundByTool`

### `test/api.test.js` — integração
- Sobe servidor em porta aleatória antes dos testes, derruba após
- `POST /analyze` com path válido retorna 200 e persiste no DB
- `POST /analyze` com path inválido retorna 400
- `GET /history` retorna array (vazio ou com itens)
- `GET /history/:id` retorna análise após POST bem-sucedido
- `DELETE /history/:id` remove análise e confirma com 404 subsequente

Script npm: `"test": "node --test test/*.test.js"`

## README — três modos de uso

### 1. App (HTML viewer)
Abrir `agentlens.html` diretamente no browser. Suporta análise de repos GitHub públicos via API e carregamento de `.json` gerado pelo CLI.

### 2. CLI
```bash
npx @hugofusinato/agentlens           # scan do diretório atual
npx @hugofusinato/agentlens /path     # scan de path específico
node cli.js --stdout                  # JSON no stdout
```
Gera `agentlens-report.html` + `agentlens-report.json` localmente. Abre o browser automaticamente.

### 3. Servidor com histórico
```bash
node server.js                        # sobe na porta 3000
PORT=8080 node server.js              # porta customizada
```
API REST disponível em `http://localhost:3000`. O app HTML pode ser configurado para consultar `GET /history` e exibir análises salvas do banco de dados.

## Flexibilidade e versionamento

- Os três modos (app, CLI, servidor) consomem a mesma estrutura de dados produzida por `analyzeLocalRepo`
- `cliVersion` em cada análise salva permite detectar incompatibilidades futuras de schema
- Nenhuma alteração em `agentlens-core.js` ou `cli.js` — o core permanece estável e publicável via `npm publish`
