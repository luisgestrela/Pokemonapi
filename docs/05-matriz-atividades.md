# Matriz das 20 atividades × implementação

Cada linha mostra **on**de a atividade aparece no produto (frontend), **qua**l rota/serviço atende
e **com**o foi validada. Fonte do checklist: aba “Atividades” do enunciado
(`https://senaiba.my.canva.site/pokapi`).

| # | Atividade | Onde no frontend | Rota / módulo | Evidência |
|---|---|---|---|---|
| 01 | Consultar Pokémon por nome | Campo de busca + botão **Rastrear** (`/` atalho) | `GET /api/pokemon/:id` · `pokemon.service.getDetail` | `pokemon.api.test`, smoke |
| 02 | Consultar por identificador (número) | Mesma busca aceita `25` | `PokeApiClient.resourceKey` | `pokemon.api.test` |
| 03 | Apresentar imagens do Pokémon | Arte oficial no cartão e na ficha; sprite pixel nos estágios de evolução | `sprites.official/pixel/animated/alternative` | smoke “imagens oficiais presentes” |
| 04 | Converter unidades | Bloco **Medidas convertidas** (`0.4 m` e `6 kg` + ft/lb) | `utils/units.js` | 4 testes unitários + API |
| 05 | Exibir habilidades | Bloco **Habilidades** com descrição e selo “oculta” | `pokemon.service.buildAbilities` (busca `ability/{id}`) | `pokemon.api.test` |
| 06 | Exibir estatísticas | 6 linhas com valor, soma, média e índice de poder | `stats.service.buildProfile` | `pokemon.api.test` |
| 07 | Criar barras gráficas | Barras com largura `%` e escala 255 | `stats[].percentage` + CSS `.stat-bar` | `pokemon.api.test` |
| 08 | Implementar pesquisa | Busca com autocomplete (`/api/catalogo/sugestoes`), tolerante a acento/hífen | `catalog.service.applySearch` | `catalog.api.test` |
| 09 | Tratamento de erros | Painel de alerta com botão “tentar de novo”, skeleton, estado vazio | `core/http-error`, `middleware/error-handler`, `api.js` | 8 casos de erro na suíte |
| 10 | Criar paginação | Pager com números, ‹ Anterior/Próximo ›, 6/12/24/36 por página | `catalog.service.paginate` | `catalog.api.test` |
| 11 | Filtros por tipo | 18 chips coloridos + “Todos” + critério **qualquer/todos** | `catalog.service.resolveCandidates` + `loadTypeIndex` | `catalog.api.test` |
| 12 | Favoritos | ★ no cartão, ☆/★ na ficha, painel lateral, filtro “somente favoritos” | `favorites.service` + `api.favorites` | `favorites.api.test` |
| 13 | Comparação | Botão **＋ Comparar** + overlay lado a lado com barras espelhadas e veredito | `GET /api/pokemon/comparar` | `pokemon.api.test` |
| 14 | Consulta de espécies | Bloco **Espécie** (texto, geração, habitat, cor, captura, amistad, forma, grupos de ovo) | `species.service` (`pokemon-species`) | `pokemon.api.test` |
| 15 | Evoluções | Linha do tempo com sprites e gatilhos “Nível 16/36” | `evolution.service` (`evolution-chain`) | `pokemon.api.test` + unit |
| 16 | Pesquisa aleatória | Botão **⤫ Sortear** (também aceita filtros ativos) | `GET /api/pokemon/aleatorio` | `pokemon.api.test` |
| 17 | Cache | Painel **Cache do servidor** (entradas, acertos, taxa, requisições) + botão Limpar; badge `cache` na ficha | `core/cache.js` TTL por família | unit + `catalog.api` + smoke |
| 18 | Serviço de favoritos | Sincroniza com o backend (`sincronização: online/local`) e persiste após recarregar | `data/favorites.json` + `localStorage` | smoke + `favorites.api` |
| 19 | API Gateway | Rodapé **Arquitetura em uso** + `/api/health`; no modo distribuído, o mesmo frontend roda em `:4000` | `server/middleware/api-gateway.js` (interno) e `gateway/index.js` (real) | smoke nos dois modos |
| 20 | Documentação e testes | `README.md` + 6 documentos em `docs/`; 73 testes + 37 verificações de smoke | `tests/`, `scripts/smoke.js` | execução desta entrega |

## Extras além do enunciado (pedidos do aluno)

- **Visual novo, temático Pokémon**: “Terminal PokéTech” — fundo grafite com textura de scanlines,
  cabeçalho em Poké Ball, tipografia Orbitron/Chakra Petch, cartões com brilho na cor do tipo,
  chips nas cores oficiais dos jogos, animações de varredura e anel de carregamento. O site de
  referência é claro/creme com serifado; nenhum elemento visual foi copiado dele.
- **Mais filtragens por tipagem**: os 18 tipos (a demo tinha 4), combinação *qualquer* × *todos*,
  filtro combinado com geração I–IX, ordenação por número/nome, tamanho de página e
  “somente favoritos” — todos processados no servidor, não na lista já carregada.
- **Localização**: rótulos de tipo, atributos, geração, habitat, cor, forma, grupos de ovo, taxa de
  crescimento e gatilhos de evolução em português, preservando o termo original da PokéAPI quando
  não há tradução.
- **Robustez**: timeout + 2 novas tentativas, envelope único, cabeçalhos de versão, cache com
  métricas, limpeza manual de cache e proteção contra respostas atrasadas (guarda de sequência).
- **Arena de Batalha**: dois slots alimentados pela ficha técnica, confronto executado no frontend
  pelos seis base stats, resultado com pontuação total, vencedor/empate e atributo de maior diferença;
  inclui sorteio de rival, limpeza da arena, turnos por velocidade, energia virtual, golpes animados,
  projétil, flash de impacto, sprites em avanço/recuo e log narrado inspirado no anime.
