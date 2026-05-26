# AgentLens — Integração Frontend ↔ API

## Contexto

Hoje o `agentlens.html` é um SPA 100% client-side: ele busca arquivos de config de agentes direto do GitHub via `raw.githubusercontent.com`, calcula tokens e custos no browser, e não persiste nada. O `server.js` existe como API separada que analisa **repositórios locais** e salva no SQLite — mas o frontend nunca o usa.

O objetivo é integrar o frontend à API para que toda análise de repositório GitHub também seja salva no banco, criando um histórico global de todos os repos com agentes já analisados.

---

## 1 — Estrutura Atual

```mermaid
graph TD
    subgraph Browser
        HTML["agentlens.html\n(SPA completo)"]
        HTML -->|fetch raw files| GH["raw.githubusercontent.com"]
        HTML -->|fetch repos| GHAPI["api.github.com"]
        HTML -->|translate| LLM["Anthropic / OpenAI / Gemini APIs"]
        HTML -->|load local .json| FS["Sistema de Arquivos\n(drag & drop / file input)"]
    end

    subgraph CLI["CLI (node cli.js)"]
        CLI_JS["cli.js"] -->|calls| CORE["agentlens-core.js\nanalyzeLocalRepo()"]
        CORE -->|reads| LOCAL_FS["Repositório local\n(filesystem)"]
        CLI_JS -->|injects bootstrap| OUT_HTML["&lt;name&gt;.html"]
        CLI_JS -->|writes| OUT_JSON["&lt;name&gt;.json"]
    end

    subgraph API["API (node server.js)"]
        SRV["server.js\nHTTP :3000"] -->|calls| CORE2["agentlens-core.js\nanalyzeLocalRepo()"]
        CORE2 -->|reads| LOCAL_FS2["Repositório local\n(filesystem)"]
        SRV -->|persiste| DB["SQLite\nagentlens-history.db"]
    end

    HTML -.->|não se comunicam| SRV
    CLI_JS -.->|independente| SRV
```

### Problema

O frontend e a API vivem em silos. Análises feitas no browser de repositórios GitHub somem quando o usuário fecha a aba. Não há memória de quais repos têm agentes configurados.

---

## 2 — Estrutura de Banco, Servidor e Frontend (estado atual)

```mermaid
erDiagram
    analyses {
        INTEGER id PK "AUTOINCREMENT"
        TEXT created_at "ISO 8601 UTC"
        TEXT repo_path "caminho no filesystem"
        TEXT repo_name "nome display"
        TEXT cli_version "versão do pacote"
        TEXT result_json "JSON completo de analyzeLocalRepo()"
    }
```

```mermaid
block-beta
    columns 3

    block:frontend:1
        F1["agentlens.html"]
        F2["STATE\n{ foundByTool, uniqueRefs,\n  totalContextTokens }"]
        F3["COMPARE_STATE\n{ items, results }"]
        F4["ORG_SCAN_STATE\n{ repos, configured }"]
    end

    block:server:1
        S1["server.js\nHTTP server"]
        S2["POST /analyze\n→ analyzeLocalRepo()"]
        S3["GET /history\n→ lista metadados"]
        S4["GET /history/:id\n→ result completo"]
        S5["DELETE /history/:id"]
    end

    block:db:1
        D1["SQLite\ndb.js"]
        D2["tabela: analyses\n(id, created_at,\nrepo_path, repo_name,\ncli_version, result_json)"]
    end

    F1 --> F2
    S1 --> S2
    S1 --> S3
    S1 --> S4
    S1 --> S5
    S2 --> D1
    S3 --> D1
    S4 --> D1
    S5 --> D1
    D1 --> D2
```

---

## 3 — Arquitetura Proposta (após integração)

```mermaid
graph TD
    subgraph Browser["Browser — agentlens.html"]
        ANALYZE["analyze()\nfetch GitHub files"]
        SAVE["saveToServer(result)\nPOST /api/github-analyses"]
        HISTORY_TAB["aba Histórico\nGET /api/github-analyses"]
        LOAD_SAVED["carregar análise salva\nGET /api/github-analyses/:id"]
        DELETE_SAVED["apagar\nDELETE /api/github-analyses/:id"]

        ANALYZE -->|após sucesso| SAVE
    end

    subgraph API["server.js — HTTP :3000"]
        CORS["CORS headers\n(GET/POST/DELETE)"]
        EP1["POST /api/github-analyses\nrecebe result do browser\nsalva no banco"]
        EP2["GET /api/github-analyses\nlista histórico GitHub"]
        EP3["GET /api/github-analyses/:id\nretorna result completo"]
        EP4["DELETE /api/github-analyses/:id"]

        EP_LOCAL1["POST /analyze\n(local repos — sem mudança)"]
        EP_LOCAL2["GET /history\n(local repos — sem mudança)"]
    end

    subgraph DB["SQLite — agentlens-history.db"]
        T_LOCAL["tabela: analyses\n(repos locais — sem mudança)"]
        T_GH["tabela: github_analyses\n(repos GitHub)"]
    end

    SAVE -->|POST JSON| EP1
    HISTORY_TAB -->|GET| EP2
    LOAD_SAVED -->|GET| EP3
    DELETE_SAVED -->|DELETE| EP4

    EP1 --> T_GH
    EP2 --> T_GH
    EP3 --> T_GH
    EP4 --> T_GH
    EP_LOCAL1 --> T_LOCAL
    EP_LOCAL2 --> T_LOCAL

    CORS -.->|aplicado em todas rotas| EP1
    CORS -.->|aplicado em todas rotas| EP2
    CORS -.->|aplicado em todas rotas| EP3
    CORS -.->|aplicado em todas rotas| EP4
```

