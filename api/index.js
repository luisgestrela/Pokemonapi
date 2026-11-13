'use strict';

// Vercel carrega este arquivo como uma função serverless.
// O Express continua sendo a mesma aplicação usada no modo local.
const { createApp } = require('../server/app');

const app = createApp();

module.exports = (req, res) => {
  // Alguns adaptadores de rewrite entregam à função o caminho sem o prefixo
  // /api. O Express local monta o gateway nesse prefixo, então normalizamos
  // apenas esse caso para evitar 404 depois do deploy.
  if (!String(req.url || '').startsWith('/api')) {
    req.url = `/api${String(req.url || '/').startsWith('/') ? '' : '/'}${req.url || '/'}`;
  }
  return app(req, res);
};
