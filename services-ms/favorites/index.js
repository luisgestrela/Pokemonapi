'use strict';

/**
 * Microsserviço FAVORITOS
 * Responsabilidade: única fonte de verdade das preferências do usuário,
 * com persistência em arquivo e limite de itens.
 */
const express = require('express');
const config = require('../../server/config');
const favoritesRoutes = require('../../server/routes/favorites.routes');
const { ok } = require('../../server/core/async-handler');
const { cache } = require('../../server/core/cache');
const { pokeapi } = require('../../server/core/pokeapi-client');
const { errorHandler, notFoundHandler, requestLogger } = require('../../server/middleware/error-handler');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(requestLogger);
app.use((req, res, next) => {
  res.setHeader('X-Service', 'favorites-service');
  next();
});

app.get('/health', (req, res) =>
  ok(res, {
    service: 'favorites-service',
    status: 'online',
    port: config.microservices.favoritesPort,
    storage: config.favorites.file,
    maxItems: config.favorites.maxItems,
  }),
);

app.use('/favoritos', favoritesRoutes);


// Contrato de cache igual ao do monólito: o gateway agrega这些informações de cada serviço.
app.get('/cache/estatisticas', (req, res) =>
  ok(res, {
    service: 'favorites-service',
    cache: cache.snapshot(),
    upstream: pokeapi.snapshot(),
  }),
);
app.delete('/cache', (req, res) =>
  ok(res, { service: 'favorites-service', removed: cache.clear() }),
);
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.microservices.favoritesPort, () => {
    // eslint-disable-next-line no-console
    console.log(`[favorites-service] ouvindo na porta ${config.microservices.favoritesPort}`);
  });
}

module.exports = app;
