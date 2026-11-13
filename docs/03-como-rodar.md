# Como rodar — Pokédex Explorer

## Pré-requisitos

- Node.js **18.17+** (testado em Node 22; usa `node:test`, `fetch` global e `AbortSignal`)
- npm
- Acesso à internet para a PokéAPI (`https://pokeapi.co/api/v2`)
  — os testes automatizados **não** precisam de rede (fixtures locais)

## 1. Instalar e iniciar (modo monólito — arquitetura inicial exigida)

```bash
npm install
npm start                 # http://localhost:3000
```

Abra **http://localhost:3000** no navegador: o Express serve o frontend e a API no mesmo processo.

```bash
npm run dev               # idem, com --watch (reinicia ao salvar)
```

## 2. Modo microsserviços + API Gateway (desafio avançado)

```bash
npm run micro             # sobe 4 processos de uma vez
```

| Processo | Porta | O que faz |
|---|---|---|
| `api-gateway` | **4000** | ponto de entrada único, também serve o frontend |
| `catalog-service` | 4001 | índice, filtros por tipo, geração, busca, paginação |
| `stats-service` | 4002 | espécies, evoluções, atributos, efetividade, comparação |
| `favorites-service` | 4003 | favoritos persistidos em `data/favorites.json` |

Abra **http://localhost:4000** — o frontend é idêntico; só muda a porta-base.
Diagnóstico do encaminhamento: `http://localhost:4000/api/health` e `/api/arquitetura`.

Um serviço por vez (útil para demonstrar falha parcial):

```bash
npm run svc:catalog   # 4001
npm run svc:stats     # 4002
npm run svc:favorites # 4003
npm run gateway       # 4000
npm run micro:dev     # os quatro, cada um em modo watch
```

Se um serviço estiver derrubado, o gateway devolve `502 SERVICE_UNAVAILABLE` **só** para as rotas
daquele serviço — as demais continuam funcionando (comportamento demonstrável em sala).

## 3. Testes e smoke

```bash
npm test                  # 73 testes (unit + API), offline, ~1,6 s
npm run test:unit         # 26
npm run test:api          # 47
npm run smoke             # 37 verificações contra o servidor em execução
node scripts/smoke.js http://localhost:4000   # smoke no modo microsserviços
```

## 4. Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `PORT` / `HOST` | `3000` / `0.0.0.0` | endereço do monólito |
| `POKEAPI_BASE_URL` | `https://pokeapi.co/api/v2` | permite apontar para um mock |
| `POKEAPI_TIMEOUT_MS` | `8000` | timeout de cada chamada GET |
| `POKEAPI_RETRIES` | `2` | novas tentativas em falha de rede/timeout/5xx |
| `POKEAPI_RETRY_BACKOFF_MS` | `350` | espera progressiva entre tentativas |
| `CACHE_ENABLED` | `true` | `false` desliga o cache (bom para demonstrar lentidão) |
| `CACHE_TTL_LIST` | `3600000` (1 h) | TTL do índice de Pokémon |
| `CACHE_TTL_POKEMON` / `_SPECIES` | `86400000` (24 h) | TTL de fichas e espécies |
| `CACHE_TTL_TYPE` | `43200000` (12 h) | TTL dos índices de tipo |
| `CACHE_TTL_EVOLUTION` | `7 d` | TTL das cadeias evolutivas |
| `CACHE_MAX_ENTRIES` | `4000` | teto do cache (evicção FIFO) |
| `PAGE_SIZE` | `12` | tamanho padrão de página |
| `TOTAL_POKEMON` | `1025` | usado apenas como fallback de contagem |
| `HYDRATION_CONCURRENCY` | `12` | requisições paralelas por página |
| `FAVORITES_FILE` | `data/favorites.json` | caminho da persistência |
| `FAVORITES_MAX_ITEMS` | `60` | limite de favoritos |
| `GATEWAY_PORT`, `CATALOG_SERVICE_PORT`, `STATS_SERVICE_PORT`, `FAVORITES_SERVICE_PORT` | 4000–4003 | portas do modo distribuído |
| `GATEWAY_TIMEOUT_MS` | `6000` | timeout interno do gateway |
| `LOG_REQUESTS` | `on` | `off` silencia o logger (usado nos testes) |

## 5. Roteiro de demonstração (5 min)

1. **http://localhost:3000** → buscar `pikachu` (Enter) → mostrar imagem, tipos, medidas `0.4 m / 6 kg`
   (a PokéAPI devolve `4` e `60`) e as 6 barras de atributo.
2. Clicar em **Fogo** e depois **Água**, trocar o critério para **Todos os tipos selecionados** →
   1 resultado (Volcanion). Mostrar que `meta.filtros` confirma o critério no servidor.
3. Abrir a ficha de **Charizard** → espécie, geração, cadeia evolutiva com gatilhos
   (“Nível 16”, “Nível 36”) e habitat/cor já em português.
4. **＋ Comparar** em Charizard e Squirtle → barras espelhadas, números e veredito.
5. **★ Favoritar** → painel de favoritos + `sincronização: online`; recarregar a página e mostrar a
   persistência (backend + `localStorage`).
6. Painel **Cache do servidor** → segunda consulta vira `cache` (badge) e a taxa de acertos sobe;
   clicar em **Limpar cache** e ver as entradas zerarem.
7. Terminal: `npm run micro` → abrir **http://localhost:4000** → `/api/arquitetura` mostra o mapa;
   derrubar `stats-service` e demonstrar o `502 SERVICE_UNAVAILABLE` só nas rotas afetadas.
8. `npm test` e `npm run smoke` na projeção (73 testes + 37 verificações).

## 6. Solução de problemas

| Sintoma | Causa provável | Ação |
|---|---|---|
| `EADDRINUSE :3000` | outro processo na porta | `PORT=3100 npm start` |
| Catálogo lento na primeira página | o índice de 1025 ainda não está em cache | aguarde ~1 s; as próximas usam cache |
| `502 UPSTREAM_ERROR` | PokéAPI fora do ar/limite de requisições | a UI mostra o erro com botão “tentar de novo” |
| Favoritos não persistem | permissão de escrita em `data/` | `mkdir -p data && chmod u+w data` ou `FAVORITES_FILE=/tmp/fav.json` |
| `npm run smoke` falha em conexão | servidor não está de pé | rode `npm start` primeiro |
