'use strict';

/**
 * Ambiente de teste: aponta os favoritos para um arquivo temporário,
 * instala o mock offline da PokéAPI e devolve o app Express pronto.
 *
 * A configuração é lida uma única vez pelo Node, então o isolamento entre
 * testes é feito regravando o arquivo de favoritos a cada ambiente novo.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokedex-test-'));
process.env.FAVORITES_FILE = path.join(tempDir, 'favorites.json');
process.env.LOG_REQUESTS = 'off';
process.env.NODE_ENV = 'test';

const { createApp } = require('../../../server/app');
const { cache } = require('../../../server/core/cache');
const { pokeapi } = require('../../../server/core/pokeapi-client');
const favorites = require('../../../server/services/favorites.service');
const config = require('../../../server/config');
const { installFetchMock } = require('../../helpers/mock-pokeapi');

function resetMetrics() {
  const metrics = pokeapi.metrics;
  metrics.requests = 0;
  metrics.retries = 0;
  metrics.failures = 0;
  metrics.cacheHits = 0;
}

function createTestApp(mockOptions = {}) {
  // estado de favoritos zerado em memória e em disco
  fs.writeFileSync(process.env.FAVORITES_FILE, JSON.stringify({ items: [], count: 0 }));
  favorites._reset();
  cache.clear();
  resetMetrics();

  const mock = installFetchMock(mockOptions);
  const app = createApp();

  return {
    app,
    mock,
    tempDir,
    favoritesFile: config.favorites.file,
    reset() {
      fs.writeFileSync(process.env.FAVORITES_FILE, JSON.stringify({ items: [], count: 0 }));
      favorites._reset();
      cache.clear();
      resetMetrics();
    },
    cleanup() {
      mock.restore();
      cache.clear();
      favorites._reset();
    },
  };
}

function dispose() {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

module.exports = { createTestApp, tempDir, dispose };
