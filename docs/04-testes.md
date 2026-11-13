# Testes — Pokédex Explorer (Atividade 20)

## Como executar

```bash
npm test        # suíte completa: 73 testes automatizados (unit + API)
npm run test:unit
npm run test:api
npm run smoke   # 37 verificações contra uma instância em execução
```

A suíte usa apenas o runner nativo do Node (`node:test`) e `supertest`. **Não depende de rede**:
o mock `tests/helpers/mock-pokeapi.js` substitui `global.fetch`, devolvendo respostas reais da
PokéAPI gravadas em `tests/fixtures/` (índice de 1025, tipos fire/water/grass/electric, fichas
25/6, espécies 25/6, habilidades, cadeias evolutivas 2 e 10) e sintetizando o restante de forma
determinística. Assim os testes são repetíveis e rodam em ~1,6 s.

## 1. Testes unitários (26) — `tests/unit/`

| Arquivo | Escopo |
|---|---|
| `utils.test.js` (11) | conversão de unidades (dm→m, hg→kg, ft/lb, arredondamento, `null` seguro), catálogo de 18 tipos, `findType` com sinônimos PT-BR e acentos, gerações por faixa de número, normalização de texto (acentos, hífens, caixa), `titleCase` PT |
| `services.test.js` (15) | `TtlCache` (TTL, hit/miss, evicção FIFO, `clear`, snapshot), envelope `ok/fail`, `asyncHandler`, erros HTTP com código estável, rótulos de gatilho de evolução, perfil de estatísticas, `toTypeIdList` (string, CSV, lista, alias), descrição de tipos |

## 2. Testes de API (47) — `tests/api/`

| Arquivo | Cobertura dos 4 grupos do enunciado |
|---|---|
| `catalog.api.test.js` (19) | **Grupo 2 — Catálogo e filtros**: envelope padrão, 12 itens/página, `total`/`pages`, avanço de offset, limites de `tamanho`, página fora do intervalo, filtro por tipo, tipo em português, `match=all` (interseção) × `match=any` (união), geração I, 400 em geração inválida, busca por nome/número/hífen, resultados vazios, ordenações, autocomplete, 18 tipos, 9 gerações, efetividade, 404 de tipo, estatísticas, **cache** (2ª chamada não vai à PokéAPI) e a regra de que **todas** as chamadas de saída são `GET` |
| `pokemon.api.test.js` (15) | **Grupo 1 — Busca e apresentação** e **Grupo 4 — Estado e dados**: id e nome resolvem igual, imagens oficiais/pixel/animadas, conversão de medidas, habilidades com descrição e marcação de oculta, 6 atributos com rótulo PT e percentual de barra, perfil/radar, espécie com geração PT e grupos de ovo, cadeia de 3 estágios com gatilhos, ficha agregada (`incluir=especie,evolucao`), comparação com veredito, 400 na comparação incompleta, sorteio com geração/tipo, 404 de Pokémon inexistente, identificador vazio |
| `favorites.api.test.js` (13) | **Grupo 3 — Erros e disponibilidade** e **Grupo 4**: CRUD de favoritos, idempotência (`alreadyExists`), alternar, 422 para `id` inválido/ausente, 404 para remoção inexistente, **persistência em disco**, limpeza, simulação de PokéAPI com HTTP 500 (**retry + 502 `UPSTREAM_ERROR`**), simulação de queda de rede (**502 sem derrubar o serviço**), 404 de rota, health, métricas/limpeza de cache e o contrato `{ok,data,meta}` em **todas** as rotas |

## 3. Smoke / testes manuais assistidos (37) — `scripts/smoke.js`

Executa contra um servidor real (monólito `:3000` ou gateway `:4000`) e imprime uma linha por
verificação. Cobre exatamente os quatro grupos do roteiro, mais o frontend servido pelo backend.

Resultado da execução desta entrega:

```
modo monólito (npm start, :3000)        → 37/37 verificações OK
modo microsserviços (npm run micro)    → 37/37 verificações OK
```

## 4. Matriz requisito × teste

| Atividade | Teste(s) |
|---|---|
| 1 Consultar Pokémon | `catalog/pokemon.api` (`GET /api/pokemon/25`), smoke “identificador numérico resolve” |
| 2 Identificador (nome ou número) | `pokemon.api` “aceita número e nome no mesmo endpoint” |
| 3 Imagens | `pokemon.api` “traz imagens oficiais e sprite pixel” |
| 4 Conversão de unidades | `utils.test` (4 casos) + `pokemon.api` (0,4 m / 6 kg / ft / lb) |
| 5 Habilidades | `pokemon.api` “lista habilidades com descrição e marca a oculta” |
| 6 Estatísticas | `pokemon.api` “seis atributos com total, média e escala” |
| 7 Barras gráficas | `pokemon.api` “barras recebem porcentagem pronta para o CSS” |
| 8 Pesquisa | `catalog.api` “busca por parte do nome e por número” |
| 9 Tratamento de erros | `favorites.api` (500/queda de rede/404/400/422) + `pokemon.api` 404 |
| 10 Paginação | `catalog.api` (página, tamanho, limites, `hasNext/hasPrevious`) |
| 11 Filtros por tipo | `catalog.api` (tipo único, PT, `all`, `any`, geração) |
| 12 Favoritos | `favorites.api` (CRUD, alternar, limite, 422) |
| 13 Comparação | `pokemon.api` “comparação entre dois Pokémon com veredito” |
| 14 Espécies | `pokemon.api` “espécie com texto, geração e grupos de ovo” |
| 15 Evoluções | `pokemon.api` “cadeia evolutiva com gatilhos em português” |
| 16 Pesquisa aleatória | `pokemon.api` “sorteio respeita geração e tipo” |
| 17 Cache | `services.test` (TtlCache) + `catalog.api` (2ª chamada do cache) + smoke |
| 18 Serviço de favoritos | `favorites.api` “favoritos persistem em disco” |
| 19 API Gateway | `favorites.api` “todas as respostas seguem o mesmo envelope”; smoke no `:4000` valida o gateway real |
| 20 Documentação e testes | este conjunto de documentos + a própria suíte |

## 5. Cobertura de casos de erro (rubrica “Erros e disponibilidade”)

- Pokémon inexistente → 404 com mensagem clara e `code: NOT_FOUND`
- Página/geração/tamanho inválidos → 400 `BAD_REQUEST` (com ajuste automático quando possível)
- Corpo inválido em favoritos → 422 `VALIDATION_ERROR`
- PokéAPI respondendo 5xx → 2 novas tentativas com backoff e 502 `UPSTREAM_ERROR`
- PokéAPI fora do ar (erro de rede) → 502 `UPSTREAM_ERROR` sem quebrar o processo
- Microsserviço derrubado → 502 `SERVICE_UNAVAILABLE` identificado por serviço
- Rota inexistente → 404 `ROUTE_NOT_FOUND` em JSON (nunca HTML)
