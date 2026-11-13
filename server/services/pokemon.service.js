'use strict';

const config = require('../config');
const { pokeapi, PokeApiClient } = require('../core/pokeapi-client');
const { notFound } = require('../core/http-error');
const { buildMeasures, round } = require('../utils/units');
const {
  describeTypes,
  generationFromId,
  STAT_LABELS,
} = require('../utils/types');
const { normalizeToken, titleCase } = require('./text.service');

const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const STAT_ORDER = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
const STAT_MAX = 255;

const pokeball = (id) => `#${String(id).padStart(3, '0')}`;

/** URLs de imagem: arte oficial + sprite clássico, com alternativa segura. */
function buildSprites(pokemon) {
  const id = pokemon.id;
  const sprites = pokemon.sprites ?? {};
  return {
    official:
      sprites.other?.['official-artwork']?.front_default ??
      sprites.other?.home?.front_default ??
      `${SPRITE_BASE}/other/official-artwork/${id}.png`,
    pixel: sprites.front_default ?? `${SPRITE_BASE}/${id}.png`,
    animated: sprites.animated?.front_default ?? null,
    alternative:
      sprites.other?.showdown?.front_default ??
      sprites.versions?.['generation-v']?.['black-white']?.animated?.front_default ??
      null,
  };
}

function buildStats(pokemon) {
  const base = (pokemon.stats ?? [])
    .map((entry) => ({
      id: entry.stat.name,
      label: STAT_LABELS[entry.stat.name] ?? titleCase(entry.stat.name),
      value: entry.base_stat,
    }));
  const byId = new Map(base.map((s) => [s.id, s]));
  const ordered = STAT_ORDER.map((id) => byId.get(id)).filter(Boolean);
  const total = ordered.reduce((sum, stat) => sum + stat.value, 0);
  const max = Math.max(...ordered.map((stat) => stat.value), 1);
  return {
    list: ordered.map((stat) => ({
      ...stat,
      percentage: round((stat.value / STAT_MAX) * 100, 1),
      relativePercentage: round((stat.value / max) * 100, 1),
    })),
    total,
    highest: ordered.reduce((best, stat) => (stat.value > best.value ? stat : best), ordered[0]),
    average: round(total / (ordered.length || 1), 1),
  };
}

/** Habilidades (Atividade 5), com descrição opcional vinda do endpoint /ability. */
async function buildAbilities(pokemon) {
  const list = (pokemon.abilities ?? [])
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(({ ability, is_hidden }) => ({
      name: ability.name,
      label: titleCase(ability.name),
      hidden: Boolean(is_hidden),
      href: ability.url,
    }));

  if (process.env.ABILITY_DETAILS === 'off') {
    return list.map(({ href, ...rest }) => rest);
  }

  return Promise.all(
    list.map(async ({ href, ...ability }) => {
      try {
        const slug = href.split('/').filter(Boolean).pop();
        const detail = await pokeapi.get(`ability/${slug}`, {
          ttl: config.cache.ttl.species,
          label: `habilidade ${slug}`,
        });
        const entries = detail.flavor_text_entries ?? [];
        const localized =
          entries.find((e) => e.language?.name === 'pt-BR') ??
          entries.find((e) => e.language?.name === 'pt') ??
          entries.find((e) => e.language?.name === 'en');
        return {
          ...ability,
          description: localized?.flavor_text
            ? localized.flavor_text.replace(/[\n\f]/g, ' ').trim()
            : null,
          effectChance: detail.effect_chance ?? null,
        };
      } catch {
        return { ...ability, description: null, effectChance: null };
      }
    }),
  );
}

