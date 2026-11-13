'use strict';

const config = require('../config');
const { pokeapi } = require('../core/pokeapi-client');
const { cache, TtlCache } = require('../core/cache');
const { badRequest } = require('../core/http-error');
const { findType, GENERATIONS } = require('../utils/types');
const { normalizeToken, asNumber, toApiSlug, titleCase } = require('./text.service');
const { pokeball, buildSprites } = require('./pokemon.service');

const LIST_TTL = config.cache.ttl.list;
const SUMMARY_TTL = config.cache.ttl.pokemon;

/**
 * Catálogo (Atividades 8, 10, 11, 17 + ampliação de filtros).
 *
 * Estratégia:
 *  1. o índice completo (id + nome) vem de GET /pokemon?limit=1025&offset=0 e fica
 *     em cache por 1 h -> permite busca, ordenação, paginação e contagem de páginas
 *     corretas no servidor sem 1025 requisições;
 *  2. filtros por tipo usam GET /type/{tipo} (também cacheados) como índice auxiliar;
 *  3. apenas a página exibida (12 itens) é "hidratada" com dados ricos
 *     (tipos e arte oficial), reduzindo o tráfego para a PokéAPI.
 */

function parseIdFromUrl(url) {
  const match = String(url ?? '').match(/\/(\d+)\/$/);
  return match ? Number(match[1]) : null;
}

