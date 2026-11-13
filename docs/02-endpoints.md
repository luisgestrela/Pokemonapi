# Referência de endpoints — API Pokédex Explorer

Base: `http://localhost:3000/api` (monólito) ou `http://localhost:4000/api` (gateway).
Todas as respostas usam o mesmo envelope:

```json
{
  "ok": true,
  "data": { "...": "carga útil" },
  "meta": {
    "cached": false,
    "source": "pokemon-detail",
    "generatedAt": "2026-11-12T18:31:22.118Z",
    "durationMs": 143
  }
}
```

Em caso de erro, `ok:false` e `error:{ code, message, details? }` — nunca há stack no corpo.

| Código | `error.code` | Quando |
|---|---|---|
| 400 | `BAD_REQUEST` | parâmetro inválido (página, tamanho, geração, tipo, ordem) |
| 404 | `NOT_FOUND` | Pokémon/recurso inexistente na PokéAPI ou rota desconhecida (`ROUTE_NOT_FOUND`) |
| 422 | `VALIDATION_ERROR` | corpo malformado (favorito sem `id`, `id` não numérico) |
| 502 | `UPSTREAM_ERROR` | PokéAPI respondeu 5xx/estourou timeout/esgotou retries |
| 502 | `SERVICE_UNAVAILABLE` | (gateway) microsserviço não respondeu |
| 500 | `INTERNAL_ERROR` | falha inesperada (registrada no log do servidor) |

---

## 1. Pokémon (ficha)

### `GET /api/pokemon/:id`
`:id` aceita número (`25`) ou nome (`pikachu`) — **Atividades 1, 2, 3, 4, 5, 6, 7**.

| Parâmetro | Descrição |
|---|---|
| `incluir` | lista separada por vírgula: `especie`, `evolucao` (agrega tudo no mesmo response) |

```json
{
  "id": 6, "name": "charizard", "label": "Charizard", "dex": "#006",
  "types": [{ "id": "fire", "label": "Fogo", "color": "#f08030" }],
  "measures": { "raw": { "height": 17, "weight": 905 }, "meters": 1.7, "centimeters": 170,
                "kilograms": 90.5, "feet": 5.58, "pounds": 199.52,
                "heightLabel": "1.7 m", "weightLabel": "90.5 kg" },
  "sprites": { "official": "…/official-artwork/6.png", "pixel": "…/pokemon/6.png",
               "animated": "…/gif.png", "alternative": "…" },
  "abilities": [{ "name": "blaze", "label": "Blaze", "hidden": false, "description": "…" }],
  "stats": [{ "id": "hp", "label": "HP", "value": 78, "percentage": 30.6, "relativePercentage": 87.1 }],
  "baseTotal": 534,
  "statsSummary": { "scaleMax": 255, "highest": { "id": "special-attack", "value": 109 } }
}
```

### `GET /api/pokemon/:id/especie` — Atividade 14
Retorna `genus`, `description` (pt-BR quando existir), `generation` (`label: "Geração I"`, `range`, `games`),
`habitat`/`color` traduzidos, `eggGroups`, `isLegendary`, `captureRate`, `hatchCounter`, `varieties`,
`allDescriptions` (todas as versões publicadas).

### `GET /api/pokemon/:id/evolucao` — Atividade 15
```json
{ "count": 3, "stages": [
    { "stage": 1, "id": 4, "label": "Charmander", "triggers": [{ "type": "level_up", "label": "Nível 16" }] } ],
  "current": { "id": 6, "label": "Charizard" } }
```
Gatilhos cobrem `level-up`, `use-item`, `trade`, `known-move`, `shed` e fellicidade/beleza.

### `GET /api/pokemon/:id/estatisticas` — Atividades 6 e 7
Perfil agregado: `radar[]`, `powerIndex`, `average`, `baseTotal`, `types`, `effectiveness` do tipo primário.

### `GET /api/pokemon/comparar?a=25&b=6` — Atividade 13
`data.left`, `data.right` (perfis) e `data.winner` por dimensão (`baseTotal`, `powerIndex`, `average`) com
`winner` e `diff`. Retorna 400 se faltar `a` ou `b`.

### `GET /api/pokemon/aleatorio?tipo=fire&geracao=1` — Atividade 16
Sorteia dentro do universo filtrado e devolve a ficha completa.

---

## 2. Catálogo, busca, paginação e filtros

### `GET /api/catalogo`
| Parâmetro | Valores | Padrão |
|---|---|---|
| `q` | parte do nome, nome completo ou número | — |
| `tipos` | CSV de ids (`fire,water`) ou rótulos PT (`fogo,agua`) | — |
| `match` | `any` (qualquer) / `all` (todos) | `any` |
| `geracao` | 1–9 | — |
| `ordem` | `numero-asc`, `numero-desc`, `nome-asc`, `nome-desc` | `numero-asc` |
| `pagina` | 1–86 | `1` (fora do intervalo é ajustado para a última válida) |
| `tamanho` | 6, 12, 24, 36 | `12` |

`meta` traz `total`, `pages`, `page`, `limit`, `offset`, `from`, `to`, `hasPrevious`, `hasNext`,
`perPageOptions` e `filters` normalizados (incluindo rótulo/cor de cada tipo selecionado).

Cada item de `data` já vem pronto para o cartão: `dex`, `label`, `types[]` com cor,
`measures.heightLabel/weightLabel`, `baseTotal`, `sprites.official`.

### `GET /api/catalogo/tipos` — 18 tipos com `label` PT-BR e `color`
### `GET /api/catalogo/geracoes` — 9 gerações com faixa de números e jogos
### `GET /api/catalogo/sugestoes?q=char` — autocomplete (máx. 8)
### `GET /api/catalogo/tipos/:id/efetividade` — matriz de dano (x4/x2/x0.5/x0) + Pokémon de exemplo
### `GET /api/catalogo/estatisticas` — `total` e contagem por geração

---

## 3. Favoritos (Atividades 12 e 18)

| Método | Rota | Corpo/Resposta |
|---|---|---|
| `GET` | `/api/favoritos` | `{ items[], count, maxItems, file, updatedAt }` |
| `POST` | `/api/favoritos` | `{ id, name?, label?, types?, image? }` → 201 criado / 200 `alreadyExists:true` |
| `POST` | `/api/favoritos/alternar` | mesmo corpo → `{ favored: true/false, ... }` |
| `DELETE` | `/api/favoritos/:id` | remove (404 se não estava na lista) |
| `DELETE` | `/api/favoritos` | limpa tudo (`removed: n`) |

Persistência: `data/favorites.json` (caminho configurável por `FAVORITES_FILE`), escrita serializada,
limite `FAVORITES_MAX_ITEMS` (60) e validação de `id` numérico positivo (422 se inválido).

---

## 4. Infraestrutura, cache e observabilidade

| Rota | Descrição |
|---|---|
| `GET /api/health` | status, modo (`monolito`/`microsservicos`), versão, métricas; no gateway, checa os três serviços |
| `GET /api/cache/estatisticas` | entradas, hits, misses, taxa, evictions, TTL por família e chamadas à PokéAPI |
| `DELETE /api/cache` | limpa o cache (no gateway, limpa nos três serviços e soma o total removido) |
| `GET /api/arquitetura` | (gateway) mapa de rotas, portas e contadores de encaminhamento |

Cabeçalhos enviados em toda resposta: `X-API-Version: v1`, `X-Powered-By`; no gateway também
`X-Gateway-Service`, `X-Gateway-Upstream`, `X-Gateway-Latency-Ms`.
