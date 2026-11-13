(function exposeState(window) {
  'use strict';

  const config = window.APP_CONFIG;
  const listeners = new Map();

  const readLocal = (key, fallback) => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const writeLocal = (key, value) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const savedFilters = readLocal(config.storage.filters, {});

  const state = {
    status: 'idle', // idle | loading | ready | error
    error: null,
    loadingDetail: false,
    types: [],
    generations: [],
    filters: {
      q: '',
      types: savedFilters.types ?? [],
      match: savedFilters.match ?? 'any',
      generation: savedFilters.generation ?? '',
      sort: savedFilters.sort ?? 'numero-asc',
      favoritesOnly: false,
    },
    pagination: {
      page: 1,
      limit: savedFilters.limit ?? config.pageSize,
      pages: 1,
      total: 0,
      from: 0,
      to: 0,
      hasPrevious: false,
      hasNext: false,
    },
    items: [],
    meta: { cached: false, source: '—' },
    selected: null,
    selectedId: Number(readLocal(config.storage.lastSeen, 0)) || null,
    favorites: readLocal(config.storage.favorites, []),
    favoritesSync: 'local', // local | online | offline
    compare: [],
    battle: { slots: [null, null], result: null, animation: null },
    cache: { entries: 0, hits: 0, rate: 0, requests: 0 },
  };

  const STORE_KEYS = { filters: config.storage.filters, favorites: config.storage.favorites, lastSeen: config.storage.lastSeen };

  function emit(event, payload) {
    (listeners.get(event) ?? []).forEach((fn) => fn(payload, state));
    (listeners.get('*') ?? []).forEach((fn) => fn({ event, payload }, state));
  }

  function on(event, fn) {
    const list = listeners.get(event) ?? [];
    list.push(fn);
    listeners.set(event, list);
    return () => {
      listeners.set(event, list.filter((item) => item !== fn));
    };
  }

  function patch(partial) {
    Object.assign(state, partial);
    emit('change', partial);
  }

  function setStatus(status, error = null) {
    patch({ status, error });
    emit('status', { status, error });
  }

  function updateFilters(next, { resetPage = true } = {}) {
    Object.assign(state.filters, next);
    if (resetPage) state.pagination.page = 1;
    writeLocal(STORE_KEYS.filters, {
      types: state.filters.types,
      match: state.filters.match,
      generation: state.filters.generation,
      sort: state.filters.sort,
      limit: state.pagination.limit,
    });
    emit('filters', { ...state.filters });
  }

  function toggleType(typeId) {
    const list = new Set(state.filters.types);
    if (list.has(typeId)) list.delete(typeId);
    else {
      if (list.size >= config.maxTypes) {
        emit('notice', `Limite de ${config.maxTypes} tipos simultâneos. Remova um para adicionar outro.`);
        return false;
      }
      list.add(typeId);
    }
    updateFilters({ types: [...list] });
    return true;
  }

  function setPage(page) {
    state.pagination.page = Math.max(1, page);
    emit('page', state.pagination.page);
  }

  function isFavorite(id) {
    return state.favorites.some((item) => Number(item.id) === Number(id));
  }

  function setFavorites(items, source = 'online') {
    state.favorites = items.map((item) => ({
      id: Number(item.id),
      name: item.name ?? null,
      label: item.label ?? `#${item.id}`,
      types: item.types ?? [],
      image: item.image ?? config.sprite(item.id),
      addedAt: item.addedAt ?? Date.now(),
    }));
    state.favoritesSync = source;
    writeLocal(STORE_KEYS.favorites, state.favorites);
    emit('favorites', state.favorites);
  }

  function addFavoriteLocal(item) {
    if (!isFavorite(item.id)) {
      state.favorites = [{ ...item, addedAt: Date.now() }, ...state.favorites];
      writeLocal(STORE_KEYS.favorites, state.favorites);
      emit('favorites', state.favorites);
    }
  }

  function removeFavoriteLocal(id) {
    state.favorites = state.favorites.filter((item) => Number(item.id) !== Number(id));
    writeLocal(STORE_KEYS.favorites, state.favorites);
    emit('favorites', state.favorites);
  }

  function setCompare(items) {
    state.compare = items.slice(0, 2);
    emit('compare', state.compare);
  }

  function setBattleSlot(slot, pokemon) {
    if (slot !== 0 && slot !== 1) return;
    state.battle.slots[slot] = pokemon ?? null;
    state.battle.result = null;
    state.battle.animation = null;
    emit('battle', state.battle);
  }

  function clearBattle() {
    state.battle = { slots: [null, null], result: null, animation: null };
    emit('battle', state.battle);
  }

  function setBattleResult(result) {
    state.battle.result = result;
    emit('battle', state.battle);
  }

  function setBattleAnimation(animation) {
    state.battle.animation = animation;
    emit('battle', state.battle);
  }

  function selectPokemon(pokemon) {
    state.selected = pokemon;
    state.selectedId = pokemon?.id ?? state.selectedId;
    if (pokemon?.id) writeLocal(STORE_KEYS.lastSeen, pokemon.id);
    emit('select', pokemon);
  }

  /** Parâmetros de query enviados ao backend (nada de filtros locais). */
  function query() {
    return {
      q: state.filters.q || undefined,
      tipos: state.filters.types.length ? state.filters.types.join(',') : undefined,
      match: state.filters.types.length > 1 ? state.filters.match : undefined,
      geracao: state.filters.generation || undefined,
      ordem: state.filters.sort,
      pagina: state.pagination.page,
      tamanho: state.pagination.limit,
    };
  }

  window.STATE = {
    state,
    on,
    emit,
    patch,
    setStatus,
    updateFilters,
    toggleType,
    setPage,
    setFavorites,
    addFavoriteLocal,
    removeFavoriteLocal,
    isFavorite,
    setCompare,
    setBattleSlot,
    clearBattle,
    setBattleResult,
    setBattleAnimation,
    selectPokemon,
    query,
    readLocal,
    writeLocal,
  };
})(window);