async function loadIndex() {
  const key = TtlCache.key('index', 'pokemon');
  const cached = cache.get(key);
  if (cached) return { entries: cached, cached: true };
  const data = await pokeapi.fetchJson(
    `${pokeapi.baseUrl}/pokemon?limit=${config.catalog.totalKnownPokemon}&offset=0`,
    { label: 'índice de Pokémon' },
  );
  const entries = (data.results ?? [])
    .map((item) => ({ id: parseIdFromUrl(item.url), name: item.name }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => a.id - b.id);
  cache.set(key, entries, LIST_TTL);
  return { entries, cached: false };
}

async function loadTypeIndex(typeId) {
  const key = TtlCache.key('index', 'type', typeId);
  const cached = cache.get(key);
  if (cached) return { entries: cached, cached: true };
  const data = await pokeapi.get(`type/${typeId}`, {
    ttl: config.cache.ttl.type,
    label: `tipo ${typeId}`,
  });
  const entries = (data.pokemon ?? [])
    .map((item) => ({ id: parseIdFromUrl(item.pokemon?.url), name: item.pokemon?.name }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .sort((a, b) => a.id - b.id);
  cache.set(key, entries, LIST_TTL);
  return { entries, cached: false };
}

/** Resolve um conjunto de candidatos conforme tipos (any/all) e geração. */
async function resolveCandidates({ types = [], match = 'any', generation = null }) {
  const gen = generation
    ? GENERATIONS.find((g) => String(g.id) === String(generation) || g.roman === String(generation))
    : null;
  if (generation && !gen) throw badRequest('Geração inválida. Use um número de 1 a 9.');

  let pools = [];
  if (types.length) {
    pools = await Promise.all(types.map((t) => loadTypeIndex(t)));
  } else {
    pools = [await loadIndex()];
  }
  const usedCache = pools.every((p) => p.cached);

  const byId = new Map();
  for (const pool of pools) {
    for (const entry of pool.entries) {
      if (!byId.has(entry.id)) byId.set(entry.id, { ...entry, hits: 0 });
      byId.get(entry.id).hits += 1;
    }
  }
  let candidates = [...byId.values()];
  if (types.length && match === 'all' && types.length > 1) {
    candidates = candidates.filter((c) => c.hits === types.length);
  }
  if (gen) {
    candidates = candidates.filter((c) => c.id >= gen.from && c.id <= gen.to);
  }
  return { candidates: candidates.sort((a, b) => a.id - b.id), cached: usedCache };
}

/** Busca textual: aceita nome parcial, nome exato ou número ("25", "#025"). */
function applySearch(candidates, term) {
  const token = normalizeToken(term);
  if (!token) return candidates;
  const numeric = asNumber(term);
  return candidates.filter((c) => {
    if (numeric !== null && c.id === numeric) return true;
    const nameToken = normalizeToken(c.name);
    return nameToken.includes(token);
  });
}

function sortCandidates(candidates, sort) {
  const list = candidates.slice();
  switch (sort) {
    case 'nome-asc':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'nome-desc':
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case 'numero-desc':
      return list.sort((a, b) => b.id - a.id);
    case 'numero-asc':
    default:
      return list.sort((a, b) => a.id - b.id);
  }
}

/** Cartão leve: derivado do índice + arte oficial conhecida por id. */
function toCard(entry) {
  const sprites = {
    official: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${entry.id}.png`,
    pixel: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${entry.id}.png`,
  };
  return {
    id: entry.id,
    number: entry.id,
    dex: pokeball(entry.id),
    name: entry.name,
    label: titleCase(entry.name),
    search: normalizeToken(entry.name),
    types: entry.types ?? [],
    measures: entry.measures ?? null,
    baseTotal: entry.baseTotal ?? null,
    sprites,
    hydrated: Boolean(entry.types),
  };
}

/** Hidrata somente a fatia da página com tipos e medidas reais. */
async function hydrate(entries) {
  const pokemonService = require('./pokemon.service');
  const results = await Promise.all(
    entries.map(async (entry) => {
      try {
        const detail = await pokemonService.getSummary(entry.id);
        return {
          ...toCard(entry),
          types: detail.types,
          mainType: detail.mainType,
          measures: detail.measures,
          baseTotal: detail.baseTotal,
          sprites: detail.sprites,
          generation: detail.generation,
          hydrated: true,
        };
      } catch {
        return toCard(entry);
      }
    }),
  );
  return results;
}

/**
 * Consulta principal do catálogo com paginação (Atividade 10) e filtros (11).
 */
/** Aceita "fire", "fire,water" ou ["fire","water"] e devolve ids válidos. */
function toTypeIdList(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [
    ...new Set(
      raw
        .map((item) => findType(item))
        .filter(Boolean)
        .map((t) => t.id),
    ),
  ];
}

async function query(rawParams = {}) {
  const requestedTypes = [
    ...toTypeIdList(rawParams.types),
    ...toTypeIdList(rawParams.type),
  ].filter((value, index, all) => all.indexOf(value) === index);

  const pageSize = Math.min(
    Math.max(Number(rawParams.limit ?? config.catalog.defaultPageSize) || 12, 1),
    config.catalog.maxPageSize,
  );
  const page = Math.max(Number(rawParams.page ?? 1) || 1, 1);
  const offset = Math.max(Number(rawParams.offset) || 0, (page - 1) * pageSize);
  const match = rawParams.match === 'all' ? 'all' : 'any';
  const sort = rawParams.sort || 'numero-asc';

  const { candidates, cached } = await resolveCandidates({
    types: requestedTypes,
    match,
    generation: rawParams.generation,
  });

  const filtered = applySearch(candidates, rawParams.q ?? rawParams.search ?? '');
  const sorted = sortCandidates(filtered, sort);
  const total = sorted.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const slice = sorted.slice(start, start + pageSize);

  const items = rawParams.hydrate === false ? slice.map(toCard) : await hydrate(slice);

  return {
    items,
    pagination: {
      page: currentPage,
      pages,
      limit: pageSize,
      offset: start,
      total,
      hasPrevious: currentPage > 1,
      hasNext: currentPage < pages,
      from: total === 0 ? 0 : start + 1,
      to: Math.min(start + pageSize, total),
      perPageOptions: [6, 12, 24, 36],
    },
    filters: {
      types: requestedTypes.map((id) => findType(id)),
      match,
      generation: rawParams.generation ? String(rawParams.generation) : null,
      search: (rawParams.q ?? rawParams.search ?? '') || null,
      sort,
    },
    cached,
    source: requestedTypes.length ? 'type-index' : 'pokemon-index',
  };
}

/** Lista apenas id/nome (usada pelo sorteio e pelo frontend para autocomplete). */
async function listIdentifiers({ generation = null, type = null } = {}) {
  const { candidates } = await resolveCandidates({
    types: type ? [findType(type)?.id].filter(Boolean) : [],
    generation,
  });
  return candidates;
}

/** Sugestões de autocomplete (Atividade 8). */
async function suggest(term, limit = 8) {
  const { candidates } = await resolveCandidates({ types: [] });
  const found = applySearch(candidates, term);
  return found.slice(0, limit).map((entry) => ({
    id: entry.id,
    dex: pokeball(entry.id),
    name: entry.name,
    label: titleCase(entry.name),
  }));
}

/** Estatísticas do próprio catálogo, exibidas no painel do frontend. */
async function catalogStats() {
  const { candidates } = await resolveCandidates({ types: [] });
  const byGeneration = GENERATIONS.map((g) => ({
    id: g.id,
    label: g.label,
    count: candidates.filter((c) => c.id >= g.from && c.id <= g.to).length,
  }));
  return { total: candidates.length, byGeneration };
}

module.exports = {
  query,
  toTypeIdList,
  suggest,
  listIdentifiers,
  catalogStats,
  loadIndex,
  loadTypeIndex,
  resolveCandidates,
  applySearch,
  sortCandidates,
  toCard,
  parseIdFromUrl,
};
