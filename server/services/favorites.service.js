'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const config = require('../config');
const { unprocessable, notFound } = require('../core/http-error');

/**
 * Serviço de favoritos (Atividades 12 e 18).
 *
 * No roteiro original os favoritos vivem apenas no navegador. Aqui existe um
 * serviço próprio com persistência em arquivo (JSON), para que a lista possa
 * ser compartilhada entre abas e sobreviver a um restart do backend, com o
 * navegador mantendo uma cópia local para uso offline.
 */

const state = { items: [], loaded: false, writing: null };

const isValidId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 && id <= config.catalog.totalKnownPokemon + 5;
};

async function ensureLoaded() {
  if (state.loaded) return state.items;
  try {
    await fs.mkdir(path.dirname(config.favorites.file), { recursive: true });
    const raw = await fs.readFile(config.favorites.file, 'utf8');
    const parsed = JSON.parse(raw);
    state.items = Array.isArray(parsed?.items)
      ? parsed.items.filter((item) => isValidId(item.id))
      : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // arquivo corrompido não derruba a aplicação: recomeça vazio
      state.items = [];
    }
    if (error.code === 'ENOENT') await persist();
  }
  state.loaded = true;
  return state.items;
}

async function persist() {
  const payload = JSON.stringify(
    { updatedAt: new Date().toISOString(), count: state.items.length, items: state.items },
    null,
    2,
  );
  // serializa escritas para evitar arquivos concorrentes corrompidos
  state.writing = (state.writing ?? Promise.resolve())
    .then(() => fs.mkdir(path.dirname(config.favorites.file), { recursive: true }))
    .then(() => fs.writeFile(config.favorites.file, payload, 'utf8'));
  return state.writing;
}

async function list() {
  const items = await ensureLoaded();
  return {
    items: items.slice().sort((a, b) => b.addedAt - a.addedAt),
    count: items.length,
    maxItems: config.favorites.maxItems,
    storage: path.relative(process.cwd(), config.favorites.file),
  };
}

async function add({ id, name = null, label = null, types = [], image = null }) {
  if (!isValidId(id)) {
    throw unprocessable('id de Pokémon inválido.', { id, expected: 'inteiro positivo' });
  }
  const items = await ensureLoaded();
  const existing = items.find((item) => item.id === Number(id));
  if (existing) {
    return { created: false, alreadyExists: true, item: existing, ...(await list()) };
  }
  if (items.length >= config.favorites.maxItems) {
    throw unprocessable(`Limite de ${config.favorites.maxItems} favoritos atingido.`, {
      limit: config.favorites.maxItems,
    });
  }
  const item = {
    id: Number(id),
    name: name ?? null,
    label: label ?? name ?? `#${id}`,
    types,
    image,
    addedAt: Date.now(),
    addedAtLabel: new Date().toISOString(),
  };
  items.push(item);
  await persist();
  return { created: true, alreadyExists: false, item, ...(await list()) };
}

async function remove(id) {
  const items = await ensureLoaded();
  const index = items.findIndex((item) => item.id === Number(id));
  if (index === -1) throw notFound(`#${id} não está nos favoritos.`);
  const [removed] = items.splice(index, 1);
  await persist();
  return { removed, ...(await list()) };
}

async function clear() {
  const items = await ensureLoaded();
  const removed = items.length;
  items.length = 0;
  await persist();
  return { removed, ...(await list()) };
}

async function toggle(payload) {
  const items = await ensureLoaded();
  if (items.some((item) => item.id === Number(payload.id))) {
    return { favored: false, ...(await remove(payload.id)) };
  }
  return { favored: true, ...(await add(payload)) };
}

/** Disponível para testes: redefine o estado interno. */
function _reset() {
  state.items = [];
  state.loaded = false;
}

module.exports = { list, add, remove, clear, toggle, _reset, isValidId };
