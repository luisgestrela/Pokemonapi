'use strict';

/**
 * Microsserviço ESTATÍSTICAS
 * Responsabilidade: consolidar atributos, habilidades, medidas convertidas,
 * espécies e evoluções em perfis prontos para comparação.
 */
const express = require('express');
const config = require('../../server/config');
const pokemonRoutes = require('../../server/routes/pokemon.routes');
const statsService = require('../../server/services/stats.service');
const { asyncHandler, ok } = require('../../server/core/async-handler');
const { cache } = require('../../server/core/cache');
const { pokeapi } = require('../../server/core/pokeapi-client');
const { errorHandler, notFoundHandler, requestLogger } = require('../../server/middleware/error-handler');

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use(requestLogger);
app.use((req, res, next) => {
  res.setHeader('X-Service', 'stats-service');
  next();
});

app.get('/health', (req, res) =>
  ok(res, {
    service: 'stats-service',
    status: 'online',
    port: config.microservices.statsPort,
    responsibilities: ['atributos', 'habilidades', 'medidas', 'espécies', 'evoluções', 'efetividade'],
  }),
);

app.get(
  '/tipos/:id/efetividade',
  asyncHandler(async (req, res) => ok(res, await statsService.getType(req.params.id))),
);

app.use('/pokemon', pokemonRoutes);


// Contrato de cache igual ao do monólito: o gateway agrega这些informações de cada serviço.
app.get('/cache/estatisticas', (req, res) =>
  ok(res, {
    service: 'stats-service',
    cache: cache.snapshot(),
    upstream: pokeapi.snapshot(),
  }),
);
app.delete('/cache', (req, res) =>
  ok(res, { service: 'stats-service', removed: cache.clear() }),
);
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  app.listen(config.microservices.statsPort, () => {
    // eslint-disable-next-line no-console
    console.log(`[stats-service] ouvindo na porta ${config.microservices.statsPort}`);
  });
}

module.exports = app;
