'use strict';

const config = require('../config');
const { pokeapi } = require('../core/pokeapi-client');
const { findType, describeTypes } = require('../utils/types');
const { titleCase } = require('./text.service');

/**
 * Serviço de Estatísticas (Atividades 6, 7 + agregação do desafio avançado).
 * Consolida atributos, medidas convertidas, perfil de poder e a tabela de
 * efetividade (fraquezas/resistências/imeunidades) de cada tipo.
 */

const POWER_WEIGHTS = {
  hp: 1,
  attack: 1.2,
  defense: 1.1,
  'special-attack': 1.2,
  'special-defense': 1.1,
  speed: 1.3,
};

function powerIndex(stats = []) {
  const byId = new Map(stats.map((s) => [s.id, s.value]));
  const score = Object.entries(POWER_WEIGHTS).reduce(
    (sum, [id, weight]) => sum + (byId.get(id) ?? 0) * weight,
    0,
  );
  return Math.round(score);
}

function radar(stats = [], scaleMax = 255) {
  return stats.map((stat) => ({
    axis: stat.label,
    key: stat.id,
    value: stat.value,
    normalized: Math.round((stat.value / scaleMax) * 100),
  }));
}

function effectivenessFromType(data) {
  const map = (list = []) =>
    list.map((entry) => {
      const type = findType(entry.name);
      return { id: entry.name, label: type?.label ?? titleCase(entry.name), color: type?.color ?? '#7d8896' };
    });
  const relations = data.damage_relations ?? {};
  return {
    weaknesses: map(relations.double_damage_from),
    resistances: map(relations.half_damage_from),
    immunities: map(relations.no_damage_from),
    superEffectiveAgainst: map(relations.double_damage_to),
    notVeryEffectiveAgainst: map(relations.half_damage_to),
    noEffectAgainst: map(relations.no_damage_to),
  };
}

/** Efetividade combinada dos tipos de um Pokémon (multiplicadores). */
async function matchupForPokemon(pokemon) {
  const typeIds = (pokemon.types ?? []).map((t) => t.id);
  if (!typeIds.length) return [];
  const relations = await Promise.all(typeIds.map((id) => getType(id)));
  const byId = new Map();
  for (const relation of relations) {
    for (const defender of relation.effectiveness.superEffectiveAgainst) {
      byId.set(defender.id, (byId.get(defender.id) ?? 0) + 1);
    }
  }
  return [...byId.entries()].map(([id, hits]) => {
    const type = findType(id);
    return { id, label: type?.label ?? titleCase(id), color: type?.color ?? '#7d8896', hits };
  });
}

async function getType(typeId) {
  const type = findType(typeId);
  if (!type) throw Object.assign(new Error(`Tipo "${typeId}" desconhecido.`), { status: 404, code: 'NOT_FOUND' });
  const data = await pokeapi.get(`type/${type.id}`, {
    ttl: config.cache.ttl.type,
    label: `tipo ${type.id}`,
  });
  return {
    id: type.id,
    label: type.label,
    color: type.color,
    gameId: data.id,
    powerIndex: data.pokemon?.length ?? 0,
    effectiveness: effectivenessFromType(data),
    samplePokemon: (data.pokemon ?? []).slice(0, 12).map((entry) => {
      const id = Number(String(entry.pokemon?.url ?? '').match(/\/(\d+)\/$/)?.[1] ?? 0);
      return { id, name: entry.pokemon?.name, label: titleCase(entry.pokemon?.name ?? '') };
    }),
  };
}

/** Agrega ficha + espécie em um perfil comparável. */
function buildProfile(detail, species) {
  const stats = detail.stats ?? [];
  return {
    id: detail.id,
    name: detail.name,
    label: detail.label,
    types: detail.types,
    powerIndex: powerIndex(stats),
    baseTotal: detail.baseTotal,
    average: detail.statsSummary?.average ?? null,
    highest: stats.reduce((best, s) => (s.value > (best?.value ?? -1) ? s : best), stats[0]) ?? null,
    radar: radar(stats, detail.statsSummary?.scaleMax ?? 255),
    measures: detail.measures,
    species: species
      ? {
          genus: species.genus,
          description: species.description,
          habitat: species.habitat,
          color: species.color,
          captureRate: species.captureRate,
          baseHappiness: species.baseHappiness,
          growthRate: species.growthRate,
          legendary: species.isLegendary,
          mythical: species.isMythical,
          eggGroups: species.eggGroups,
        }
      : null,
  };
}

module.exports = {
  powerIndex,
  radar,
  effectivenessFromType,
  matchupForPokemon,
  getType,
  buildProfile,
  POWER_WEIGHTS,
};
