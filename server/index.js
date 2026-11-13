'use strict';

const config = require('./config');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      '  ┌─────────────────────────────────────────────────┐',
      '  │  POKÉDEX EXPLORER · backend Node.js + Express   │',
      '  └─────────────────────────────────────────────────┘',
      `  mode     : monólito com API Gateway interna`,
      `  frontend : http://localhost:${config.port}`,
      `  api      : http://localhost:${config.port}/api/catalogo`,
      `  upstream : ${config.pokeapi.baseUrl} (somente GET)`,
      `  cache    : ${config.cache.enabled ? 'ativo' : 'desativado'}`,
      '',
    ].join('\n'),
  );
});
