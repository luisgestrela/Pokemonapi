'use strict';

const config = require('../config');
const { pokeapi } = require('../core/pokeapi-client');
const { cache } = require('../core/cache');
const { titleCase, normalizeToken } = require('./text.service');
const { GENERATIONS } = require('../utils/types');
const { HABITATS, COLORS, EGG_GROUPS, GROWTH_RATES, SHAPES } = require('../utils/labels-pt');

/**
 * Espécies (Atividade 14): GET /pokemon-species/{id}.
 * Prioriza textos em pt-BR, depois pt, depois en.
 */
const pickLocalized = (entries, fields = ['flavor_text', 'name', 'genus']) => {
  for (const field of fields) {
    const list = entries ?? [];
    const found =
      list.find((e) => e.language?.name === 'pt-BR' && e[field]) ??
      list.find((e) => e.language?.name === 'pt' && e[field]) ??
      list.find((e) => e.language?.name === 'en' && e[field]);
    if (found) return found;
  }
  return null;
};

const cleanText = (value) =>
  String(value ?? '')
    .replace(/[\n\f\u000c]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ROMAN_TO_ID = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };

/** Rótulo de geração em português ("Geração I"), com id numérico de apoio. */
function buildGeneration(generation) {
  const raw = String(generation?.name ?? '').replace('generation-', '');
  if (!raw) return null;
  const id = ROMAN_TO_ID[raw] ?? null;
  const known = GENERATIONS.find((g) => g.id === id);
  return {
    name: raw,
    id,
    label: known ? known.label : `Geração ${raw.toUpperCase()}`,
    range: known ? `${known.from}–${known.to}` : null,
    games: known?.games ?? null,
  };
}

/** Rótulo em português quando existir; senão, devolve o termo original tratado. */
const labelOf = (table, value) => {
  const key = String(value ?? '').toLowerCase();
  if (!key) return null;
  return table[key] ?? titleCase(key);
};

async function getSpecies(input) {
  const resource = String(input ?? '').toLowerCase().trim();
  const hitsBefore = cache.stats.hits;
  const data = await pokeapi.get(`pokemon-species/${resource}`, {
    ttl: config.cache.ttl.species,
    label: `espécie ${resource}`,
  });

  const flavor = pickLocalized(data.flavor_text_entries, ['flavor_text']);
  const genus = pickLocalized(data.genera, ['genus']);
  const nameEntry = pickLocalized(data.names, ['name']);

  return {
    id: data.id,
    name: data.name,
    label: nameEntry?.name ?? titleCase(data.name),
    search: normalizeToken(data.name),
    genus: cleanText(genus?.genus) || null,
    description: cleanText(flavor?.flavor_text) || null,
    descriptionLanguage: flavor?.language?.name ?? null,
    generation: buildGeneration(data.generation),
    evolutionChainUrl: data.evolution_chain?.url ?? null,
    color: labelOf(COLORS, data.color?.name),
    colorOriginal: data.color?.name ?? null,
    habitat: labelOf(HABITATS, data.habitat?.name),
    habitatOriginal: data.habitat?.name ?? null,
    shape: labelOf(SHAPES, data.shape?.name),
    isLegendary: Boolean(data.is_legendary),
    isMythical: Boolean(data.is_mythical),
    isBaby: Boolean(data.is_baby),
    captureRate: data.capture_rate ?? null,
    baseHappiness: data.base_happiness ?? null,
    hatchCounter: data.hatch_counter ?? null,
    growthRate: labelOf(GROWTH_RATES, data.growth_rate?.name),
    eggGroups: (data.egg_groups ?? []).map((g) => ({
      id: g.name,
      label: EGG_GROUPS[g.name] ?? titleCase(g.name),
    })),
    varieties: (data.varieties ?? []).map((v) => ({
      name: v.pokemon?.name,
      default: Boolean(v.is_default),
    })),
    palPark: data.pal_park
      ? { area: data.pal_park.area?.name ?? null, rate: data.pal_park.rate ?? null }
      : null,
    allDescriptions: (data.flavor_text_entries ?? [])
      .filter((e) => ['pt-BR', 'pt', 'en'].includes(e.language?.name))
      .slice(0, 6)
      .map((e) => ({ language: e.language.name, version: e.version?.name, text: cleanText(e.flavor_text) })),
    // reflete se esta chamada veio do cache (Atividade 17)
    cached: hitsBefore < cache.stats.hits,
  };
}

module.exports = { getSpecies, cleanText, pickLocalized, labelOf };
