'use strict';

/** Erro de aplicação com status HTTP e código estável para o frontend. */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

const notFound = (message = 'Recurso não encontrado.', details) =>
  new HttpError(404, 'NOT_FOUND', message, details);

const badRequest = (message = 'Requisição inválida.', details) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

const upstream = (message = 'A PokéAPI não respondeu corretamente.', details) =>
  new HttpError(502, 'UPSTREAM_ERROR', message, details);

const timeout = (message = 'Tempo limite excedido ao consultar a PokéAPI.', details) =>
  new HttpError(504, 'UPSTREAM_TIMEOUT', message, details);

const unprocessable = (message, details) =>
  new HttpError(422, 'VALIDATION_ERROR', message, details);

module.exports = {
  HttpError,
  notFound,
  badRequest,
  upstream,
  timeout,
  unprocessable,
};
