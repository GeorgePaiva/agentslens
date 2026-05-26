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

```
1. Baixe agentlens.html
2. Abra no Chrome, Firefox, Safari ou Edge
3. Cole: https://github.com/owner/repo → Analisar
```

All processing happens in your browser via the GitHub public API.

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
