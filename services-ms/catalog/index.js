'use strict';

/**
 * Microsserviço CATÁLOGO
 * Responsabilidade: índice de Pokémon, filtros por tipo/geração, busca,
 * ordenação, paginação e cache de listas.
 */
const express = require('express');
const config = require('../../server/config');
const catalogRoutes = require('../../server/routes/catalog.routes');
const pokemonRoutes = require('../../server/routes/pokemon.routes');
const { errorHandler, notFoundHandler, requestLogger } = require('../../server/middleware/error-handler');
const { ok } = require('../../server/core/async-handler');
const { cache } = require('../../server/core/cache');
const { pokeapi } = require('../../server/core/pokeapi-client');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(requestLogger);
app.use((req, res, next) => {
  res.setHeader('X-Service', 'catalog-service');
  next();
});

app.get('/health', (req, res) =>
  ok(res, {
    service: 'catalog-service',
    status: 'online',
    port: config.microservices.catalogPort,
    responsibilities: ['índice', 'filtros por tipo', 'geração', 'busca', 'paginação', 'cache'],
  }),
);

app.get('/info', (req, res) =>
  ok(res, {
    service: 'catalog-service',
    cache: require('../../server/core/cache').cache.snapshot(),
  }),
);

app.use('/catalogo', catalogRoutes);
// A hidratação de cartões usa o serviço de Pokémon: permanece aqui para que o
// catálogo devolva a página pronta, como no monólito.
app.use('/pokemon', pokemonRoutes);


// Contrato de cache igual ao do monólito: o gateway agrega这些informações de cada serviço.
app.get('/cache/estatisticas', (req, res) =>
  ok(res, {
    service: 'catalog-service',
    cache: cache.snapshot(),
    upstream: pokeapi.snapshot(),
  }),
);
app.delete('/cache', (req, res) =>
  ok(res, { service: 'catalog-service', removed: cache.clear() }),
);
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.microservices.catalogPort, () => {
    // eslint-disable-next-line no-console
    console.log(`[catalog-service] ouvindo na porta ${config.microservices.catalogPort}`);
  });
}

module.exports = app;
