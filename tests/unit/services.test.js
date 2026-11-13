'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TtlCache } = require('../../server/core/cache');
const evolution = require('../../server/services/evolution.service');
const stats = require('../../server/services/stats.service');
const catalog = require('../../server/services/catalog.service');
const favorites = require('../../server/services/favorites.service');

/* ------------------------------------------------------------------ cache */
test('cache devolve valor, mede hits/misses e expira pelo TTL', async () => {
  const cache = new TtlCache({ maxEntries: 10, enabled: true });
  const key = TtlCache.key('pokemon', 25);
  assert.equal(cache.get(key), undefined);

  cache.set(key, { id: 25 }, 40);
  assert.deepEqual(cache.get(key), { id: 25 });

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(cache.get(key), undefined, 'entrada deveria expirar');

  const snapshot = cache.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.misses >= 2, true);
  assert.equal(snapshot.hits, 1);
});

test('cache desabilitado nunca acerta', () => {
  const cache = new TtlCache({ enabled: false });
  cache.set('a', 1, 10_000);
  assert.equal(cache.get('a'), undefined);
});

test('cache limita entradas e descarta a mais antiga (FIFO)', () => {
  const cache = new TtlCache({ maxEntries: 2, enabled: true });
  cache.set('um', 1, 10_000);
  cache.set('dois', 2, 10_000);
  cache.set('tres', 3, 10_000);
  assert.equal(cache.get('um'), undefined);
  assert.equal(cache.get('tres'), 3);
  assert.equal(cache.snapshot().evictions, 1);
});

test('clear por prefixo remove apenas a família pedida', () => {
  const cache = new TtlCache({ maxEntries: 10, enabled: true });
  cache.set(TtlCache.key('pokemon', 1), 'a', 10_000);
  cache.set(TtlCache.key('pokemon', 2), 'b', 10_000);
  cache.set(TtlCache.key('index', 'type', 'fire'), 'c', 10_000);
  const removed = cache.clear('pokemon');
  assert.equal(removed, 2);
  assert.equal(cache.get(TtlCache.key('index', 'type', 'fire')), 'c');
});

/* --------------------------------------------------------------- evolução */
test('descreve gatilhos de evolução em português', () => {
  assert.equal(evolution.describeTrigger({ evolution_type: { name: 'level-up' }, min_level: 16 }).label, 'Nível 16');
  assert.equal(evolution.describeTrigger({ evolution_type: { name: 'trade' } }).label, 'Troca');
  assert.equal(
    evolution.describeTrigger({ evolution_type: { name: 'use-item' }, item: { name: 'fire-stone' } }).label,
    'Item: Fire Stone',
  );
  assert.equal(
    evolution.describeTrigger({ evolution_type: { name: 'friendly_happiness' } }).label,
    'Amizade alta',
  );
});

test('idFromUrl extrai o identificador do enlace da PokéAPI', () => {
  assert.equal(evolution.idFromUrl('https://pokeapi.co/api/v2/pokemon-species/4/'), 4);
  assert.equal(evolution.idFromUrl(undefined), null);
});

test('flattenChain percorre evoluir_para e numera os estágios', () => {
  const chain = {
    species: { name: 'bulbasaur', url: 'https://pokeapi.co/api/v2/pokemon-species/1/' },
    is_baby: false,
    evolution_details: [],
    evolves_to: [
      {
        species: { name: 'ivysaur', url: 'https://pokeapi.co/api/v2/pokemon-species/2/' },
        evolution_details: [{ evolution_type: { name: 'level-up' }, min_level: 16 }],
        evolves_to: [
          {
            species: { name: 'venusaur', url: 'https://pokeapi.co/api/v2/pokemon-species/3/' },
            evolution_details: [{ evolution_type: { name: 'level-up' }, min_level: 32 }],
            evolves_to: [],
          },
        ],
      },
    ],
  };
  const stages = evolution.flattenChain([chain]);
  assert.deepEqual(stages.map((s) => s.label), ['Bulbasaur', 'Ivysaur', 'Venusaur']);
  assert.deepEqual(stages.map((s) => s.stage), [1, 2, 3]);
  assert.equal(stages[2].triggers[0].label, 'Nível 32');
});

/* ------------------------------------------------------------ estatísticas */
test('índice de poder pondera os atributos', () => {
  const statList = [
    { id: 'hp', value: 35 },
    { id: 'attack', value: 49 },
    { id: 'defense', value: 49 },
    { id: 'special-attack', value: 65 },
    { id: 'special-defense', value: 40 },
    { id: 'speed', value: 45 },
  ];
  assert.equal(typeof stats.powerIndex(statList), 'number');
  assert.ok(stats.powerIndex(statList) > 0);
  assert.ok(
    stats.powerIndex([...statList, { id: 'speed', value: 200 }]) >= stats.powerIndex(statList),
    'mais atributos não devem reduzir o índice',
  );
});

