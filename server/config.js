'use strict';

/**
 * Configuração central da aplicação.
 * Tudo pode ser sobrescrito por variáveis de ambiente, o que permite
 * apontar o mesmo frontend para o monólito (porta 3000) ou para o
 * API Gateway dos microsserviços (porta 4000).
 */
const path = require('node:path');

const env = (key, fallback) => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

const num = (key, fallback) => {
  const parsed = Number(env(key, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isVercel = env('VERCEL', '') === '1';

module.exports = {
  env: env('NODE_ENV', 'development'),
  isVercel,
  port: num('PORT', 3000),
  host: env('HOST', '0.0.0.0'),

  // PokéAPI: todas as chamadas são HTTP GET (requisito da atividade).
  pokeapi: {
    baseUrl: env('POKEAPI_BASE_URL', 'https://pokeapi.co/api/v2'),
    timeoutMs: num('POKEAPI_TIMEOUT_MS', 8000),
    retries: num('POKEAPI_RETRIES', 2),
    retryBackoffMs: num('POKEAPI_RETRY_BACKOFF_MS', 350),
    userAgent: env('POKEAPI_USER_AGENT', 'PokedexExplorer/1.0 (atividade educacional)'),
  },

  cache: {
    enabled: env('CACHE_ENABLED', 'true') !== 'false',
    // TTL em milissegundos por família de dados.
    ttl: {
      list: num('CACHE_TTL_LIST', 60 * 60 * 1000), // listas: 1 hora
      pokemon: num('CACHE_TTL_POKEMON', 24 * 60 * 60 * 1000), // fichas: 24 h
      species: num('CACHE_TTL_SPECIES', 24 * 60 * 60 * 1000),
      type: num('CACHE_TTL_TYPE', 12 * 60 * 60 * 1000),
      evolution: num('CACHE_TTL_EVOLUTION', 7 * 24 * 60 * 60 * 1000),
    },
    maxEntries: num('CACHE_MAX_ENTRIES', 4000),
  },

  catalog: {
    defaultPageSize: num('PAGE_SIZE', 12),
    maxPageSize: 36,
    totalKnownPokemon: num('TOTAL_POKEMON', 1025),
    // Quantidade máxima de requisições simultâneas para hidratar um página.
    hydrationConcurrency: num('HYDRATION_CONCURRENCY', 12),
  },

  favorites: {
    file: env(
      'FAVORITES_FILE',
      isVercel
        ? path.join('/tmp', 'pokedex-explorer-favorites.json')
        : path.join(__dirname, '..', 'data', 'favorites.json'),
    ),
    maxItems: num('FAVORITES_MAX_ITEMS', 60),
  },

  // Modo microsserviços: portas locais de cada serviço.
  microservices: {
    gatewayPort: num('GATEWAY_PORT', 4000),
    catalogPort: num('CATALOG_SERVICE_PORT', 4001),
    statsPort: num('STATS_SERVICE_PORT', 4002),
    favoritesPort: num('FAVORITES_SERVICE_PORT', 4003),
    internalTimeoutMs: num('GATEWAY_TIMEOUT_MS', 6000),
  },
};
