'use strict';

const { fail } = require('../core/async-handler');

/** Logger minimalista de requisições (sem dependências externas). */
function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    if (process.env.LOG_REQUESTS === 'off') return;
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`;
    // eslint-disable-next-line no-console
    console.log(line);
  });
  next();
}

/** 404 de rota: sempre em JSON para não confundir o frontend. */
function notFoundHandler(req, res) {
  fail(
    res,
    Object.assign(new Error(`Rota ${req.method} ${req.originalUrl} não existe nesta API.`), {
      status: 404,
      code: 'ROUTE_NOT_FOUND',
    }),
  );
}

/** Tratador central de erros (Atividade 9): nunca vaza stack para o cliente. */
function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;
  const status = error.status ?? 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[erro] ${req.method} ${req.originalUrl}:`, error.message);
  }
  fail(res, error);
}

module.exports = { requestLogger, notFoundHandler, errorHandler };
