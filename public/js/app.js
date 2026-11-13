(function bootPokedex(window, document) {
  'use strict';

  const config = window.APP_CONFIG;
  const api = window.API;
  const ui = window.UI;
  const store = window.STATE;
  const { state, on, emit } = store;
  let noticeTimer;
  // Guardas de sequência: respostas antigas são descartadas quando o usuário
  // muda filtros rapidamente (evita listar resultado de outra consulta).
  let catalogSeq = 0;
  let detailSeq = 0;
  let battleRunSeq = 0;

  const {
    $,
    $$,
    renderTypeChips,
    renderGenerations,
    renderSkeleton,
    renderCards,
    renderPagination,
    renderStatus,
    renderSummary,
    renderAlert,
    renderCache,
    renderDetail,
    renderLoadingDetail,
    renderFavorites,
    renderCompare,
    renderBattle,
  } = ui;

  /* ------------------------------------------------------------ utilidades */
  const setLight = (element, on2) => element?.setAttribute('data-off', String(!on2));
  const apiLight = $('#mode-label')?.closest('.light');

  function markOnline(online) {
    setLight($('#online-label')?.closest('.light'), online);
    $('#online-label').textContent = online ? 'Online' : 'Sem backend';
  }

  function detectMode() {
    const isGateway = /:400\d/.test(config.api) || config.api.includes('4000');
    $('#mode-label').textContent = isGateway ? 'API Gateway' : 'Monólito';
    $('[data-mode]')?.setAttribute('data-mode', isGateway ? 'microsservicos' : 'monolito');
    $('#arch-note').textContent = isGateway
      ? 'Frontend → API Gateway (:4000) → Catálogo (:4001) · Estatísticas (:4002) · Favoritos (:4003) → PokéAPI v2 · somente HTTP GET.'
      : 'Frontend → Node.js + Express (:3000, API Gateway interna) → PokéAPI v2 · somente HTTP GET.';
    setLight(apiLight, true);
  }

  /* ---------------------------------------------------------------- catálogo */
  async function loadCatalog({ silent = false } = {}) {
    const seq = ++catalogSeq;
    if (!silent) {
      store.setStatus('loading');
      renderSkeleton(state.pagination.limit);
      renderStatus({ status: 'loading', items: 0 });
      renderAlert('');
    }
    try {
      const response = await api.catalog(store.query());
      if (seq !== catalogSeq) return { stale: true };
      const items = response.data ?? [];
      let finalItems = items;

      if (state.filters.favoritesOnly) {
        const favored = new Set(state.favorites.map((f) => Number(f.id)));
        finalItems = items.filter((item) => favored.has(Number(item.id)));
      }

      store.patch({
        items: finalItems,
        meta: response.meta ?? {},
        pagination: {
          ...state.pagination,
          ...{
            page: response.meta.page,
            pages: response.meta.pages,
            total: response.meta.total,
            from: response.meta.from,
            to: response.meta.to,
            hasPrevious: response.meta.hasPrevious,
            hasNext: response.meta.hasNext,
          },
        },
      });
      store.setStatus('ready');
      renderCards(finalItems, { favorites: state.favorites, selectedId: state.selectedId });
      renderPagination(state.pagination);
      renderSummary(state);
      renderStatus({
        status: 'ready',
        items: finalItems.length,
        meta: response.meta,
        filters: state.filters,
      });
      refreshCacheStats();
    } catch (error) {
      if (seq !== catalogSeq) return { stale: true };
      store.setStatus('error', error);
      markOnline(false);
      renderSkeleton(0);
      $('#catalog').innerHTML =
        `<div class="fatal" style="grid-column:1/-1"><h3>Sem resposta do backend</h3><p>${ui.escapeHtml(
          error.message,
        )}</p><button class="btn btn--primary" type="button" data-retry>Tentar novamente</button></div>`;
      $('[data-retry]')?.addEventListener('click', () => loadCatalog());
      renderAlert('Mostrando o último resultado disponível. Verifique se `npm start` está em execução.', 'info');
    }
  }

  /* ------------------------------------------------------------------- ficha */
  async function openPokemon(id, { scroll = false } = {}) {
    const seq = ++detailSeq;
    renderLoadingDetail();
    setLight($('.light--cyan'), true);
    try {
      const response = await api.pokemon(id, 'especie,evolucao');
      if (seq !== detailSeq) return;
      const detail = response.data;
      detail.cached = response.meta?.cached;
      store.selectPokemon(detail);
      renderDetail(detail);
      $$('.card').forEach((card) =>
        card.setAttribute('data-selected', String(card.dataset.id === String(detail.id))),
      );
      if (scroll) $('#detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (seq !== detailSeq) return;
      $('#details').innerHTML =
        `<div class="fatal"><h3>Ficha indisponível</h3><p>${ui.escapeHtml(error.message)}</p>
         <button class="btn btn--ghost" type="button" data-retry-detail="${id}">Repetir consulta</button></div>`;
      $('[data-retry-detail]')?.addEventListener('click', () => openPokemon(id));
      renderAlert(error.message, 'error');
    }
  }

  /* ---------------------------------------------------------------- favoritos */
  async function toggleFavorite(pokemon) {
    const payload = {
      id: pokemon.id,
      name: pokemon.name,
      label: pokemon.label,
      types: pokemon.types ?? [],
      image: pokemon.sprites?.pixel ?? config.sprite(pokemon.id),
    };
    if (store.isFavorite(pokemon.id)) {
      store.removeFavoriteLocal(pokemon.id);
      try {
        await api.favorites.remove(pokemon.id);
        state.favoritesSync = 'online';
      } catch {
        state.favoritesSync = 'local (backend indisponível)';
      }
    } else {
      store.addFavoriteLocal(payload);
      try {
        await api.favorites.add(payload);
        state.favoritesSync = 'online';
      } catch {
        state.favoritesSync = 'local (não sincronizado)';
      }
    }
    renderFavorites(state.favorites, state.favoritesSync);
    renderCards(state.items, { favorites: state.favorites, selectedId: state.selectedId });
    if (state.selected?.id === pokemon.id) renderDetail(state.selected);
  }

  async function syncFavoritesFromServer() {
    try {
      const response = await api.favorites.list();
      store.setFavorites(response.data.items ?? [], 'online');
      markOnline(true);
    } catch {
      store.setFavorites(state.favorites, 'local (offline)');
      markOnline(false);
    }
    renderFavorites(state.favorites, state.favoritesSync);
    renderCards(state.items, { favorites: state.favorites, selectedId: state.selectedId });
  }

  /* --------------------------------------------------------------- comparação */
  function addToCompare(pokemon) {
    const current = state.compare.filter((item) => item.id !== pokemon.id);
    const next = [...current, pokemon];
    if (next.length > 2) next.shift();
    store.setCompare(next);
    renderCompare(next);
    if (next.length === 2) openOverlay();
    else emit('notice', 'Escolha o segundo Pokémon para comparar.');
  }

  const openOverlay = () => {
    renderCompare(state.compare);
    $('#overlay').classList.add('is-open');
    $('#overlay-close').focus();
  };
  const closeOverlay = () => {
    $('#overlay').classList.remove('is-open');
    $('#details [data-compare]')?.focus?.();
  };

  function setBattleSlot(slot, pokemon = state.selected) {
    if (!pokemon) {
      emit('notice', 'Abra uma ficha antes de enviar um Pokémon para a arena.');
      return;
    }
    battleRunSeq += 1;
    store.setBattleSlot(Number(slot), pokemon);
    renderBattle(state.battle);
    emit('notice', `${pokemon.label} entrou no Slot ${Number(slot) + 1}.`);
    $('#battle-arena')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function fightBattle() {
    const [a, b] = state.battle.slots;
    if (!a || !b || state.battle.animation?.active) return emit('notice', 'A arena precisa de dois Pokémon e não pode estar em combate.');
    const keys = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
    const labels = { hp: 'HP', attack: 'Ataque', defense: 'Defesa', 'special-attack': 'At. Especial', 'special-defense': 'Def. Especial', speed: 'Velocidade' };
    const value = (pokemon, key) => Number(pokemon.stats?.find((stat) => stat.id === key)?.value ?? 0);
    const score = (pokemon) => keys.reduce((sum, key) => sum + value(pokemon, key), 0);
    const scoreA = score(a);
    const scoreB = score(b);
    const typeLabels = Object.fromEntries((state.types ?? []).map((type) => [type.id, type.label]));
    const moves = {
      normal: ['Investida', 'Ataque Rápido'], fire: ['Brasa', 'Lança-Chamas'], water: ['Jato d’Água', 'Hidro-Bomba'], grass: ['Folha Navalha', 'Chicote de Vinha'], electric: ['Choque do Trovão', 'Faísca'], ice: ['Raio de Gelo', 'Nevasca'], fighting: ['Soco Dinâmico', 'Chute Duplo'], poison: ['Ácido', 'Bomba de Lodo'], ground: ['Terremoto', 'Ataque de Areia'], flying: ['Rajada de Vento', 'Ataque de Asa'], psychic: ['Confusão', 'Psíquico'], bug: ['Picada', 'Tesoura X'], rock: ['Arremesso de Pedra', 'Avalanche'], ghost: ['Bola Sombria', 'Lambida'], dragon: ['Garra de Dragão', 'Pulso do Dragão'], dark: ['Mordida', 'Jogo Sujo'], steel: ['Cabeça de Ferro', 'Garra de Metal'], fairy: ['Brilho Mágico', 'Voz Desarmante'],
    };
    const effectiveness = {
      fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: .5, water: .5, rock: .5, dragon: .5 }, water: { fire: 2, ground: 2, rock: 2, water: .5, grass: .5, dragon: .5 }, grass: { water: 2, ground: 2, rock: 2, fire: .5, grass: .5, poison: .5, flying: .5, bug: .5, dragon: .5, steel: .5 }, electric: { water: 2, flying: 2, electric: .5, grass: .5, dragon: .5, ground: 0 }, ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: .5, water: .5, ice: .5, steel: .5 }, fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: .5, flying: .5, psychic: .5, bug: .5, fairy: .5, ghost: 0 }, ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: .5, bug: .5, flying: 0 }, flying: { grass: 2, fighting: 2, bug: 2, electric: .5, rock: .5, steel: .5 }, psychic: { fighting: 2, poison: 2, psychic: .5, steel: .5, dark: 0 }, bug: { grass: 2, psychic: 2, dark: 2, fire: .5, fighting: .5, poison: .5, flying: .5, ghost: .5, steel: .5, fairy: .5 }, rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: .5, ground: .5, steel: .5 }, ghost: { psychic: 2, ghost: 2, dark: .5, normal: 0 }, dragon: { dragon: 2, steel: .5, fairy: 0 }, dark: { psychic: 2, ghost: 2, fighting: .5, dark: .5, fairy: .5 }, steel: { ice: 2, rock: 2, fairy: 2, fire: .5, water: .5, electric: .5, steel: .5 }, fairy: { fighting: 2, dragon: 2, dark: 2, fire: .5, poison: .5, steel: .5 }, poison: { grass: 2, fairy: 2, poison: .5, ground: .5, rock: .5, ghost: .5, steel: 0 }, normal: { rock: .5, steel: .5, ghost: 0 },
    };
    const multiplier = (attackType, defendTypes) => defendTypes.reduce((total, type) => total * (effectiveness[attackType]?.[type] ?? 1), 1);
    const typesOf = (pokemon) => (pokemon.types ?? []).map((type) => type.id ?? type.name).filter(Boolean);
    const hpMaxA = Math.round(value(a, 'hp') * 2.2 + 65);
    const hpMaxB = Math.round(value(b, 'hp') * 2.2 + 65);
    const speedA = value(a, 'speed');
    const speedB = value(b, 'speed');
    const order = speedA >= speedB ? [0, 1] : [1, 0];
    const run = ++battleRunSeq;
    const animation = { active: true, attacker: order[0], defender: order[1], hpA: hpMaxA, hpB: hpMaxB, maxHpA: hpMaxA, maxHpB: hpMaxB, turn: 1, hit: 0, log: [`${speedA >= speedB ? a.label : b.label} tem a maior Velocidade e começa!`], message: 'Os treinadores lançam suas Pokébolas!' };
    store.setBattleAnimation(animation);
    store.setBattleResult(null);
    renderBattle(state.battle);

    const finishBattle = () => {
      if (run !== battleRunSeq) return;
      const p1Won = animation.hpA >= animation.hpB;
      const winner = p1Won ? a : b;
      const loser = p1Won ? b : a;
      const tie = animation.hpA === animation.hpB;
      const best = keys.map((key) => ({ key, diff: Math.abs(value(a, key) - value(b, key)) })).sort((x, y) => y.diff - x.diff)[0];
      store.setBattleAnimation(null);
      store.setBattleResult({ tie, headline: tie ? 'EMPATE TÉCNICO' : `${winner.label} venceu a batalha!`, summary: tie ? 'Os combatentes terminaram com a mesma energia.' : `${winner.label} venceu a simulação elemental e terminou com ${Math.round(p1Won ? animation.hpA : animation.hpB)} HP.`, scoreA, scoreB, decidedBy: best?.diff ? `Maior diferença de base stats: ${labels[best.key]}` : 'mesmos atributos' });
      renderBattle(state.battle);
    };

    const nextTurn = () => {
      if (run !== battleRunSeq) return;
      const turn = animation.turn;
      const attacker = order[(turn - 1) % 2];
      const defender = attacker === 0 ? 1 : 0;
      const attackerPokemon = attacker === 0 ? a : b;
      const defenderPokemon = defender === 0 ? a : b;
      const attackerTypes = typesOf(attackerPokemon);
      const defenderTypes = typesOf(defenderPokemon);
      const activeElement = attackerTypes.length > 1 && Math.random() < 0.35 ? attackerTypes[1] : (attackerTypes[0] ?? 'normal');
      const typeMult = multiplier(activeElement, defenderTypes);
      const isCrit = Math.random() < 0.14;
      const variance = 0.88 + Math.random() * 0.24;
      const offense = Math.max(value(attackerPokemon, 'attack'), value(attackerPokemon, 'special-attack'));
      const defense = Math.max(35, Math.max(value(defenderPokemon, 'defense'), value(defenderPokemon, 'special-defense')));
      const damage = Math.max(8, Math.round((((offense / defense) * 28) + 12) * (typeMult === 0 ? .35 : typeMult) * (isCrit ? 1.45 : 1) * variance));
      const isSuper = typeMult >= 2;
      const moveName = (moves[activeElement] ?? moves.normal)[Math.floor(Math.random() * (moves[activeElement] ?? moves.normal).length)];
      const effectivenessNote = typeMult >= 2 ? ' Super efetivo!' : typeMult < 1 ? ' Pouco efetivo.' : '';
      animation.attacker = attacker;
      animation.defender = defender;
      animation.turn = turn;
      animation.hit = turn;
      animation.damage = 0;
      animation.isSuper = isSuper;
      animation.isCrit = isCrit;
      animation.activeElement = activeElement;
      animation.activeElementLabel = typeLabels[activeElement] ?? activeElement;
      animation.message = `${attackerPokemon.label} usa ${moveName}!${effectivenessNote}`;
      animation.log = [...animation.log, `T${turn}: ${attackerPokemon.label} lançou ${moveName} (${animation.activeElementLabel})!${effectivenessNote}`];
      store.setBattleAnimation({ ...animation, log: animation.log });
      renderBattle(state.battle);
      setTimeout(() => {
        if (run !== battleRunSeq) return;
        animation.damage = damage;
        if (defender === 0) animation.hpA = Math.max(0, animation.hpA - damage);
        else animation.hpB = Math.max(0, animation.hpB - damage);
        animation.log = [...animation.log, `Impacto: -${damage} HP${isCrit ? ' · CRÍTICO' : isSuper ? ' · 2x' : ''}`];
        store.setBattleAnimation({ ...animation, log: animation.log });
        renderBattle(state.battle);
        animation.turn += 1;
        if (animation.hpA <= 0 || animation.hpB <= 0 || turn >= 12) setTimeout(finishBattle, 680);
        else setTimeout(nextTurn, 680);
      }, 310);
    };
    setTimeout(nextTurn, 500);
  }

  /* ------------------------------------------------------------ sugestões */
  const showSuggestions = async (term) => {
    const list = $('#suggestions');
    if (!term || term.length < 2) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
    try {
      const response = await api.suggest(term);
      const items = response.data ?? [];
      if (!items.length) {
        list.hidden = true;
        return;
      }
      list.innerHTML = items
        .map(
          (item) =>
            `<li><button class="suggestion" type="button" role="option" aria-selected="false" data-id="${item.id}">
              <img src="${config.sprite(item.id)}" alt="" loading="lazy">
              <b>${ui.escapeHtml(item.dex)}</b><span>${ui.escapeHtml(item.label)}</span>
            </button></li>`,
        )
        .join('');
      list.hidden = false;
    } catch {
      list.hidden = true;
    }
  };

  /* ---------------------------------------------------------------- filtros */
  async function loadFilterMetadata() {
    try {
      const [typesResponse, generationsResponse] = await Promise.all([api.types(), api.generations()]);
      state.types = typesResponse.data;
      state.generations = generationsResponse.data;
      window.TYPE_LABELS = Object.fromEntries(state.types.map((t) => [t.id, t.label]));
      renderTypeChips(state.types, state.filters.types);
      renderGenerations(state.generations);
      $('#generation-filter').value = state.filters.generation ?? '';
      $('#sort-select').value = state.filters.sort;
      $('#page-size').value = String(state.pagination.limit);
      $('#match-mode').value = state.filters.match;
    } catch (error) {
      renderAlert(`Não foi possível carregar os filtros: ${error.message}`, 'error');
    }
  }

  async function refreshCacheStats() {
    try {
      const response = await api.cacheStats();
      const cache = response.data.cache ?? {};
      const upstream = response.data.upstream ?? {};
      state.cache = {
        entries: cache.entries,
        hits: cache.hits,
        rate: cache.hitRate,
        requests: upstream.requests,
      };
      renderCache(state.cache);
      setLight($('.light--cyan'), cache.entries > 0);
    } catch {
      renderCache({ entries: '—', hits: '—', rate: '—', requests: '—' });
    }
  }

  /* ------------------------------------------------------------------ eventos */
  function wireEvents() {
    $('#search-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const term = $('#search').value.trim();
      $('#suggestions').hidden = true;
      if (/^\d+$/.test(term) || term.toLowerCase() === 'aleatorio') {
        store.updateFilters({ q: '' });
        openPokemon(/^\d+$/.test(term) ? term : state.items[0]?.id ?? 25, { scroll: true });
        return;
      }
      store.updateFilters({ q: term });
      loadCatalog();
    });

    $('#search').addEventListener(
      'input',
      ui.debounce((event) => {
        const term = event.target.value.trim();
        showSuggestions(term);
        if (!term) {
          store.updateFilters({ q: '' });
          loadCatalog();
        }
      }),
    );

    $('#suggestions').addEventListener('click', (event) => {
      const button = event.target.closest('[data-id]');
      if (!button) return;
      $('#suggestions').hidden = true;
      store.updateFilters({ q: '' });
      $('#search').value = '';
      loadCatalog().then(() => openPokemon(button.dataset.id, { scroll: true }));
    });

    $('#random').addEventListener('click', async () => {
      try {
        const response = await api.random({
          tipo: state.filters.types[0],
          geracao: state.filters.generation || undefined,
        });
        const detail = response.data;
        store.selectPokemon(detail);
        renderDetail(detail);
        $('#detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        emit('notice', `Sorteio: ${detail.label} (${detail.dex}).`);
      } catch (error) {
        renderAlert(error.message, 'error', 'Repetir sorteio', () => $('#random').click());
      }
    });

    $('#type-filters').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-type]');
      if (!chip) return;
      const type = chip.dataset.type;
      if (!type) store.updateFilters({ types: [] });
      else store.toggleType(type);
      renderTypeChips(state.types, state.filters.types);
      loadCatalog();
    });

    $('#clear-types').addEventListener('click', () => {
      store.updateFilters({ types: [] });
      renderTypeChips(state.types, []);
      loadCatalog();
    });

    $('#match-mode').addEventListener('change', (event) => {
      store.updateFilters({ match: event.target.value });
      loadCatalog();
    });

    $('#generation-filter').addEventListener('change', (event) => {
      store.updateFilters({ generation: event.target.value });
      loadCatalog();
    });

    $('#sort-select').addEventListener('change', (event) => {
      store.updateFilters({ sort: event.target.value });
      loadCatalog();
    });

    $('#page-size').addEventListener('change', (event) => {
      state.pagination.limit = Number(event.target.value);
      store.updateFilters({});
      loadCatalog();
    });

    $('#favorites-only').addEventListener('change', (event) => {
      store.filters.favoritesOnly = event.target.checked;
      store.updateFilters({});
      loadCatalog();
    });

    $('#reset-all').addEventListener('click', () => {
      store.updateFilters({
        q: '',
        types: [],
        match: 'any',
        generation: '',
        sort: 'numero-asc',
      });
      state.pagination.limit = config.pageSize;
      state.filters.favoritesOnly = false;
      $('#favorites-only').checked = false;
      $('#search').value = '';
      $('#page-size').value = String(config.pageSize);
      $('#sort-select').value = 'numero-asc';
      $('#generation-filter').value = '';
      $('#match-mode').value = 'any';
      renderTypeChips(state.types, []);
      loadCatalog();
      emit('notice', 'Filtros reiniciados.');
    });

    $('#previous').addEventListener('click', () => {
      store.setPage(state.pagination.page - 1);
      loadCatalog();
    });
    $('#next').addEventListener('click', () => {
      store.setPage(state.pagination.page + 1);
      loadCatalog();
    });
    $('#page-numbers').addEventListener('click', (event) => {
      const button = event.target.closest('[data-page]');
      if (!button) return;
      store.setPage(Number(button.dataset.page));
      loadCatalog();
    });

    $('#catalog').addEventListener('click', (event) => {
      const fav = event.target.closest('[data-fav]');
      if (fav) {
        const item = state.items.find((entry) => String(entry.id) === fav.dataset.fav);
        toggleFavorite({
          id: item?.id ?? Number(fav.dataset.fav),
          name: item?.name,
          label: item?.label,
          types: item?.types ?? [],
          sprites: item?.sprites,
        });
        event.stopPropagation();
        return;
      }
      const card = event.target.closest('.card');
      if (card) openPokemon(card.dataset.id);
    });

    $('#catalog').addEventListener('keydown', (event) => {
      const card = event.target.closest?.('.card');
      if (!card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openPokemon(card.dataset.id);
    });

    $('#details').addEventListener('click', async (event) => {
      const favButton = event.target.closest('[data-toggle-favorite]');
      if (favButton && state.selected) {
        toggleFavorite(state.selected);
        return;
      }
      const compareButton = event.target.closest('[data-compare]');
      if (compareButton && state.selected) {
        addToCompare(state.selected);
        return;
      }
      const battleButton = event.target.closest('[data-battle-slot]');
      if (battleButton && state.selected) {
        setBattleSlot(battleButton.dataset.battleSlot, state.selected);
        return;
      }
      const official = event.target.closest('[data-open-official]');
      if (official) {
        window.open(`https://pokeapi.co/api/v2/pokemon/${official.dataset.openOfficial}`, '_blank', 'noopener');
        return;
      }
      const evo = event.target.closest('[data-evo]');
      if (evo) openPokemon(evo.dataset.evo);
    });

    $('#favorites').addEventListener('click', (event) => {
      const open = event.target.closest('[data-open]');
      if (open) {
        openPokemon(open.dataset.open, { scroll: true });
        return;
      }
      const remove = event.target.closest('[data-remove]');
      if (remove) {
        const item = state.favorites.find((entry) => Number(entry.id) === Number(remove.dataset.remove));
        toggleFavorite({ id: Number(remove.dataset.remove), ...(item ?? {}) });
      }
    });

    $('#sync-favorites').addEventListener('click', syncFavoritesFromServer);
    $('#clear-favorites').addEventListener('click', async () => {
      store.setFavorites([], 'local');
      renderFavorites([], 'local');
      try {
        await api.favorites.clear();
        state.favoritesSync = 'online';
        emit('notice', 'Lista de favoritos limpa no backend.');
      } catch {
        emit('notice', 'Limpeza local concluída (backend indisponível).');
      }
      renderCards(state.items, { favorites: state.favorites, selectedId: state.selectedId });
    });

    $('#flush-cache').addEventListener('click', async () => {
      try {
        await api.flushCache();
        emit('notice', 'Cache do servidor limpo: próximas consultas vão à PokéAPI.');
        await Promise.all([refreshCacheStats(), loadCatalog()]);
      } catch (error) {
        renderAlert(error.message, 'error');
      }
    });

    $('#overlay-close').addEventListener('click', closeOverlay);
    $('#overlay').addEventListener('click', (event) => {
      if (event.target.id === 'overlay') closeOverlay();
    });

    $('#battle-fight').addEventListener('click', fightBattle);
    $('#battle-clear').addEventListener('click', () => {
      battleRunSeq += 1;
      store.clearBattle();
      renderBattle(state.battle);
      emit('notice', 'Arena limpa.');
    });
    $('#battle-random').addEventListener('click', async () => {
      try {
        const response = await api.random({ tipo: state.filters.types[0], geracao: state.filters.generation || undefined });
        setBattleSlot(state.battle.slots[0] ? 1 : 0, response.data);
      } catch (error) {
        renderAlert(error.message, 'error');
      }
    });
    $('#battle-slots').addEventListener('click', (event) => {
      const remove = event.target.closest('[data-battle-remove]');
      if (!remove) return;
      store.setBattleSlot(Number(remove.dataset.battleRemove), null);
      renderBattle(state.battle);
    });

    document.addEventListener('keydown', (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (event.key === 'Escape') {
        if ($('#overlay').classList.contains('is-open')) closeOverlay();
        else if (!$('#suggestions').hidden) $('#suggestions').hidden = true;
        return;
      }
      if (typing) return;
      if (event.key === '/') {
        event.preventDefault();
        $('#search').focus();
      }
      if (event.key.toLowerCase() === 'r') $('#random').click();
      if (event.key === 'ArrowRight' && state.pagination.hasNext) $('#next').click();
      if (event.key === 'ArrowLeft' && state.pagination.hasPrevious) $('#previous').click();
    });

    window.addEventListener('online', () => loadCatalog());
    window.addEventListener('offline', () => markOnline(false));
    window.addEventListener('focus', ui.debounce(refreshCacheStats, 1500));
  }

  on('notice', (message) => {
    renderAlert(message, 'info');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => renderAlert(''), 4200);
  });

  /* ------------------------------------------------------------------- boot */
  async function boot() {
    detectMode();
    wireEvents();
    renderSkeleton(state.pagination.limit);
    renderBattle(state.battle);
    await loadFilterMetadata();
    await syncFavoritesFromServer();
    await loadCatalog();
    try {
      const health = await api.health();
      markOnline(true);
      $('#mode-label').textContent = health.data.mode === 'monolito' ? 'Monólito' : 'API Gateway';
    } catch {
      markOnline(false);
    }
    if (state.selectedId) openPokemon(state.selectedId);
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      renderAlert(`Falha ao iniciar: ${error.message}`, 'error');
    });
  });
})(window, document);