---

## 4 — Fluxo de Requests

### 4a — Análise de repo GitHub (fluxo integrado)

```mermaid
sequenceDiagram
    actor User
    participant HTML as agentlens.html
    participant GH as raw.githubusercontent.com
    participant SRV as server.js :3000
    participant DB as SQLite

    User->>HTML: digita URL do repo e clica Analisar
    HTML->>GH: HEAD /owner/repo (detecta branch)
    GH-->>HTML: 200 OK
    HTML->>GH: GET CLAUDE.md / AGENTS.md / .cursorrules ...
    GH-->>HTML: conteúdo dos arquivos
    HTML->>HTML: parseReferences() + estimateTokens()
    HTML->>GH: GET arquivos referenciados (recursivo)
    GH-->>HTML: conteúdo dos refs
    HTML->>HTML: renderDetection() — exibe resultado

    HTML->>SRV: POST /api/github-analyses\n{ owner, repo, result }
    SRV->>DB: INSERT INTO github_analyses
    DB-->>SRV: id
    SRV-->>HTML: { id, savedAt }
    HTML->>HTML: mostra badge "salvo" com link para histórico
```

### 4b — Aba Histórico GitHub

```mermaid
sequenceDiagram
    actor User
    participant HTML as agentlens.html
    participant SRV as server.js :3000
    participant DB as SQLite

    User->>HTML: abre aba Histórico
    HTML->>SRV: GET /api/github-analyses
    SRV->>DB: SELECT id, owner, repo, analyzed_at, total_context_tokens, tools_found
    DB-->>SRV: lista de metadados
    SRV-->>HTML: JSON array
    HTML->>HTML: renderiza tabela com repos salvos

    User->>HTML: clica em um repo salvo
    HTML->>SRV: GET /api/github-analyses/:id
    SRV->>DB: SELECT result_json WHERE id=?
    DB-->>SRV: result_json
    SRV-->>HTML: { result }
    HTML->>HTML: renderDetection(result) — exibe análise salva

    User->>HTML: clica em apagar
    HTML->>SRV: DELETE /api/github-analyses/:id
    SRV->>DB: DELETE WHERE id=?
    DB-->>SRV: changes=1
    SRV-->>HTML: { deleted: true }
    HTML->>HTML: remove linha da tabela
```

### 4c — Servidor offline (graceful degradation)

```mermaid
sequenceDiagram
    participant HTML as agentlens.html
    participant SRV as server.js :3000

    HTML->>SRV: POST /api/github-analyses
    SRV--xHTML: connection refused / timeout

    Note over HTML: catch(e) — servidor não está rodando
    HTML->>HTML: análise exibida normalmente\n(sem badge "salvo")\ntoast discreto: "histórico indisponível"
```

---

## 5 — Schema do Banco (após integração)

```mermaid
erDiagram
    analyses {
        INTEGER id PK "AUTOINCREMENT"
        TEXT created_at "ISO 8601 UTC"
        TEXT repo_path "caminho no filesystem"
        TEXT repo_name "nome display"
        TEXT cli_version "versão do pacote"
        TEXT result_json "JSON de analyzeLocalRepo()"
    }

    github_analyses {
        INTEGER id PK "AUTOINCREMENT"
        TEXT analyzed_at "ISO 8601 UTC"
        TEXT owner "dono do repo GitHub"
        TEXT repo "nome do repo GitHub"
        TEXT branch "branch analisada"
        INTEGER total_context_tokens "soma de tokens"
        TEXT tools_found "JSON array de tool IDs"
        TEXT cli_version "versão do pacote"
        TEXT result_json "JSON do STATE do browser"
    }
```

---

## 6 — O Que Muda em Cada Arquivo

| Arquivo | Mudanças |
|---|---|
| `server.js` | Adicionar CORS headers em `send()`. Adicionar 4 rotas `/api/github-analyses` (POST, GET, GET/:id, DELETE). |
| `db.js` | Adicionar `CREATE TABLE IF NOT EXISTS github_analyses`. Adicionar funções `saveGithubAnalysis()`, `listGithubAnalyses()`, `getGithubAnalysis()`, `deleteGithubAnalysis()`. |
| `agentlens.html` | Em `analyze()`: após render, `fetch POST /api/github-analyses` (com try/catch silencioso). Na aba **Reports**: adicionar seção "Histórico GitHub" que chama `GET /api/github-analyses`. |
| `agentlens-core.js` | Nenhuma mudança — lógica de parsing e tokens não muda. |
| `cli.js` | Nenhuma mudança. |

---

## 7 — Considerações de Coesão

- **Sem duplicação de lógica**: o browser continua fazendo o parse (já funciona). O server só persiste o resultado — não re-analisa.
- **Sem quebra de compatibilidade**: rotas `/analyze` e `/history` existentes não mudam. Nova tabela é separada.
- **CORS é o único bloqueador atual**: sem os headers, `fetch` do browser para `localhost:3000` falha com CORS error.
- **Graceful degradation**: se o server não estiver rodando, o frontend funciona normalmente — persistência é best-effort.
- **Frontend detecta server**: ao abrir a aba Histórico, um `GET /api/github-analyses` com timeout curto revela se o servidor está disponível; se não, a seção mostra mensagem orientando a rodar `node server.js`.
