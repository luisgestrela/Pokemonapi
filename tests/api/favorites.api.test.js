'use strict';

/**
 * Testes de API — favoritos (Atividades 12 e 18) e tratamento de falhas
 * da PokéAPI (Atividade 9, grupo 3 do roteiro).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const request = require('supertest');

const { createTestApp, dispose } = require('./helpers/app');

let env;

test.beforeEach(() => {
  env = createTestApp();
});

test.afterEach(() => {
  env.cleanup();
});

test.after(() => {
  dispose();
});

/* -------------------------------------------------------------- favoritos */
test('lista começa vazia e informa limite e arquivo de persistência', async () => {
  const res = await request(env.app).get('/api/favoritos').expect(200);
  assert.deepEqual(res.body.data.items, []);
  assert.equal(res.body.data.count, 0);
  assert.equal(res.body.data.maxItems, 60);
});

test('adicionar, listar e remover um favorito', async () => {
  const created = await request(env.app)
    .post('/api/favoritos')
    .send({ id: 25, name: 'pikachu', label: 'Pikachu', types: [{ id: 'electric', label: 'Elétrico' }] })
    .expect(201);
  assert.equal(created.body.data.created, true);
  assert.equal(created.body.data.item.id, 25);

  const listed = await request(env.app).get('/api/favoritos').expect(200);
  assert.equal(listed.body.data.count, 1);

  const removed = await request(env.app).delete('/api/favoritos/25').expect(200);
  assert.equal(removed.body.data.removed.id, 25);
  assert.equal(removed.body.data.count, 0);
});

test('favorito repetido não duplica (resposta 200 com alreadyExists)', async () => {
  await request(env.app).post('/api/favoritos').send({ id: 6, name: 'charizard' }).expect(201);
  const again = await request(env.app).post('/api/favoritos').send({ id: 6, name: 'charizard' }).expect(200);
  assert.equal(again.body.data.alreadyExists, true);
  assert.equal(again.body.data.count, 1);
});

test('alternar favorece e desfaz com a mesma chamada', async () => {
  const on = await request(env.app).post('/api/favoritos/alternar').send({ id: 150 }).expect(200);
  assert.equal(on.body.data.favored, true);
  const off = await request(env.app).post('/api/favoritos/alternar').send({ id: 150 }).expect(200);
  assert.equal(off.body.data.favored, false);
  assert.equal(off.body.data.count, 0);
});

test('id inválido ou ausente vira erro de validação 422', async () => {
  const invalid = await request(env.app).post('/api/favoritos').send({ id: 'pikachu' }).expect(422);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const missing = await request(env.app).post('/api/favoritos').send({ name: 'sem id' }).expect(422);
  assert.equal(missing.body.ok, false);
});

test('remover item que não está na lista responde 404', async () => {
  const res = await request(env.app).delete('/api/favoritos/4242').expect(404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('favoritos persistem em disco (servidor de favoritos)', async () => {
  await request(env.app).post('/api/favoritos').send({ id: 384, name: 'dragonair' }).expect(201);
  const raw = JSON.parse(fs.readFileSync(env.favoritesFile, 'utf8'));
  assert.equal(raw.count, 1);
  assert.equal(raw.items[0].id, 384);
  assert.equal(typeof raw.updatedAt, 'string');
});

test('limpar a lista remove todos os itens', async () => {
  await request(env.app).post('/api/favoritos').send({ id: 1 }).expect(201);
  await request(env.app).post('/api/favoritos').send({ id: 2 }).expect(201);
  const cleared = await request(env.app).delete('/api/favoritos').expect(200);
  assert.equal(cleared.body.data.removed, 2);
  assert.equal(cleared.body.data.count, 0);
});

/* ------------------------------------------------------------------ erros */
test('HTTP 500 da PokéAPI vira 502 UPSTREAM_ERROR com retry', async () => {
  env.cleanup();
  env = createTestApp({ serverError: (url) => url.includes('pokemon/999') });
  const res = await request(env.app).get('/api/pokemon/999').expect(502);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.code, 'UPSTREAM_ERROR');
  assert.ok(env.mock.calls.filter((c) => c.url.includes('pokemon/999')).length >= 2, 'deve tentar novamente');
});

test('falha de rede não derruba o serviço e é registrada como 502', async () => {
  env.cleanup();
  env = createTestApp({ networkError: () => true });
  const res = await request(env.app).get('/api/pokemon/25').expect(502);
  assert.equal(res.body.error.code, 'UPSTREAM_ERROR');
  assert.equal(typeof res.body.error.message, 'string');
});

test('rota inexistente responde 404 em JSON com a rota testada', async () => {
  const res = await request(env.app).get('/api/nao-existe').expect(404);
  assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
  assert.match(res.body.error.message, /\/api\/nao-existe/);
});

test('observabilidade: health, estatísticas e limpeza de cache', async () => {
  const health = await request(env.app).get('/api/health').expect(200);
  assert.equal(health.body.data.status, 'online');
  assert.equal(health.body.data.mode, 'monolito');
  assert.ok(health.body.data.services.includes('gateway'));

  await request(env.app).get('/api/pokemon/25').expect(200);
  const stats = await request(env.app).get('/api/cache/estatisticas').expect(200);
  assert.ok(stats.body.data.cache.entries > 0);
  assert.equal(typeof stats.body.data.cache.hitRate, 'number');
  assert.ok(stats.body.data.upstream.requests > 0);

  const flushed = await request(env.app).delete('/api/cache').expect(200);
  assert.ok(flushed.body.data.removed > 0);
  const after = await request(env.app).get('/api/cache/estatisticas').expect(200);
  assert.equal(after.body.data.cache.entries, 0);
});

/* ---------------------------------------------------------------- gateway */
test('todas as respostas seguem o mesmo envelope {ok,data,meta}', async () => {
  const routes = [
    '/api/health',
    '/api/catalogo',
    '/api/catalogo/tipos',
    '/api/catalogo/geracoes',
    '/api/catalogo/sugestoes?q=pi',
    '/api/pokemon/25',
    '/api/pokemon/25/especie',
    '/api/pokemon/25/evolucao',
    '/api/pokemon/25/estatisticas',
    '/api/favoritos',
  ];
  for (const route of routes) {
    const res = await request(env.app).get(route).expect(200);
    assert.equal(res.body.ok, true, route);
    assert.ok('data' in res.body, route);
    assert.equal(typeof res.body.meta.cached, 'boolean', route);
    assert.equal(typeof res.body.meta.source, 'string', route);
    assert.equal(typeof res.body.meta.generatedAt, 'string', route);
    assert.equal(res.headers['x-api-version'], 'v1', route);
  }
});
