# Arquitetura — Pokédex Explorer

## 1. Arquitetura inicial (obrigatória): monólito Node.js + Express

```
┌────────────────────┐    HTTP GET /api/*     ┌──────────────────────────┐   HTTP GET    ┌──────────┐
│  Frontend estático │ ─────────────────────► │  Node.js + Express (:3000)│ ────────────► │ PokéAPI  │
│  public/ (HTML,CSS,│ ◄───── JSON envelope ── │  API Gateway interna     │ ◄─── JSON ─── │  v2      │
│  JS vanilla)       │                         │  + serviços de domínio   │               │          │
└────────────────────┘                         └──────────────────────────┘               └──────────┘
```

O próprio Express serve os arquivos estáticos (`express.static`) e expõe a API sob `/api`.
**Todas** as chamadas de saída são `GET` — nenhum `POST`/`PUT` é enviado à PokéAPI.

Camadas:

```
server/
├── index.js                  # bootstrap (porta, host, encerramento gracioso)
├── app.js                    # express: json, CORS, logger, gateway, estáticos, erros
├── config.js                 # 100% das variáveis de ambiente centralizadas aqui
├── middleware/
│   ├── api-gateway.js        # Atividade 19: ponto de entrada único, roteia por prefixo
│   └── error-handler.js      # Atividade 9: 404 de rota + tradutor central de erros
├── core/
│   ├── pokeapi-client.js     # GET com timeout (AbortController), retry/backoff, cache
│   ├── cache.js              # TtlCache (LRU-FIFO, TTL por família, métricas)  [Ativ. 17]
│   ├── async-handler.js      # asyncHandler + envelope {ok,data,meta}
│   └── http-error.js         # erros de domínio com status + código estável
├── routes/                   # contratos HTTP (validação de query/params)
└── services/                 # regras de negócio e agregação de dados
    ├── catalog.service.js    # índice 1025, filtros por tipo/geração, busca, ordenação, página
    ├── pokemon.service.js    # ficha, unidades, habilidades, atributos, imagens, sorteio
    ├── species.service.js    # pokémon-species (texto, geração, habitats, grupos de ovo)
    ├── evolution.service.js  # evolução-chain (estágios + gatilhos em português)
    ├── stats.service.js      # índice de poder, radar, efetividade de tipos
    ├── favorites.service.js  # favoritos persistidos em data/favorites.json
    └── text.service.js       # normalização (acentos, slugs, tokens de busca)
└── utils/
    ├── units.js              # decímetros→metros, hectogramas→kg, pés/libras
    ├── types.js              # 18 tipos com rótulo/cor PT-BR + 9 gerações
    └── labels-pt.js          # glossário PT-BR de enums da PokéAPI
```

### Fluxo de uma consulta de ficha

`cli` → `GET /api/pokemon/6?incluir=especie,evolucao`
→ `api-gateway` escolhe o prefixo `/pokemon` → `pokemon.routes` valida →
`pokemon.service.getDetail` (cache `pokemon|6`) → `species.service` (cache `species|6`) →
`evolution.service` (lê `evolution_chain.url` da espécie e depois `evolution-chain/{id}`) →
agrega em um único JSON → `ok(res, data, meta)`.

O navegador recebe **uma** resposta, embora o servidor tenha feito 3 buscas na PokéAPI.
Esse é o ponto central da atividade: o frontend não conhece a PokéAPI, conhece a nossa API.

## 2. Estratégias de dados (por que não 1025 requisições)

| Problema | Estratégia | Evidência |
|---|---|---|
| Precisar de total/páginas corretos | índice único `GET /pokemon?limit=1025&offset=0` mantido em cache por 1 h | `catalog.service.loadIndex` |
| Filtro por tipo sem varrer tudo | índice auxiliar por tipo: `GET /type/{tipo}` (cache 12 h) | `catalog.service.loadTypeIndex` |
| Página cara de hidratar | só os 12 itens da página viram ficha completa, com concorrência limitada (12) | `catalog.service.hydrate` |
| PokéAPI lenta/fora do ar | TTL cache + timeout de 8 s + 2 novas tentativas com backoff | `core/cache.js`, `core/pokeapi-client.js` |

## 3. Desafio avançado: microsserviços + API Gateway

