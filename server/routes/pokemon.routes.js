'use strict';

const express = require('express');
const { asyncHandler, ok } = require('../core/async-handler');
const pokemonService = require('../services/pokemon.service');
const speciesService = require('../services/species.service');
const evolutionService = require('../services/evolution.service');
const statsService = require('../services/stats.service');
const catalogService = require('../services/catalog.service');
const { notFound, badRequest } = require('../core/http-error');

const router = express.Router();

/** GET /api/pokemon/aleatorio?tipo=fire&geracao=1 (Atividade 16). */
router.get(
  '/aleatorio',
  asyncHandler(async (req, res) => {
    const detail = await pokemonService.getRandom({
      type: req.query.tipo ?? req.query.type ?? null,
      generation: req.query.geracao ?? req.query.generation ?? null,
    });
    ok(res, detail, { source: 'random' });
  }),
);

/** GET /api/pokemon/comparar?a=25&b=6 (Atividade 13 no servidor). */
router.get(
  '/comparar',
  asyncHandler(async (req, res) => {
    const ids = [req.query.a ?? req.query.primero, req.query.b ?? req.query.segundo]
      .filter(Boolean)
      .map((value) => String(value).trim());
    if (ids.length !== 2) {
      throw badRequest('Informe os parâmetros a e b para comparar dois Pokémon.');
    }
    const entries = await Promise.all(
      ids.map(async (id) => {
        const detail = await pokemonService.getDetail(id);
        let species = null;
        try {
          species = await speciesService.getSpecies(detail.id);
        } catch {
          species = null;
        }
        return statsService.buildProfile(detail, species);
      }),
    );
    const [left, right] = entries;
    const dimensions = [
      ['baseTotal', 'Total de atributos'],
      ['powerIndex', 'Índice de poder'],
      ['average', 'Média dos atributos'],
    ];
    const winner = {};
    for (const [key, label] of dimensions) {
      const a = Number(left[key] ?? 0);
      const b = Number(right[key] ?? 0);
      winner[key] = { label, winner: a === b ? 'empate' : a > b ? left.label : right.label, diff: Math.abs(a - b) };
    }
    ok(res, { left, right, winner }, { source: 'comparar' });
  }),
);

/** GET /api/pokemon/:id — ficha completa; ?incluir=especie,evolucao,efetividade. */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const include = String(req.query.incluir ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const detail = await pokemonService.getDetail(req.params.id);
    const payload = { ...detail };

    const wanted = include.length
      ? include
      : ['especie', 'evolucao'];

    const tasks = [];
    if (wanted.includes('especie')) {
      tasks.push(
        speciesService
          .getSpecies(detail.id)
          .then((species) => {
            payload.species = species;
          })
          .catch(() => {
            payload.species = null;
          }),
      );
    }
    if (wanted.includes('evolucao')) {
      tasks.push(
        evolutionService
          .getChainBySpecies(detail.id)
          .then((chain) => {
            payload.evolution = chain;
          })
          .catch(() => {
            payload.evolution = null;
          }),
      );
    }
    if (wanted.includes('efetividade')) {
      tasks.push(
        statsService
          .matchupForPokemon(detail)
          .then((matchup) => {
            payload.matchup = matchup;
          })
          .catch(() => {
            payload.matchup = [];
          }),
      );
    }
    await Promise.all(tasks);
    payload.profile = statsService.buildProfile(
      detail,
      payload.species ? { ...payload.species, isLegendary: payload.species.isLegendary } : null,
    );
    ok(res, payload, { cached: detail.cached, source: detail.source });
  }),
);

/** GET /api/pokemon/:id/especie (Atividade 14). */
router.get(
  '/:id/especie',
  asyncHandler(async (req, res) => ok(res, await speciesService.getSpecies(req.params.id))),
);

/** GET /api/pokemon/:id/evolucao (Atividade 15). */
router.get(
  '/:id/evolucao',
  asyncHandler(async (req, res) => {
    const detail = await pokemonService.getDetail(req.params.id);
    const chain = await evolutionService.getChainBySpecies(detail.id);
    ok(res, { ...chain, current: { id: detail.id, label: detail.label } });
  }),
);

/** GET /api/pokemon/:id/estatisticas (Atividades 6 e 7). */
router.get(
  '/:id/estatisticas',
  asyncHandler(async (req, res) => {
    const detail = await pokemonService.getDetail(req.params.id);
    let species = null;
    try {
      species = await speciesService.getSpecies(detail.id);
    } catch {
      species = null;
    }
    ok(res, statsService.buildProfile(detail, species));
  }),
);

module.exports = router;
