'use strict';

const express = require('express');
const { asyncHandler, ok } = require('../core/async-handler');
const favorites = require('../services/favorites.service');
const { unprocessable } = require('../core/http-error');

const router = express.Router();

function parsePayload(body = {}) {
  return {
    id: body.id ?? body.pokemonId ?? body.numero,
    name: body.name ?? body.nome ?? null,
    label: body.label ?? body.apelido ?? null,
    types: Array.isArray(body.types) ? body.types : [],
    image: body.image ?? body.imagem ?? null,
  };
}

/** GET /api/favoritos — lista persistida no backend (Atividades 12 e 18). */
router.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await favorites.list(), { source: 'favorites' })),
);

/** POST /api/favoritos — adiciona. */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = parsePayload(req.body);
    if (payload.id === undefined || payload.id === null) {
      throw unprocessable('Campo "id" é obrigatório para favoritar.', { body: req.body });
    }
    const result = await favorites.add(payload);
    ok(res, result, { source: 'favorites', status: result.created ? 201 : 200 });
  }),
);

/** POST /api/favoritos/alternar — alterna (favoritar/desfavoritar). */
router.post(
  '/alternar',
  asyncHandler(async (req, res) => {
    const payload = parsePayload(req.body);
    if (payload.id === undefined || payload.id === null) {
      throw unprocessable('Campo "id" é obrigatório para alternar.', { body: req.body });
    }
    ok(res, await favorites.toggle(payload), { source: 'favorites' });
  }),
);

/** DELETE /api/favoritos/:id — remove um. */
router.delete(
  '/:id',
  asyncHandler(async (req, res) =>
    ok(res, await favorites.remove(req.params.id), { source: 'favorites' }),
  ),
);

/** DELETE /api/favoritos — limpa a lista. */
router.delete(
  '/',
  asyncHandler(async (req, res) => ok(res, await favorites.clear(), { source: 'favorites' })),
);

module.exports = router;
