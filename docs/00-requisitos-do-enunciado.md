# Resumo dos requisitos — atividade "Pokédex Explorer Web App"
Fonte: https://senaiba.my.canva.site/pokapi (lido em 2026-11-12)

## Formato do enunciado (site Canva com abas Pokédex / Atividades / Arquitetura / Testes / Avaliação)

- Título: Pokédex Explorer — "Laboratório de APIs · roteiro interativo".
- Carga horária sugerida: 8 horas em dois encontros de 4h. Nível básico ao intermediário.
- Encontro 1: HTTP GET, API REST, PokéAPI, Node.js + Express, consulta de Pokémon e integração com frontend.
- Encontro 2: pesquisa, paginação, filtros, favoritos, comparação, testes e discussão de microsserviços.

## Objetivos de aprendizagem
Consumir API REST pública; criar rotas com Node.js e Express; integrar frontend e backend em JS;
converter e apresentar dados; tratar erros e carregamento; comparar backend único × microsserviços.

## As 20 atividades (checklist do projeto)
01 Consultar Pokémon · 02 Consultar por identificador · 03 Apresentar imagens · 04 Converter unidades ·
05 Exibir habilidades · 06 Exibir estatísticas · 07 Criar barras gráficas · 08 Implementar pesquisa ·
09 Tratar erros · 10 Criar paginação · 11 Filtros por tipo · 12 Favoritos · 13 Comparação ·
14 Consulta de espécies · 15 Evoluções · 16 Pesquisa aleatória · 17 Cache · 18 Serviço de favoritos ·
19 API Gateway · 20 Documentação e testes.

## Arquitetura exigida
- Inicial: Frontend → Node.js + Express → PokéAPI (somente GET). (A demo do site chama a PokéAPI direto no navegador; o diagrama descreve o que deve ser construído.)
- Desafio avançado: microsserviços com API Gateway como ponto de entrada único → serviços Catálogo, Estatísticas e Favoritos → PokéAPI v2 (GET).
  - Catálogo: consulta, listas, filtros por tipo, cache.
  - Estatísticas: habilidades, medidas, atributos, espécies e evoluções.
  - Favoritos: preferências do usuário (na demo ficam só no navegador).
  - API Gateway: entrada única, encaminhamento, padronização de respostas e erros.
- Endpoints de referência: /pokemon/pikachu, /pokemon/25, /pokemon?limit=12&offset=0, /type/fire, /pokemon-species/25.

## Testes obrigatórios (4 grupos)
1. Busca e apresentação: nome e número válidos; imagem, tipos, habilidades, conversão altura/peso, 6 barras de estatísticas.
2. Catálogo e filtros: páginas de 12 itens, total de páginas, anterior/próximo, alternar Fogo/Água/Planta/Todos.
3. Erros e disponibilidade: Pokémon inexistente, proteção contra página inválida, simular indisponibilidade da PokéAPI.
4. Estado e dados: marcar/desmarcar atividades e persistência local, favoritos, comparação, espécie, evoluções, sorteio.

## Avaliação (rubrica, total 10,0)
- Consultas à API REST e apresentação correta dos dados — 2,0
- Pesquisa, paginação, filtros e tratamento de erros — 2,0
- Favoritos, comparação, espécies e evoluções — 2,0
- Organização do código e proposta arquitetural — 2,0
- Testes, documentação, acessibilidade e experiência de uso — 2,0

## Pedidos adicionais do usuário (entrega)
- Frontend com visual DIFERENTE do site de referência (referência é claro/creme, teal+coral, fonte serifada).
- Tema Pokémon.
- MAIS filtragens por tipagem de Pokémon (a demo só tinha Todos/Fogo/Água/Planta; entreguei os 18 tipos +
  combinação any/all, geração I–IX, ordenação, tamanho de página e "somente favoritos").

## Decisões da implementação entregue
- Backend: Node.js + Express (monólito) servindo frontend estático e /api; gateway interno padronizando envelope {ok,data,meta}.
- Serviços: pokeapi-client (só GET, timeout, retry, cache TTL), catálogo (índice + filtros + paginação server-side),
  pokémon (ficha/habilidades/atributos), espécie, evolução, estatísticas (perfil/efetividade), favoritos (JSON em data/favorites.json).
- Desafio: services-ms/{catalog,stats,favorites} + gateway/ real com encaminhamento HTTP (npm run micro, porta 4000).
- Testes: node:test (unit + api com supertest) e fixtures offline em tests/fixtures; npm test; npm run smoke.
- Frontend: "Terminal PokéTech" escuro (Orbitron + Chakra Petch), 18 chips de tipo, painéis de ficha/espécie/evolução,
  comparação em overlay, favoritos com sync backend+localStorage, atalhos / R ← → Esc, aria-live e foco visível.
