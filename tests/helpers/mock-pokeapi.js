'use strict';

/**
 * Mock da PokéAPI para testes determinísticos e offline.
 *
 * - responde com fixtures reais (recortadas) para pikachu/charizard, tipos,
 *   espécies, cadeia de evolução e habilidades;
 * - sintetiza o restante dos 1025 Pokémon de forma determinística;
 * - permite injetar falhas (HTTP 500, erro de rede e atraso) para testar o
 *   tratamento de erros e o cache.
 */
const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures');
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));

const LIST = fixture('list_pokemon');
const TYPE_IDS = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
  'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy',
];
const STAT_KEYS = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];

const sprite = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const artwork = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const entryByName = new Map(LIST.results.map((item) => [item.name, item]));
const idOf = (value) => {
  const match = String(value).match(/\/(\d+)\/$/);
  return match ? Number(match[1]) : null;
};

const typeFixtures = {
  fire: fixture('type_fire'),
  water: fixture('type_water'),
  grass: fixture('type_grass'),
  electric: fixture('type_electric'),
};
/** Pertence a quais tipos de fixture? (mantém índice de tipo e ficha coerentes) */
function fixtureTypesFor(id) {
  return Object.entries(typeFixtures)
    .filter(([, data]) => data.pokemon.some((entry) => idOf(entry.pokemon?.url) === id))
    .map(([typeId]) => typeId);
}

function synthPokemon(id, name) {
  return {
    id,
    name,
    order: id,
    is_default: true,
    height: 3 + (id % 18),
    weight: 4 + ((id * 7) % 220),
    base_experience: 40 + (id % 160),
    friendship: 70,
    capture_rate: 3 + (id % 200),
    growth_rate: { name: 'medium-fast', url: 'https://pokeapi.co/api/v2/growth-rate/2/' },
    types: (() => {
      const known = fixtureTypesFor(id);
      const list = known.length
        ? known
        : [TYPE_IDS[id % 18], ...(id % 3 === 0 ? [TYPE_IDS[(id + 5) % 18]] : [])];
      return list.map((typeId, index) => ({
        slot: index + 1,
        type: { name: typeId, url: `https://pokeapi.co/api/v2/type/${typeId}/` },
      }));
    })(),
    stats: STAT_KEYS.map((key, index) => ({
      base_stat: 20 + ((id * (index + 3)) % 180),
      effort: index === 0 ? 1 : 0,
      stat: { name: key, url: `https://pokeapi.co/api/v2/stat/${index + 1}/` },
    })),
    abilities: [
      { slot: 1, is_hidden: false, ability: { name: `ability-${id}-a`, url: `https://pokeapi.co/api/v2/ability/${id + 100}/` } },
      { slot: 2, is_hidden: id % 2 === 0, ability: { name: `ability-${id}-b`, url: `https://pokeapi.co/api/v2/ability/${id + 200}/` } },
    ],
    forms: [{ name, url: `https://pokeapi.co/api/v2/form/${id}/` }],
    moves: [],
    game_indices: [],
    sprites: { front_default: sprite(id), other: { 'official-artwork': { front_default: artwork(id) }, home: { front_default: artwork(id) } } },
  };
}

function synthSpecies(id, name) {
  const chainId = id <= 9 ? 10 : id;
  return {
    id,
    name,
    flavor_text_entries: [
      { flavor_text: `Texto de exemplo da espécie ${name} na PokéAPI.`, language: { name: 'en' }, version: { name: 'red-blue' } },
    ],
    genera: [{ genus: `Mock Pokémon`, language: { name: 'en' } }],
    names: [{ name, language: { name: 'en' } }],
    generation: { name: `generation-${id <= 151 ? 1 : Math.ceil(id / 151)}`, url: 'https://pokeapi.co/api/v2/generation/1/' },
    evolution_chain: { url: `https://pokeapi.co/api/v2/evolution-chain/${chainId}/` },
    color: { name: 'green' },
    habitat: id % 4 === 0 ? { name: 'grassland' } : null,
    shape: { name: 'ball' },
    is_legendary: id >= 144 && id <= 150,
    is_mythical: id === 151,
    is_baby: false,
    capture_rate: 45 + (id % 100),
    base_happiness: 70,
    hatch_counter: 15 + (id % 60),
    growth_rate: { name: 'medium-fast', url: 'https://pokeapi.co/api/v2/growth-rate/2/' },
    egg_groups: [{ name: 'monster', url: 'https://pokeapi.co/api/v2/egg-group/1/' }],
    varieties: [{ pokemon: { name }, is_default: true }],
    pal_park: null,
  };
}

