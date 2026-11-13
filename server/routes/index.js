'use strict';

const express = require('express');
const { ok } = require('../core/async-handler');
const { cache } = require('../core/cache');
const { pokeapi } = require('../core/pokeapi-client');
const config = require('../config');
const catalogRoutes = require('./catalog.routes');
const pokemonRoutes = require('./pokemon.routes');
const favoritesRoutes = require('./favorites.routes');

/** Rotas de infraestrutura: health, métricas e controle do cache. */
const metaRoutes = express.Router();

metaRoutes.get('/health', (req, res) =>
  ok(res, {
    status: 'online',
    mode: 'monolito',
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    services: ['catalogo', 'pokemon', 'estatisticas', 'favoritos', 'gateway'],
    upstream: config.pokeapi.baseUrl,
    pageSize: config.catalog.defaultPageSize,
  }),
);

metaRoutes.get('/cache/estatisticas', (req, res) =>
  ok(res, { cache: cache.snapshot(), upstream: pokeapi.snapshot() }, { source: 'cache' }),
);

metaRoutes.delete('/cache', (req, res) =>
  ok(res, { removed: cache.clear() }, { source: 'cache' }),
);

/** Mapa de roteadores + serviços, consumido pelo gateway interno. */
const routers = {
  '/catalogo': catalogRoutes,
  '/pokemon': pokemonRoutes,
  '/favoritos': favoritesRoutes,
  '/': metaRoutes,
};

const services = {
  '/catalogo': 'catalog-service',
  '/pokemon': 'stats-service',
  '/favoritos': 'favorites-service',
  '/': 'gateway',
};

module.exports = { routers, services, metaRoutes };