/** Resumo enxuto usado em cartões, listas e comparações. */
function toSummary(pokemon) {
  const measures = buildMeasures(pokemon);
  const stats = buildStats(pokemon);
  const generation = generationFromId(pokemon.id);
  return {
    id: pokemon.id,
    number: pokemon.id,
    dex: pokeball(pokemon.id),
    name: pokemon.name,
    label: titleCase(pokemon.name),
    search: normalizeToken(pokemon.name),
    types: describeTypes(pokemon.types),
    mainType: pokemon.types?.[0]?.type?.name ?? null,
    measures,
    heightMeters: measures.meters,
    weightKg: measures.kilograms,
    baseTotal: stats.total,
    sprites: buildSprites(pokemon),
    generation: generation ? { id: generation.id, label: generation.label } : null,
    order: pokemon.order,
    isDefault: pokemon.is_default !== false,
    formsCount: (pokemon.forms ?? []).length,
  };
}

/**
 * Ficha completa (Atividades 1, 2, 3, 4, 5, 6, 7).
 * Aceita id numérico, nome ("pikachu") ou URL da PokéAPI.
 */
async function getDetail(input) {
  const resource = PokeApiClient.resourceKey(input);
  if (!resource) throw notFound('Informe um nome ou número de Pokémon.');
  const scoped = resource.includes('/') ? resource : `pokemon/${resource}`;
  const hitsBefore = pokeapi.cache.stats.hits;
  const pokemon = await pokeapi.get(scoped, {
    ttl: config.cache.ttl.pokemon,
    label: scoped,
  });
  const cached = pokeapi.cache.stats.hits > hitsBefore;
  const stats = buildStats(pokemon);
  return {
    ...toSummary(pokemon),
    abilities: await buildAbilities(pokemon),
    stats: stats.list,
    statsSummary: {
      total: stats.total,
      average: stats.average,
      highest: stats.highest,
      scaleMax: STAT_MAX,
    },
    experience: {
      base: pokemon.base_experience ?? null,
      growthRate: pokemon.growth_rate?.name ?? null,
    },
    friendship: pokemon.friendship ?? null,
    hatchCounter: pokemon.hatch_counter ?? null,
    captureRate: pokemon.capture_rate ?? null,
    forms: (pokemon.forms ?? []).map((f) => ({ name: f.name, label: titleCase(f.name) })),
    movesCount: (pokemon.moves ?? []).length,
    gameIndices: (pokemon.game_indices ?? []).slice(0, 8).map((g) => ({
      game: g.version?.name ?? null,
      value: g.level ?? null,
    })),
    source: `pokemon/${scoped}`,
    cached,
  };
}

/** Busca um id aleatório dentro do catálogo conhecido (Atividade 16). */
async function getRandom({ generation = null, type = null } = {}) {
  const catalog = require('./catalog.service');
  const candidates = await catalog.listIdentifiers({ generation, type });
  if (!candidates.length) throw notFound('Nenhum Pokémon encontrado para esse filtro.');
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return getDetail(picked.id ?? picked.name);
}

module.exports = {
  getDetail,
  getSummary,
  getRandom,
  toSummary,
  buildSprites,
  buildStats,
  buildAbilities,
  pokeball,
  STAT_ORDER,
  STAT_MAX,
};

/**
 * Versão leve da ficha (usada na hidratação de cartões): consome apenas
 * GET /pokemon/{id} e deriva tipos, medidas convertidas, atributos e imagens,
 * sem as descrições de habilidade. Evita ~3 requisições extras por cartão.
 */
async function getSummary(input) {
  const resource = PokeApiClient.resourceKey(input);
  if (!resource) throw notFound('Informe um nome ou número de Pokémon.');
  const scoped = resource.includes('/') ? resource : `pokemon/${resource}`;
  const hitsBefore = pokeapi.cache.stats.hits;
  const pokemon = await pokeapi.get(scoped, {
    ttl: config.cache.ttl.pokemon,
    label: scoped,
  });
  return {
    ...toSummary(pokemon),
    cached: pokeapi.cache.stats.hits > hitsBefore,
    source: `pokemon/${scoped}`,
  };
}

module.exports.getSummary = getSummary;