test('radar normaliza atributos em porcentagem da escala', () => {
  const radar = stats.radar([{ id: 'hp', label: 'HP', value: 128 }], 255);
  assert.equal(radar[0].normalized, 50);
  assert.equal(radar[0].axis, 'HP');
});

test('efetividade de tipo traz fraquezas e resistências rotuladas', async () => {
  const fire = await stats.effectivenessFromType({
    id: 10,
    name: 'fire',
    damage_relations: {
      double_damage_from: [{ name: 'water' }, { name: 'ground' }, { name: 'rock' }],
      half_damage_from: [{ name: 'bug' }, { name: 'steel' }, { name: 'fire' }, { name: 'grass' }],
      no_damage_from: [],
      double_damage_to: [{ name: 'grass' }, { name: 'bug' }],
      half_damage_to: [{ name: 'fire' }, { name: 'water' }],
      no_damage_to: [],
    },
  });
  assert.deepEqual(fire.weaknesses.map((t) => t.id), ['water', 'ground', 'rock']);
  assert.equal(fire.weaknesses[0].label, 'Água');
  assert.equal(fire.weaknesses[0].color, '#70a0f8');
  assert.equal(fire.resistances.length, 4);
  assert.deepEqual(fire.superEffectiveAgainst.map((t) => t.id), ['grass', 'bug']);
});

/* ---------------------------------------------------------------- catálogo */
test('toTypeIdList aceita string, CSV e lista', () => {
  assert.deepEqual(catalog.toTypeIdList('fire'), ['fire']);
  assert.deepEqual(catalog.toTypeIdList('fire,water'), ['fire', 'water']);
  assert.deepEqual(catalog.toTypeIdList(['fogo', 'agua', 'fire']), ['fire', 'water']);
  assert.deepEqual(catalog.toTypeIdList(undefined), []);
  assert.deepEqual(catalog.toTypeIdList('fire,dragao'), ['fire', 'dragon']);
  assert.deepEqual(catalog.toTypeIdList('fire,xyz'), ['fire']);
});

test('applySearch busca por nome (sem acento) e por número', () => {
  const candidates = [
    { id: 1, name: 'bulbasaur' },
    { id: 25, name: 'pikachu' },
    { id: 120, name: 'staryu' },
  ];
  assert.deepEqual(catalog.applySearch(candidates, 'pika').map((c) => c.id), [25]);
  assert.deepEqual(catalog.applySearch(candidates, '25').map((c) => c.id), [25]);
  assert.equal(catalog.applySearch(candidates, '').length, 3);
  assert.equal(catalog.applySearch(candidates, 'zzz').length, 0);
});

test('sortCandidates ordena por número e nome', () => {
  const base = [
    { id: 3, name: 'venusaur' },
    { id: 1, name: 'bulbasaur' },
    { id: 2, name: 'charmeleon' },
  ];
  assert.deepEqual(catalog.sortCandidates(base, 'numero-asc').map((c) => c.id), [1, 2, 3]);
  assert.deepEqual(catalog.sortCandidates(base, 'numero-desc').map((c) => c.id), [3, 2, 1]);
  assert.deepEqual(catalog.sortCandidates(base, 'nome-asc').map((c) => c.name), [
    'bulbasaur',
    'charmeleon',
    'venusaur',
  ]);
  assert.deepEqual(catalog.sortCandidates(base, 'nome-desc').map((c) => c.name), [
    'venusaur',
    'charmeleon',
    'bulbasaur',
  ]);
});

test('parseIdFromUrl identifica o pokémon a partir do enlace', () => {
  assert.equal(catalog.parseIdFromUrl('https://pokeapi.co/api/v2/pokemon/6/'), 6);
  assert.equal(catalog.parseIdFromUrl('sem-id'), null);
});

/* --------------------------------------------------------------- favoritos */
test('isValidId aceita apenas inteiros positivos', () => {
  assert.equal(favorites.isValidId(25), true);
  assert.equal(favorites.isValidId('25'), true);
  assert.equal(favorites.isValidId('0'), false);
  assert.equal(favorites.isValidId(-3), false);
  assert.equal(favorites.isValidId('pikachu'), false);
  assert.equal(favorites.isValidId(undefined), false);
});
