'use strict';

/**
 * Testes de API — ficha do Pokémon: conversão de unidades, imagens,
 * habilidades, atributos, espécie, evolução, comparação e sorteio.
 * Cobre os grupos 1 e 4 do roteiro (Atividades 1-7, 14-16).
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

test('aceita número e nome no mesmo endpoint (Atividades 1 e 2)', async () => {
  const byNumber = await request(env.app).get('/api/pokemon/25').expect(200);
  const byName = await request(env.app).get('/api/pokemon/pikachu').expect(200);
  assert.equal(byNumber.body.data.id, 25);
  assert.equal(byName.body.data.id, 25);
  assert.equal(byName.body.data.label, 'Pikachu');
  assert.equal(byName.body.data.dex, '#025');
});

test('traz imagens oficiais e sprite pixel (Atividade 3)', async () => {
  const res = await request(env.app).get('/api/pokemon/25').expect(200);
  assert.match(res.body.data.sprites.official, /official-artwork\/25\.png/);
  assert.match(res.body.data.sprites.pixel, /sprites\/pokemon\/25\.png/);
  assert.ok(res.body.data.sprites.animated === null || typeof res.body.data.sprites.animated === 'string');
});

test('converte altura e peso para metros e quilogramas (Atividade 4)', async () => {
  const res = await request(env.app).get('/api/pokemon/25').expect(200);
  const { measures } = res.body.data;
  assert.equal(measures.meters, 0.4);
  assert.equal(measures.kilograms, 6);
  assert.equal(measures.heightLabel, '0.4 m');
  assert.equal(measures.weightLabel, '6 kg');
  assert.equal(measures.feet, 1.31);
  assert.equal(measures.pounds, 13.23);
});

test('lista habilidades com descrição e marca a oculta (Atividade 5)', async () => {
  const res = await request(env.app).get('/api/pokemon/25').expect(200);
  const abilities = res.body.data.abilities;
  assert.ok(abilities.length >= 2);
  assert.ok(abilities.some((a) => a.hidden === true));
  assert.equal(abilities[0].label, 'Static');
  assert.match(abilities[0].description, /paralyz/i);
  assert.match(abilities[1].description, /electric/i);
});

test('seis atributos com total, média e escala (Atividade 6)', async () => {
  const res = await request(env.app).get('/api/pokemon/25').expect(200);
  const stats = res.body.data.stats;
  assert.equal(stats.length, 6);
  assert.deepEqual(stats.map((s) => s.label), [
    'HP',
    'Ataque',
    'Defesa',
    'At. Especial',
    'Def. Especial',
    'Velocidade',
  ]);
  assert.equal(stats.reduce((sum, s) => sum + s.value, 0), res.body.data.baseTotal);
  assert.equal(res.body.data.statsSummary.scaleMax, 255);
  assert.ok(res.body.data.statsSummary.highest);
});

test('barras gráficas recebem porcentagem pronta para o CSS (Atividade 7)', async () => {
  const res = await request(env.app).get('/api/pokemon/25').expect(200);
  const hp = res.body.data.stats.find((s) => s.id === 'hp');
  assert.ok(Math.abs(hp.percentage - (hp.value / 255) * 100) < 0.6);
  assert.ok(res.body.data.stats.every((s) => s.percentage >= 0 && s.percentage <= 100));
});

test('perfis de poder e radar (agregação do serviço de Estatísticas)', async () => {
  const res = await request(env.app).get('/api/pokemon/25/estatisticas').expect(200);
  assert.equal(typeof res.body.data.powerIndex, 'number');
  assert.equal(res.body.data.radar.length, 6);
  assert.equal(res.body.data.types[0].label, 'Elétrico');
});

test('espécie com texto, geração e grupos de ovo (Atividade 14)', async () => {
  const res = await request(env.app).get('/api/pokemon/25/especie').expect(200);
  assert.equal(res.body.data.id, 25);
  assert.ok(res.body.data.description.length > 20);
  assert.equal(res.body.data.generation.label, 'Geração I');
  assert.ok(res.body.data.eggGroups.length > 0);
  assert.equal(res.body.data.isLegendary, false);
});

test('cadeia evolutiva com gatilhos em português (Atividade 15)', async () => {
  const res = await request(env.app).get('/api/pokemon/6/evolucao').expect(200);
  const labels = res.body.data.stages.map((s) => s.label);
  assert.deepEqual(labels, ['Charmander', 'Charmeleon', 'Charizard']);
  assert.equal(res.body.data.count, 3);
  assert.equal(res.body.data.stages[1].triggers[0].label, 'Nível 16');
  assert.equal(res.body.data.current.label, 'Charizard');
});

test('ficha completa agrega espécie e evolução quando pedido', async () => {
  const res = await request(env.app).get('/api/pokemon/6?incluir=especie,evolucao').expect(200);
  assert.equal(res.body.data.species.genus, 'Flame Pokémon');
  assert.equal(res.body.data.evolution.count, 3);
  assert.ok(res.body.data.evolution.stages.some((s) => s.label === 'Charmander'));
});

test('comparação entre dois Pokémon com veredito (Atividade 13)', async () => {
  const res = await request(env.app).get('/api/pokemon/comparar?a=25&b=6').expect(200);
  assert.equal(res.body.data.left.label, 'Pikachu');
  assert.equal(res.body.data.right.label, 'Charizard');
  assert.equal(res.body.data.winner.baseTotal.winner, 'Charizard');
  assert.ok(res.body.data.winner.baseTotal.diff > 0);
});

test('comparação exige dois itens', async () => {
  const res = await request(env.app).get('/api/pokemon/comparar?a=25').expect(400);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
});

test('sorteio respeita geração e tipo quando informados (Atividade 16)', async () => {
  for (let i = 0; i < 5; i += 1) {
    const res = await request(env.app).get('/api/pokemon/aleatorio?geracao=1').expect(200);
    assert.ok(res.body.data.id >= 1 && res.body.data.id <= 151);
    assert.ok(res.body.data.label);
  }
  const fire = await request(env.app).get('/api/pokemon/aleatorio?tipo=fire').expect(200);
  assert.ok(fire.body.data.types.some((t) => t.id === 'fire'));
});

test('Pokémon inexistente responde 404 com orientação (Atividade 9)', async () => {
  const res = await request(env.app).get('/api/pokemon/999999').expect(404);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.match(res.body.error.message, /PokéAPI/);
});

test('identificador vazio ou inválido não derruba a API', async () => {
  const res = await request(env.app).get('/api/pokemon/%20').expect(404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});