```
                       ┌───────────────────────────────────────┐
                       │        API Gateway (:4000)            │
                       │  - ponto de entrada único do frontend  │
                       │  - roteia por padrão de URL            │
                       │  - padroniza envelope, cabeçalhos,     │
                       │    latência e trata serviço fora do ar │
                       └───┬───────────────┬───────────────┬────┘
             /api/catalogo │  /api/pokemon │  /api/pokemon │  /api/favoritos
             /api/pokemon* │  */especie    │  */evolucao   │
                           ▼               ▼   */estatistic│
              ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
              │  CATÁLOGO (:4001)│  │ ESTATÍSTICAS     │  │  FAVORITOS (:4003)│
              │ índice, filtros, │  │ (:4002) espécies,│  │ persistência em   │
              │ busca, página,   │  │ evolução, atri-  │  │ arquivo, limite   │
              │ cache de listas  │  │ butos, efetivid. │  │ de itens          │
              └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                       └──────── HTTP GET ────┴────────────────────┘
                                    PokéAPI v2
```

Arquivos: `gateway/index.js` + `services-ms/{catalog,stats,favorites}/index.js`
+ `scripts/run-microservices.js` (sobe tudo com um comando).

O gateway **encaminha de verdade** (`fetch` interno com timeout de 6 s), adiciona:

- `X-Gateway-Service`, `X-Gateway-Upstream`, `X-Gateway-Latency-Ms` na resposta;
- `meta.gateway = { service, port, latencyMs, architecture: 'microsservicos' }`;
- `/api/health` que **consulta os três serviços** e reporta `online`/`offline`;
- `/api/arquitetura` com o mapa de rotas e contadores de encaminhamento;
- agregação de cache: `GET /api/cache/estatisticas` soma as métricas dos três serviços;
- quando um serviço não responde: `502 SERVICE_UNAVAILABLE` com o nome do serviço.

Nada no frontend mudou entre os dois modos: só a porta-base (`API_BASE`).
É a demonstração prática do conteúdo de "Arquitetura" do roteiro.

## 4. Frontend

SPA em JavaScript puro (sem build, sem framework), organizada em módulos:

```
public/
├── index.html            # semântica, landmarks, aria-live, atalhos
├── css/theme.css         # tokens de cor/tipografia + estrutura do "terminal"
├── css/app.css           # cartões, ficha, filtros, comparação, overlay
└── js/
    ├── config.js         # URLs, chaves de localStorage, catálogo visual de tipos
    ├── api.js            # cliente HTTP (envelope, timeout, erros amigáveis)
    ├── state.js          # store: filtros, paginação, favoritos, comparação, eventos
    ├── ui.js             # funções puras de renderização (HTML por dados)
    └── app.js            # orquestração: eventos do DOM, cargas, guarda de sequência
```

Decisões:

- **Guarda de sequência** (`catalogSeq`/`detailSeq`): respostas atrasadas de consultas
  anteriores são descartadas — evita listar resultados de um filtro já trocado.
- **Estado no servidor**: paginação, filtros e ordenação são recalculados no backend;
  o frontend nunca fatia a lista de 1025 por conta própria.
- **Favoritos em dois níveis**: otimista no `localStorage` + `POST /api/favoritos`;
  se o backend cair, o painel continua funcionando e avisa `sincronização: local`.
- **Acessibilidade**: `role="button"` + `tabindex` nos cartões, navegação por setas,
  `aria-pressed` nos chips de tipo, `aria-live` no status, foco visível,
  texto alternativo em todas as imagens e contraste AA sobre fundo escuro.

## 5. Comparação com o modelo do site de referência

| Site de referência (Canva) | Esta entrega |
|---|---|
| Frontend claro/creme, serifado, 3 botões de filtro | Terminal PokéTech escuro, 18 tipos + geração + ordenação + tamanho de página |
| Chama a PokéAPI direto do navegador | Backend Node.js/Express obrigatório; o navegador só fala com `/api` |
| Favoritos apenas no navegador | Serviço de favoritos com persistência em arquivo + espelho local |
| 12 itens por página fixos | 6/12/24/36 com recálculo de páginas no servidor |
| Sem comparação | Comparação lado a lado com barras espelhadas e veredito |
| Sem testes/documentação | 73 testes automatizados + smoke de 37 verificações + 6 documentos |
