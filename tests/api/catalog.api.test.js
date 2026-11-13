'use strict';

/**
 * Testes de API — catálogo: busca, paginação e filtros por tipo.
 * Cobre o grupo 2 do roteiro ("Catálogo e filtros") e as Atividades 8, 10 e 11.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createTestApp } = require('./helpers/app');

let env;

test.beforeEach(() => {
  env = createTestApp();
});

test.afterEach(() => {
  env.cleanup();
});

test('GET /api/catalogo devolve envelope padrão e primeira página de 12', async () => {
  const res = await request(env.app).get('/api/catalogo').expect(200);

  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.length, 12);
  assert.equal(res.body.meta.total, 1025);
  assert.equal(res.body.meta.pages, 86);
  assert.equal(res.body.meta.page, 1);
  assert.equal(res.body.meta.from, 1);
  assert.equal(res.body.meta.to, 12);
  assert.equal(res.body.meta.hasNext, true);
  assert.equal(res.body.meta.hasPrevious, false);
  assert.equal(typeof res.body.meta.generatedAt, 'string');

  const [first] = res.body.data;
  assert.equal(first.id, 1);
  assert.equal(first.label, 'Bulbasaur');
  assert.equal(first.dex, '#001');
  assert.ok(first.types.length >= 1);
  assert.equal(first.types[0].id, 'grass', 'bulbasaur deve vir com o tipo real da PokéAPI');
  assert.match(first.sprites.official, /official-artwork\/1\.png/);
});

test('GET /api/catalogo?pagina=2 avança o deslocamento sem perder a contagem', async () => {
  const res = await request(env.app).get('/api/catalogo?pagina=2').expect(200);
  assert.equal(res.body.data[0].id, 13);
  assert.equal(res.body.meta.page, 2);
  assert.equal(res.body.meta.hasPrevious, true);
});

test('tamanho de página é aceito e limitado ao máximo configurado', async () => {
  const small = await request(env.app).get('/api/catalogo?tamanho=6').expect(200);
  assert.equal(small.body.data.length, 6);
  assert.equal(small.body.meta.pages, 171);

  const huge = await request(env.app).get('/api/catalogo?tamanho=500').expect(200);
  assert.equal(huge.body.data.length, 36, 'não deve liberar mais que o limite');

  const invalid = await request(env.app).get('/api/catalogo?tamanho=abc').expect(200);
  assert.equal(invalid.body.data.length, 12, 'deve cair no padrão quando o valor é inválido');
});

test('paginação além do último índice volta para a última página válida', async () => {
  const res = await request(env.app).get('/api/catalogo?pagina=9999').expect(200);
  assert.equal(res.body.meta.page, 86);
  assert.equal(res.body.meta.hasPrevious, true);
  assert.equal(res.body.meta.hasNext, false);
});

test('filtro por um tipo usa o índice de GET /type/{tipo}', async () => {
  const res = await request(env.app).get('/api/catalogo?tipos=fire').expect(200);
  assert.equal(res.body.meta.filters.types[0].id, 'fire');
  assert.equal(res.body.meta.filters.types[0].label, 'Fogo');
  assert.ok(res.body.meta.total > 100);
  assert.ok(res.body.data.every((item) => item.types.some((t) => t.id === 'fire')));
});

test('aceita nomes de tipo em português', async () => {
  const res = await request(env.app).get('/api/catalogo?tipos=fogo').expect(200);
  assert.equal(res.body.meta.filters.types[0].id, 'fire');
});

test('filtro combinado match=todos retorna apenas a interseção', async () => {
  const res = await request(env.app).get('/api/catalogo?tipos=fire,water&match=all').expect(200);
  assert.equal(res.body.meta.total, 1);
  assert.equal(res.body.data[0].name, 'volcanion');
});

test('filtro combinado match=qualquer retorna a união', async () => {
  const union = await request(env.app).get('/api/catalogo?tipos=fire,water&match=any').expect(200);
  assert.ok(union.body.meta.total > 200);
  assert.equal(union.body.meta.filters.match, 'any');
});

test('filtro por geração restringe a faixa de números de Pokédex', async () => {
  const res = await request(env.app).get('/api/catalogo?geracao=1&tamanho=36').expect(200);
  assert.equal(res.body.meta.total, 151);
  assert.ok(res.body.data.every((item) => item.id <= 151));
});

test('geração inválida responde 400 com código estável', async () => {
  const res = await request(env.app).get('/api/catalogo?geracao=12').expect(400);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
  assert.match(res.body.error.message, /Geração inválida/);
});

test('busca por parte do nome e por número (Atividade 8)', async () => {
  const byName = await request(env.app).get('/api/catalogo?q=pika').expect(200);
  assert.deepEqual(byName.body.data.map((i) => i.name), ['pikachu']);

  const byNumber = await request(env.app).get('/api/catalogo?q=150').expect(200);
  assert.equal(byNumber.body.data[0].id, 150);

  const hyphen = await request(env.app).get('/api/catalogo?q=mr mime').expect(200);
  assert.equal(hyphen.body.data[0].id, 122, 'busca deve tolerar hífen/espaço e caixa');

  const none = await request(env.app).get('/api/catalogo?q=zzzz').expect(200);
  assert.equal(none.body.data.length, 0);
  assert.equal(none.body.meta.total, 0);
});

test('ordenação por número e por nome', async () => {
  const desc = await request(env.app).get('/api/catalogo?ordem=numero-desc').expect(200);
  assert.equal(desc.body.data[0].id, 1025);

  const byName = await request(env.app).get('/api/catalogo?ordem=nome-asc').expect(200);
  const names = byName.body.data.map((i) => i.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
});

test('autocomplete devolve rótulos e números', async () => {
  const res = await request(env.app).get('/api/catalogo/sugestoes?q=char').expect(200);
  assert.ok(res.body.data.length >= 3);
  assert.ok(res.body.data.some((i) => i.name === 'charmander'));
  assert.equal(res.body.data[0].dex.includes('#'), true);
});

test('metadados de tipos e gerações alimentam os filtros do frontend', async () => {
  const types = await request(env.app).get('/api/catalogo/tipos').expect(200);
  assert.equal(types.body.data.length, 18);
  assert.ok(types.body.data.every((t) => t.color.startsWith('#')));

  const generations = await request(env.app).get('/api/catalogo/geracoes').expect(200);
  assert.equal(generations.body.data.length, 9);
  assert.equal(generations.body.data[8].roman, 'IX');
});

test('efetividade de tipo traz fraquezas e resistências', async () => {
  const res = await request(env.app).get('/api/catalogo/tipos/fire/efetividade').expect(200);
  assert.equal(res.body.data.label, 'Fogo');
  assert.ok(res.body.data.effectiveness.weaknesses.length > 0);
  assert.ok(res.body.data.samplePokemon.length > 0);
});

test('tipo desconhecido responde 404', async () => {
  const res = await request(env.app).get('/api/catalogo/tipos/xyz/efetividade').expect(404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('estatísticas agregadas do catálogo', async () => {
  const res = await request(env.app).get('/api/catalogo/estatisticas').expect(200);
  assert.equal(res.body.data.total, 1025);
  assert.equal(res.body.data.byGeneration.length, 9);
  assert.equal(res.body.data.byGeneration[0].count, 151);
});

test('cache: a segunda chamada igual vem do cache e não da PokéAPI', async () => {
  const first = await request(env.app).get('/api/pokemon/25').expect(200);
  const callsAfterFirst = env.mock.calls.length;

  const second = await request(env.app).get('/api/pokemon/25').expect(200);
  assert.equal(first.body.meta.cached, false);
  assert.equal(second.body.meta.cached, true);
  assert.equal(env.mock.calls.length, callsAfterFirst, 'nenhuma requisição nova à PokéAPI');
});

test('somente HTTP GET é usado nas chamadas de saída', async () => {
  await request(env.app).get('/api/catalogo?tipos=fire').expect(200);
  await request(env.app).get('/api/pokemon/25').expect(200);
  await request(env.app).get('/api/pokemon/6/evolucao').expect(200);
  assert.deepEqual(env.mock.methods, ['GET']);
});
