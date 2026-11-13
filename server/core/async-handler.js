'use strict';

/** Envolve handlers async para que rejeições caiam no error handler (Express 4). */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Envelope padrão: toda resposta do gateway/serviços tem o mesmo formato. */
function ok(res, data, meta = {}) {
  return res.status(meta.status ?? 200).json({
    ok: true,
    data,
    meta: {
      cached: Boolean(meta.cached),
      source: meta.source ?? 'pokedex-api',
      generatedAt: new Date().toISOString(),
      durationMs: meta.durationMs,
      ...meta.extra,
    },
  });
}

function fail(res, error, fallbackStatus = 500) {
  const status = error.status ?? fallbackStatus;
  return res.status(status).json({
    ok: false,
    error: {
      code: error.code ?? (status >= 500 ? 'UPSTREAM_ERROR' : 'BAD_REQUEST'),
      message:
        error.publicMessage ||
        error.message ||
        'Não foi possível atender a requisição agora.',
      details: process.env.NODE_ENV === 'production' ? undefined : error.details,
    },
    meta: { generatedAt: new Date().toISOString() },
  });
}

module.exports = { asyncHandler, ok, fail };
