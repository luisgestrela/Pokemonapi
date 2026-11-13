'use strict';

const path = require('node:path');
const express = require('express');
const config = require('./config');
const { createGateway } = require('./middleware/api-gateway');
const { routers, services } = require('./routes');
const {
  requestLogger,
  errorHandler,
  notFoundHandler,
} = require('./middleware/error-handler');

/**
 * Aplicação do monólito (Arquitetura inicial do roteiro):
 *
 *   Navegador  ->  Node.js + Express  ->  PokéAPI v2 (somente GET)
 *
 * O mesmo app serve o frontend estático em / e a API em /api, atravessando
 * a camada de API Gateway interna, que padroniza respostas e erros.
 */
function createApp({ staticDir } = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(requestLogger);

  // CORS simples: a atividade roda localmente, mas permite abrir o frontend
  // em outro dispositivo/porta durante a demonstração.
  app.use((req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const gateway = createGateway({ routers, services });
  app.use('/api', gateway);

  const assets = staticDir ?? path.join(__dirname, '..', 'public');
  // sem maxAge: o Express envia ETag e o navegador revalida, evitando
  // CSS/JS antigos durante o desenvolvimento da atividade.
  app.use(
    express.static(assets, {
      extensions: ['html'],
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache'); // revalida por ETag
      },
    }),
  );

  app.get('/', (req, res) => res.sendFile(path.join(assets, 'index.html')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
