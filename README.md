# AgentLens

Scan de repositórios para custos de contexto de agentes de IA. Detecta `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `copilot-instructions.md` e calcula custos de tokens para os principais LLMs.

Funciona de três formas — escolha a que se encaixa no seu fluxo.

---

## App (HTML)

Zero instalação. Baixe `agentlens.html`, abra no browser.

- Analisa repositórios públicos do GitHub via API
- Carrega relatórios `.json` gerados pelo CLI
- Toggle de idioma PT/EN
- Aba Compare para comparar múltiplos repos
- **Aba Histórico**: conecta automaticamente ao servidor local e exibe todas as análises salvas com contagem de tokens, opção de recarregar e deleção com confirmação

```
1. Baixe agentlens.html
2. Abra no Chrome, Firefox, Safari ou Edge
3. Cole: https://github.com/owner/repo → Analisar
```

All processing happens in your browser via the GitHub public API. Se o servidor local estiver rodando, análises GitHub são salvas automaticamente e ficam disponíveis na aba Histórico.

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

API REST HTTP que analisa repositórios locais e persiste os resultados em banco de dados SQLite. O app HTML detecta o servidor automaticamente e habilita a aba Histórico.

```bash
npm install
node server.js              # porta 3000 (padrão)
PORT=8080 node server.js    # porta customizada
```

### Endpoints

| Método | Rota | Body | Descrição |
|--------|------|------|-----------|
| `POST` | `/analyze` | `{ "path": "/caminho/repo", "name"? }` | Analisa repo local, salva e retorna resultado com `id` |
| `POST` | `/github` | `{ "repoId", "name", "result" }` | Salva análise GitHub enviada pelo app HTML |
| `GET` | `/history` | — | Lista metadados de todas as análises (inclui `total_context_tokens`) |
| `GET` | `/history/:id` | — | Análise completa por ID |
| `DELETE` | `/history/:id` | — | Remove uma análise |

Todos os endpoints retornam JSON e incluem headers CORS (`Access-Control-Allow-Origin: *`), permitindo que o app HTML se conecte ao servidor local sem restrições.

O banco de dados fica em `agentlens-history.db` no diretório de trabalho. Para usar um caminho diferente, defina a variável de ambiente `AGENTLENS_DB`.

```bash
AGENTLENS_DB=/tmp/meu-banco.db node server.js
```

---

## Testes

```bash
npm test
```

50 testes com `node:test` nativo (Node.js ≥ 18, sem dependências extras):

- **`test/core.test.js`** — testes unitários de `AGENT_TOOLS`, `PRICING`, `HEALTH_LIMITS`, `parseReferences` e `analyzeLocalRepo`
- **`test/api.test.js`** — testes de integração da API: todos os endpoints, validação de inputs, CORS, IDs inválidos (string, zero, negativo), JSON malformado, ordenação do histórico

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
