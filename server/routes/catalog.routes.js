'use strict';

const express = require('express');
const { asyncHandler, ok } = require('../core/async-handler');
const catalog = require('../services/catalog.service');
const stats = require('../services/stats.service');
const { listTypes, listGenerations } = require('../utils/types');

const router = express.Router();

/** GET /api/catalogo — paginação + filtros (Atividades 8, 10, 11). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await catalog.query({
      q: req.query.q ?? req.query.buscar,
      types: req.query.tipos ?? req.query.types,
      type: req.query.tipo ?? req.query.type,
      match: req.query.match ?? req.query.combinacao,
      generation: req.query.geracao ?? req.query.generation,
      sort: req.query.ordem ?? req.query.sort,
      page: req.query.pagina ?? req.query.page,
      limit: req.query.tamanho ?? req.query.limit,
      offset: req.query.deslocamento ?? req.query.offset,
      hydrate: req.query.resumo === 'true' ? false : true,
    });
    ok(res, result.items, {
      cached: result.cached,
      source: result.source,
      durationMs: Date.now() - (req.startedAt ?? Date.now()),
      extra: { ...result.pagination, filters: result.filters },
    });
  }),
);

/** GET /api/catalogo/estatisticas — visão agregada usada no rodapé do frontend. */
router.get(
  '/estatisticas',
  asyncHandler(async (req, res) => ok(res, await catalog.catalogStats())),
);

/** GET /api/catalogo/sugestoes?q=pika — autocomplete (Atividade 8). */
router.get(
  '/sugestoes',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limite) || 8, 20);
    ok(res, await catalog.suggest(req.query.q ?? req.query.termo ?? '', limit));
  }),
);

/** GET /api/catalogo/tipos — 18 tipos com rótulo e cor (Atividade 11 ampliada). */
router.get('/tipos', (req, res) => ok(res, listTypes()));

/** GET /api/catalogo/geracoes — faixas por geração (filtro extra). */
router.get('/geracoes', (req, res) => ok(res, listGenerations()));

/** GET /api/catalogo/tipos/:id/efetividade — fraquezas/resistências. */
router.get(
  '/tipos/:id/efetividade',
  asyncHandler(async (req, res) => ok(res, await stats.getType(req.params.id))),
);

module.exports = router;
