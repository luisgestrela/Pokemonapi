'use strict';

const express = require('express');

/**
 * API Gateway (Atividade 19).
 *
 * No monólito, o gateway é uma camada interna: ponto de entrada único do
 * frontend (/api/*), que rotaciona para os routers de domínio, padroniza o
 * envelope de resposta e concentra cabeçalhos, temporização e observabilidade.
 *
 * No desafio de microsserviços (pasta services-ms/ + gateway/), a mesma
 * interface externa é atendida por um processo separado que encaminha as
 * requisições por HTTP para os serviços Catálogo, Estatísticas e Favoritos.
 */
function createGateway({ routers, services, version = 'v1' }) {
  const gateway = express.Router();

  gateway.use((req, res, next) => {
    req.startedAt = Date.now();
    res.setHeader('X-Powered-By', 'PokedexExplorer Gateway');
    res.setHeader('X-API-Version', version);
    next();
  });

  gateway.use((req, res, next) => {
    const prefix = Object.keys(routers).find((path) => req.path.startsWith(path));
    req.serviceName = prefix ? services[prefix] : 'gateway';
    next();
  });

  for (const [prefix, router] of Object.entries(routers)) {
    gateway.use(prefix, router);
  }

  gateway.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Nenhum serviço atende ${req.method} ${req.baseUrl}${req.path}.`,
      },
      meta: { service: 'gateway', routes: Object.keys(routers) },
    });
  });

  gateway.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status ?? 502).json({
      ok: false,
      error: {
        code: error.code ?? 'GATEWAY_ERROR',
        message: error.message ?? 'Falha no gateway.',
        service: req.serviceName ?? 'gateway',
      },
    });
  });

  return gateway;
}

module.exports = { createGateway };