function synthChain(id, name) {
  const nextId = id + 1;
  const nextName = LIST.results[nextId - 1]?.name ?? `${name}-2`;
  return {
    id,
    chain: {
      species: { name, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
      is_baby: false,
      evolution_details: [],
      evolves_to: [
        {
          species: { name: nextName, url: `https://pokeapi.co/api/v2/pokemon-species/${nextId}/` },
          is_baby: false,
          evolution_details: [{ min_level: 16, evolution_type: { name: 'level-up' }, item: null, hold_item: null, known_move: null }],
          evolves_to: [],
        },
      ],
    },
  };
}

function synthType(typeId) {
  const members = LIST.results.filter((_, index) => (index + 1) % 18 === TYPE_IDS.indexOf(typeId));
  return {
    id: TYPE_IDS.indexOf(typeId) + 1,
    name: typeId,
    damage_relations: {
      double_damage_from: [{ name: 'water' }, { name: 'ground' }],
      half_damage_from: [{ name: 'fire' }, { name: 'grass' }],
      no_damage_from: [],
      double_damage_to: [{ name: 'grass' }],
      half_damage_to: [{ name: 'fire' }],
      no_damage_to: [],
    },
    pokemon: members.slice(0, 40).map((m) => ({ pokemon: m, slot: 1 })),
  };
}

function synthAbility(slug) {
  return {
    id: Math.abs([...slug].reduce((a, c) => a + c.charCodeAt(0), 0)),
    name: slug,
    effect_chance: null,
    flavor_text_entries: [{ flavor_text: `Descrição mock da habilidade ${slug}.`, language: { name: 'en' } }],
    names: [{ name: slug, language: { name: 'en' } }],
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function resolveBody(url) {
  const clean = url.replace(/\/$/, '').split('?')[0];
  const resource = clean.replace(/^https?:\/\/[^/]+\/api\/v2\//, '');

  if (resource === 'pokemon') return LIST;
  if (/^pokemon\/(\d+|[a-z-]+)$/.test(resource)) {
    const key = resource.split('/')[1];
    const byName = entryByName.get(key);
    const id = /^\d+$/.test(key) ? Number(key) : byName ? idOf(byName.url) : null;
    if (id === 25) return fixture('pokemon_25');
    if (id === 6) return fixture('pokemon_6');
    const entry = LIST.results[(id ?? 1) - 1];
    if (!entry) return null;
    return synthPokemon(id ?? 1, entry.name);
  }
  if (/^pokemon-species\/(\d+|[a-z-]+)$/.test(resource)) {
    const key = resource.split('/')[1];
    const byName = entryByName.get(key);
    const id = /^\d+$/.test(key) ? Number(key) : byName ? idOf(byName.url) : null;
    if (id === 25) return fixture('species_25');
    if (id === 6) return fixture('species_6');
    const entry = LIST.results[(id ?? 1) - 1];
    if (!entry) return null;
    return synthSpecies(id ?? 1, entry.name);
  }
  if (/^evolution-chain\/\d+$/.test(resource)) {
    const id = Number(resource.split('/')[1]);
    if (id === 10) return fixture('chain_10');
    if (id === 2) return fixture('chain_2');
    const entry = LIST.results[id - 1] ?? LIST.results[0];
    return synthChain(id, entry.name);
  }
  if (/^type\/[a-z-]+$/.test(resource)) {
    const typeId = resource.split('/')[1];
    const available = { fire: 'type_fire', water: 'type_water', grass: 'type_grass', electric: 'type_electric' };
    if (available[typeId]) return fixture(available[typeId]);
    if (!TYPE_IDS.includes(typeId)) return null;
    return synthType(typeId);
  }
  if (/^ability\/[^/]+$/.test(resource)) {
    const slug = resource.split('/')[1];
    const byNumericId = { 9: 'ability_static', 31: 'ability_lightning_rod' };
    if (byNumericId[slug]) return fixture(byNumericId[slug]);
    if (slug === 'static') return fixture('ability_static');
    if (slug === 'lightning-rod') return fixture('ability_lightning_rod');
    return synthAbility(/^\d+$/.test(slug) ? `ability-${slug}` : slug);
  }
  if (resource === 'pokemon?limit=1025') return LIST;
  return null;
}

/** Instala o mock global; devolve handle com chamadas e restore(). */
function installFetchMock(options = {}) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: (init.method ?? 'GET').toUpperCase() });
    if (typeof options.beforeRequest === 'function') await options.beforeRequest();

    if (options.networkError && options.networkError(String(url))) {
      throw Object.assign(new Error('simulate network down'), { name: 'TypeError' });
    }
    const body = resolveBody(String(url));
    if (!body) return jsonResponse({}, 404);
    if (options.serverError && options.serverError(String(url))) return jsonResponse({}, 500);
    return jsonResponse(body, 200);
  };
  return {
    calls,
    get methods() {
      return [...new Set(calls.map((c) => c.method))];
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

module.exports = {
  installFetchMock,
  resolveBody,
  LIST,
  TYPE_IDS,
  synthPokemon,
  synthSpecies,
  synthType,
  fixture,
};
