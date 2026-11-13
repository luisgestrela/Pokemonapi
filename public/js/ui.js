(function exposeUi(window) {
  'use strict';

  const config = window.APP_CONFIG;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]),
    );

  const debounce = (fn, wait = config.debounceMs) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const typeBadge = (type) =>
    `<span class="badge" style="--badge-color:${escapeHtml(type.color ?? '#7d8896')}">${escapeHtml(type.label ?? type.id)}</span>`;

  const meter = (value, max = 255, extraClass = '') => {
    const pct = Math.max(2, Math.round((Number(value) / max) * 100));
    return `<div class="meter ${extraClass}"><i style="--value:${pct}%"></i></div>`;
  };

  const infoCell = (label, value, hint) =>
    `<div class="info-cell"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? '—')}${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</dd></div>`;

  /* --------------------------------------------------------------- filtros */
  function renderTypeChips(types, selected) {
    const container = $('#type-filters');
    if (!container) return;
    container.innerHTML = ['<button class="chip" type="button" data-type="" aria-pressed="' + (selected.length === 0) + '" style="--chip-color:#e3350d">Todos</button>']
      .concat(
        types.map(
          (type) =>
            `<button class="chip" type="button" data-type="${escapeHtml(type.id)}" aria-pressed="${selected.includes(type.id)}" style="--chip-color:${escapeHtml(type.color)}" title="Filtrar por ${escapeHtml(type.label)}">${escapeHtml(type.label)}</button>`,
        ),
      )
      .join('');
  }

  function renderGenerations(generations) {
    const select = $('#generation-filter');
    if (!select) return;
    select.innerHTML =
      '<option value="">Todas (I a IX)</option>' +
      generations
        .map((g) => `<option value="${g.id}">${escapeHtml(g.label)} · ${g.from}–${g.to}</option>`)
        .join('');
  }

  /* -------------------------------------------------------------- catálogo */
  function renderSkeleton(count = 12) {
    const grid = $('#catalog');
    if (!grid) return;
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = Array.from({ length: count })
      .map(() => `<div class="skeleton" aria-hidden="true"><span class="art"></span><span style="width:45%"></span><span style="width:65%"></span><span style="width:30%"></span></div>`)
      .join('');
  }

  function renderCards(items, { favorites, selectedId }) {
    const grid = $('#catalog');
    if (!grid) return;
    grid.setAttribute('aria-busy', 'false');
    if (!items.length) {
      grid.innerHTML =
        '<div class="empty" style="grid-column:1/-1"><span class="empty-icon">◇</span><p>Nenhum Pokémon corresponde a essa combinação de filtros.<br>Experimente remover um tipo, mudar a geração ou limpar a busca.</p></div>';
      return;
    }
    grid.innerHTML = items
      .map((item, index) => {
        const accent = item.types?.[0]?.color ?? '#22d3ee';
        const favored = favorites.some((f) => Number(f.id) === Number(item.id));
        const measures = item.measures
          ? `${item.measures.heightLabel ?? '—'} · ${item.measures.weightLabel ?? '—'}`
          : `Base ${item.baseTotal ?? '—'}`;
        return `<article class="card" style="--accent:${escapeHtml(accent)};animation-delay:${index * 26}ms"
            data-id="${item.id}" tabindex="0" role="button"
            aria-label="Abrir ficha de ${escapeHtml(item.label)}, ${escapeHtml(item.dex)}"
            ${String(item.id) === String(selectedId) ? 'data-selected="true"' : ''}>
          <div class="card__top">
            <span class="card__dex">${escapeHtml(item.dex)}</span>
            <button class="card__fav" type="button" data-fav="${item.id}" aria-pressed="${favored}"
              aria-label="${favored ? 'Remover' : 'Adicionar'} ${escapeHtml(item.label)} aos favoritos">★</button>
          </div>
          <div class="card__art">
            <img src="${escapeHtml(item.sprites?.official ?? config.artwork(item.id))}"
                 alt="Arte oficial de ${escapeHtml(item.label)}" loading="lazy"
                 onerror="this.onerror=null;this.src='${config.sprite(item.id)}'">
          </div>
          <h3 class="card__name">${escapeHtml(item.label)}</h3>
          <div class="card__types">${(item.types ?? []).map(typeBadge).join('') || '<span class="badge" style="--badge-color:#7d8896">—</span>'}</div>
          <p class="card__meta">${escapeHtml(measures)}</p>
        </article>`;
      })
      .join('');
  }

  function renderPagination(pagination) {
    $('#page-indicator').textContent = `Página ${pagination.page} de ${pagination.pages}`;
    $('#range-indicator').textContent = pagination.total
      ? `exibindo ${pagination.from}–${pagination.to} de ${pagination.total}`
      : 'sem resultados';
    $('#previous').disabled = !pagination.hasPrevious;
    $('#next').disabled = !pagination.hasNext;

    const numbers = $('#page-numbers');
    const pages = pagination.pages;
    const current = pagination.page;
    const wanted = new Set([1, pages, current - 1, current, current + 1, current + 2].filter((p) => p >= 1 && p <= pages));
    const list = [...wanted].sort((a, b) => a - b);
    const chunks = [];
    list.forEach((page, index) => {
      if (index && page - list[index - 1] > 1) chunks.push('…');
      chunks.push(page);
    });
    numbers.innerHTML = chunks
      .map((chunk) =>
        chunk === '…'
          ? '<button type="button" disabled aria-hidden="true">…</button>'
          : `<button type="button" data-page="${chunk}" ${chunk === current ? 'aria-current="page"' : ''}>${chunk}</button>`,
      )
      .join('');
  }

  function renderStatus({ status, error, items, meta, filters }) {
    const line = $('#status');
    if (!line) return;
    if (status === 'loading') {
      line.textContent = 'Consultando PokéAPI v2 através do backend…';
      return;
    }
    if (status === 'error') {
      line.textContent = 'Falha na consulta.';
      return;
    }
    const cached = meta?.cached ? 'resolvido no cache do servidor' : 'busca fresca na PokéAPI';
    const filtersText = [
      filters?.types?.length ? `tipos ${filters.types.map((id) => (window.TYPE_LABELS?.[id] ?? id)).join(' + ')}` : null,
      filters?.generation ? `geração ${filters.generation}` : null,
      filters?.q ? `busca “${filters.q}”` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    line.textContent = `${items} cartões prontos · ${cached}${filtersText ? ` · ${filtersText}` : ''}`;
  }

  function renderSummary(state) {
    const summary = $('#catalog-summary');
    if (!summary) return;
    const total = state.pagination.total.toLocaleString('pt-BR');
    summary.textContent = `Índice nacional com ${total} Pokémon · ${state.pagination.limit} por página · ${state.pagination.pages} páginas.`;
    $('#catalog-count').textContent = `${state.pagination.page}/${state.pagination.pages}`;
  }

  function renderAlert(message, kind = 'error', actionLabel, onAction) {
    const box = $('#alert');
    if (!box) return;
    if (!message) {
      box.className = 'alert';
      box.innerHTML = '';
      return;
    }
    box.className = `alert is-visible alert--${kind}`;
    box.innerHTML =
      `<span class="alert__icon" aria-hidden="true">${kind === 'info' ? 'ℹ' : '⚠'}</span>` +
      `<span>${escapeHtml(message)}</span>` +
      (actionLabel ? `<button class="btn btn--small btn--ghost" type="button" data-alert-action>${escapeHtml(actionLabel)}</button>` : '<span></span>');
    const button = $('[data-alert-action]', box);
    if (button && onAction) button.addEventListener('click', onAction);
  }

  function renderCache(stats) {
    $('#cache-entries').textContent = stats.entries ?? '—';
    $('#cache-hits').textContent = stats.hits ?? '—';
    $('#cache-rate').textContent = `${stats.rate ?? 0}%`;
    $('#upstream-requests').textContent = stats.requests ?? '—';
  }

  /* ----------------------------------------------------------------- ficha */
  function renderLoadingDetail() {
    $('#details').innerHTML =
      '<div class="skeleton"><span class="art"></span><span style="width:50%"></span><span></span><span></span><span style="width:70%"></span></div>';
  }

  function evolutionBlock(evolution, currentId) {
    if (!evolution?.stages?.length) {
      return '<p class="muted">Sem cadeia de evolução registrada na PokéAPI.</p>';
    }
    const groups = new Map();
    evolution.stages.forEach((stage) => {
      const list = groups.get(stage.stage) ?? [];
      list.push(stage);
      groups.set(stage.stage, list);
    });
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const parts = [];
    keys.forEach((key, index) => {
      const nextStage = keys[index + 1];
      const trigger = nextStage
        ? (groups.get(nextStage)[0]?.triggers ?? []).map((t) => t.label).filter(Boolean).slice(0, 2).join(' ou ')
        : null;
      parts.push(
        `<div class="stage-group">${groups
          .get(key)
          .map(
            (stage) =>
              `<button class="evo" type="button" data-evo="${stage.id}" ${String(stage.id) === String(currentId) ? 'data-current="true"' : ''} aria-label="Abrir ficha de ${escapeHtml(stage.label)}">
              <img src="${escapeHtml(stage.image ?? config.sprite(stage.id))}" alt="${escapeHtml(stage.label)}" loading="lazy"
                   onerror="this.onerror=null;this.src='${config.sprite(stage.id)}'">
              <b>${escapeHtml(stage.label)}</b>
              <small>#${stage.id ?? '?'}</small>
            </button>`,
          )
          .join('')}</div>`,
      );
      if (trigger) {
        parts.push(
          `<span class="evo-arrow" aria-label="Evolui para por: ${escapeHtml(trigger)}">▶<small>${escapeHtml(trigger)}</small></span>`,
        );
      }
    });
    return `<div class="chain">${parts.join('')}</div>`;
  }

  function renderDetail(pokemon) {
    const host = $('#details');
    if (!host) return;
    if (!pokemon) {
      host.innerHTML =
        '<div class="empty"><span class="empty-icon">◍</span><p>Selecione um cartão do catálogo para abrir a ficha completa: tipos, medidas convertidas, habilidades, atributos, espécie e evoluções.</p></div>';
      $('#detail-source').textContent = '—';
      return;
    }

    const heroColor = pokemon.types?.[0]?.color ?? '#22d3ee';
    const measures = pokemon.measures ?? {};
    const stats = pokemon.stats ?? [];
    const species = pokemon.species ?? null;
    const favored = window.STATE.isFavorite(pokemon.id);
    const legendary = species?.isLegendary || species?.isMythical;

    $('#detail-source').textContent = pokemon.cached ? 'cache' : 'pokéapi';

    host.innerHTML = `
      <div class="hero" style="--hero:${escapeHtml(heroColor)}">
        <span class="hero__dex">${escapeHtml(pokemon.dex ?? `#${pokemon.id}`)}</span>
        <span class="hero__tag">${(pokemon.types ?? []).map(typeBadge).join('')}</span>
        <img src="${escapeHtml(pokemon.sprites?.official ?? config.artwork(pokemon.id))}"
             alt="Arte oficial de ${escapeHtml(pokemon.label)}"
             onerror="this.onerror=null;this.src='${config.artwork(pokemon.id)}'">
        <p class="hero__name">${escapeHtml(pokemon.label)}</p>
        <p class="hero__genus">${escapeHtml(species?.genus ?? 'Dados de espécie indisponíveis')}${legendary ? ' · lendário' : ''}</p>
      </div>

      <div class="actions">
        <button class="btn ${favored ? 'btn--primary' : 'btn--ghost'}" type="button" data-toggle-favorite="${pokemon.id}">
          ${favored ? '★ Favorito' : '☆ Favoritar'}
        </button>
        <button class="btn btn--ghost" type="button" data-compare="${pokemon.id}">＋ Comparar</button>
        <button class="btn btn--battle btn--small" type="button" data-battle-slot="0">⚔ Slot 1</button>
        <button class="btn btn--battle btn--small" type="button" data-battle-slot="1">⚔ Slot 2</button>
        <button class="btn btn--ghost" type="button" data-open-official="${pokemon.id}" aria-label="Abrir ficha na PokéAPI">↗ PokéAPI</button>
      </div>

      <div>
        <h3 class="section-title">Medidas convertidas <span>dm → m · hg → kg</span></h3>
        <div class="info-grid">
          ${infoCell('Altura', measures.heightLabel ?? '—', measures.imperialHeightLabel)}
          ${infoCell('Peso', measures.weightLabel ?? '—', measures.imperialWeightLabel)}
          ${infoCell('Total base', pokemon.baseTotal ?? '—', `méd. ${pokemon.statsSummary?.average ?? '—'}`)}
          ${infoCell('Índice de poder', pokemon.profile?.powerIndex ?? '—', 'ponderado')}
        </div>
      </div>

      <div>
        <h3 class="section-title">Habilidades <span>${(pokemon.abilities ?? []).length} registradas · texto original da PokéAPI</span></h3>
        ${(pokemon.abilities ?? [])
          .map(
            (ability) =>
              `<div class="ability" data-hidden="${ability.hidden}">
                <b>${escapeHtml(ability.label)}</b>
                <p>${escapeHtml(ability.description ?? 'Sem descrição publicada na PokéAPI.')}</p>
              </div>`,
          )
          .join('') || '<p class="muted">Nenhuma habilidade informada.</p>'}
      </div>

      <div>
        <h3 class="section-title">Atributos base <span>máx. 255 por barra</span></h3>
        ${stats
          .map(
            (stat) =>
              `<div class="stat-row"><span class="stat-row__label">${escapeHtml(stat.label)}</span><span class="stat-row__value">${stat.value}</span>${meter(stat.value)}</div>`,
          )
          .join('')}
        <div class="stat-row"><span class="stat-row__label">Soma</span><span class="stat-row__value">${pokemon.baseTotal ?? 0}</span>${meter(pokemon.baseTotal ?? 0, 720, 'meter--total')}</div>
      </div>

      ${species
        ? `<div>
            <h3 class="section-title">Espécie <span>pokemon-species/${species.id}</span></h3>
            <p class="flavor">${escapeHtml(species.description ?? 'Sem registro de texto de espécie.')}</p>
            <p class="lang-tag">texto da espécie em ${escapeHtml(species.descriptionLanguage ?? '—')} · a PokéAPI não publica pt-BR para esses campos</p>
            <div class="info-grid" style="margin-top:8px">
              ${infoCell('Geração', species.generation?.label ?? '—')}
              ${infoCell('Habitat', species.habitat ?? '—')}
              ${infoCell('Cor', species.color ?? '—')}
              ${infoCell('Captura', species.captureRate ?? '—', 'quanto menor, mais raro')}
              ${infoCell('Amizade base', species.baseHappiness ?? '—')}
              ${infoCell('Forma', species.isBaby ? 'bebê' : 'padrão', `incubação: ${species.hatchCounter ?? '—'} passos`)}
            </div>
            ${(species.eggGroups ?? []).length
              ? `<p style="margin-top:8px">${species.eggGroups.map((g) => typeBadge({ id: g.id, label: g.label, color: '#b8b8e0' })).join(' ')}</p>`
              : ''}
          </div>`
        : ''}

      <div>
        <h3 class="section-title">Cadeia evolutiva <span>${pokemon.evolution?.count ?? 0} formas</span></h3>
        ${evolutionBlock(pokemon.evolution, pokemon.id)}
      </div>
    `;
  }

  /* -------------------------------------------------------------- favoritos */
  function renderFavorites(items, syncState) {
    const host = $('#favorites');
    $('#favorites-count').textContent = String(items.length);
    if (!host) return;
    if (!items.length) {
      host.innerHTML = '<p class="muted">Nenhum favorito ainda. Use a estrela na ficha ou o botão <b>★</b> do cartão.</p>';
      return;
    }
    host.innerHTML = items
      .map(
        (item) =>
          `<div class="fav-item">
            <img src="${escapeHtml(item.image ?? config.sprite(item.id))}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${config.sprite(item.id)}'">
            <div><b>${escapeHtml(item.label ?? `#${item.id}`)}</b><small>${escapeHtml((item.types ?? []).map((t) => t.label ?? t).join(' · ') || `#${item.id}`)}</small></div>
            <button class="btn btn--ghost" type="button" data-open="${item.id}">abrir</button>
            <button class="btn btn--ghost" type="button" data-remove="${item.id}" aria-label="Remover ${escapeHtml(item.label ?? item.id)} dos favoritos">✕</button>
          </div>`,
      )
      .join('') + `<p class="lang-tag" style="margin-top:6px">sincronização: ${escapeHtml(syncState)}</p>`;
  }

  /* ------------------------------------------------------------- comparação */
  function compareRow(label, leftValue, rightValue, leftDisplay, rightDisplay, max) {
    const scale = max || Math.max(Number(leftValue) || 0, Number(rightValue) || 0, 1);
    const leftPct = Math.round(((Number(leftValue) || 0) / scale) * 100);
    const rightPct = Math.round(((Number(rightValue) || 0) / scale) * 100);
    const win = Number(leftValue) === Number(rightValue) ? 'tie' : Number(leftValue) > Number(rightValue) ? 'left' : 'right';
    return `<div class="cmp-row" data-win="${win}">
      <div class="cmp-bar cmp-bar--left"><i style="width:${leftPct}%"></i></div>
      <span class="cmp-num num-left">${leftValue ?? '—'}</span>
      <span class="cmp-row__label">${escapeHtml(label)}</span>
      <span class="cmp-num num-right">${rightValue ?? '—'}</span>
      <div class="cmp-bar cmp-bar--right"><i style="width:${rightPct}%"></i></div>
    </div>`;
  }

  function renderCompare(items) {
    const body = $('#overlay-body');
    if (!body) return '';
    if (items.length < 2) {
      body.innerHTML =
        `<div class="empty"><span class="empty-icon">⇄</span><p>Selecione <b>dois</b> Pokémon com o botão “＋ Comparar” para vê-los lado a lado.<br>Atualmente: ${items.map((i) => escapeHtml(i.label)).join(', ') || 'nenhum'}.</p></div>`;
      return;
    }
    const [a, b] = items;
    const statByName = (pokemon, key) => pokemon.stats?.find((s) => s.id === key)?.value ?? 0;
    const rows = [
      ['HP', 'hp'], ['Ataque', 'attack'], ['Defesa', 'defense'],
      ['At. Especial', 'special-attack'], ['Def. Especial', 'special-defense'], ['Velocidade', 'speed'],
    ];
    body.innerHTML = `
      <div class="compare">
        <div class="compare__side">
          <img src="${escapeHtml(a.sprites?.official ?? config.artwork(a.id))}" alt="${escapeHtml(a.label)}">
          <p class="hero__name">${escapeHtml(a.label)}</p>
          <p>${(a.types ?? []).map(typeBadge).join(' ')}</p>
        </div>
        <span class="compare__vs">VS</span>
        <div class="compare__side">
          <img src="${escapeHtml(b.sprites?.official ?? config.artwork(b.id))}" alt="${escapeHtml(b.label)}">
          <p class="hero__name">${escapeHtml(b.label)}</p>
          <p>${(b.types ?? []).map(typeBadge).join(' ')}</p>
        </div>
      </div>
      <div class="compare__bars">
        ${compareRow('Total base', a.baseTotal, b.baseTotal)}
        ${compareRow('Índice de poder', a.profile?.powerIndex, b.profile?.powerIndex)}
        ${rows.map(([label, key]) => compareRow(label, statByName(a, key), statByName(b, key))).join('')}
        ${compareRow('Altura (m)', a.measures?.meters, b.measures?.meters)}
        ${compareRow('Peso (kg)', a.measures?.kilograms, b.measures?.kilograms)}
      </div>
      <table class="compare__table">
        <thead><tr><th>Métrica</th><th style="text-align:right">${escapeHtml(a.label)}</th><th style="text-align:right">${escapeHtml(b.label)}</th></tr></thead>
        <tbody>
          <tr><td>Pokédex</td><td class="num">${escapeHtml(a.dex)}</td><td class="num">${escapeHtml(b.dex)}</td></tr>
          <tr><td>Tipos</td><td class="num">${escapeHtml((a.types ?? []).map((t) => t.label).join(', '))}</td><td class="num">${escapeHtml((b.types ?? []).map((t) => t.label).join(', '))}</td></tr>
          <tr><td>Altura</td><td class="num">${escapeHtml(a.measures?.heightLabel ?? '—')}</td><td class="num">${escapeHtml(b.measures?.heightLabel ?? '—')}</td></tr>
          <tr><td>Peso</td><td class="num">${escapeHtml(a.measures?.weightLabel ?? '—')}</td><td class="num">${escapeHtml(b.measures?.weightLabel ?? '—')}</td></tr>
          <tr><td>Habilidades</td><td class="num">${escapeHtml((a.abilities ?? []).map((x) => x.label).join(', '))}</td><td class="num">${escapeHtml((b.abilities ?? []).map((x) => x.label).join(', '))}</td></tr>
          <tr><td>Geração</td><td class="num">${escapeHtml(a.species?.generation?.label ?? a.generation?.label ?? '—')}</td><td class="num">${escapeHtml(b.species?.generation?.label ?? b.generation?.label ?? '—')}</td></tr>
        </tbody>
      </table>
      <p class="muted">${escapeHtml(
        (a.baseTotal ?? 0) === (b.baseTotal ?? 0)
          ? 'Empate técnico em total de atributos base.'
          : `${(a.baseTotal ?? 0) > (b.baseTotal ?? 0) ? a.label : b.label} leva vantagem em atributos base (${Math.abs((a.baseTotal ?? 0) - (b.baseTotal ?? 0))} pontos).`,
      )}</p>`;
  }

  function battleSlot(slot, index, animation) {
    if (!slot) {
      return `<div class="battle-slot battle-slot--empty"><span class="battle-slot__number">${index + 1}</span><span class="battle-slot__pokeball">◉</span><b>Slot ${index + 1} livre</b><small>Abra uma ficha e envie o Pokémon para cá.</small></div>`;
    }
    const accent = slot.types?.[0]?.color ?? (index === 0 ? '#e3350d' : '#2a75bb');
    const hp = animation ? (index === 0 ? animation.hpA : animation.hpB) : 100;
    const maxHp = animation ? (index === 0 ? animation.maxHpA : animation.maxHpB) : 100;
    const hpPct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
    return `<div class="battle-slot" style="--battle-accent:${escapeHtml(accent)}"><span class="battle-slot__number">${index + 1}</span><img src="${escapeHtml(slot.sprites?.official ?? config.artwork(slot.id))}" alt="${escapeHtml(slot.label)}"><div><b>${escapeHtml(slot.label)}</b><small>${escapeHtml(slot.dex ?? `#${slot.id}`)} · Total base <strong>${slot.baseTotal ?? '—'}</strong></small><span class="battle-slot__types">${(slot.types ?? []).map(typeBadge).join(' ')}</span><span class="battle-slot__hp"><i style="width:${hpPct}%"></i></span><small class="battle-slot__hp-text">${Math.round(hp)}/${Math.round(maxHp)} HP</small></div><button class="battle-slot__remove" type="button" data-battle-remove="${index}" aria-label="Remover ${escapeHtml(slot.label)} da batalha">✕</button></div>`;
  }

  function renderBattle(battle) {
    const host = $('#battle-slots');
    const scene = $('#battle-scene');
    const result = $('#battle-result');
    const fight = $('#battle-fight');
    if (!host || !scene || !result) return;
    const slots = battle?.slots ?? [null, null];
    const animation = battle?.animation;
    host.innerHTML = `${battleSlot(slots[0], 0, animation)}<div class="battle-vs" aria-hidden="true">VS</div>${battleSlot(slots[1], 1, animation)}`;
    fight.disabled = !(slots[0] && slots[1]) || Boolean(animation?.active);
    if (animation?.active && slots[0] && slots[1]) {
      const hpA = animation.hpA ?? 100;
      const hpB = animation.hpB ?? 100;
      const attacking = animation.attacker === 0 ? slots[0] : slots[1];
      const attackClass = animation.attacker === 0 ? 'scene-pokemon--left' : 'scene-pokemon--right';
      const hitClass = animation.hit ? ` scene-pokemon--hit-${animation.defender}` : '';
      scene.className = `battle-scene battle-scene--active ${animation.attacker === 0 ? 'battle-scene--left-turn' : 'battle-scene--right-turn'}`;
      const defenderPokemon = animation.defender === 0 ? slots[0] : slots[1];
      const element = escapeHtml(animation.activeElement ?? 'normal');
      scene.innerHTML = `<div class="scene-sky"><span class="scene-cloud scene-cloud--one"></span><span class="scene-cloud scene-cloud--two"></span></div><div class="scene-pokemon ${attackClass}${hitClass}"><img src="${escapeHtml(attacking.sprites?.official ?? config.artwork(attacking.id))}" alt="${escapeHtml(attacking.label)}"><b>${escapeHtml(attacking.label)}</b></div><div class="element-projectile element-projectile--${element}" aria-hidden="true"><span>✦</span></div><div class="element-impact-fx element-impact-fx--${element} ${animation.isSuper ? 'is-super' : ''}" aria-hidden="true"><i></i><i></i><i></i></div><div class="scene-pokemon scene-pokemon--opponent ${animation.defender === 0 ? 'scene-pokemon--hit-0' : 'scene-pokemon--hit-1'}"><img src="${escapeHtml(defenderPokemon.sprites?.official ?? config.artwork(defenderPokemon.id))}" alt="${escapeHtml(defenderPokemon.label)}"><b>${escapeHtml(defenderPokemon.label)}</b></div>${animation.damage ? `<div class="damage-floater ${animation.isSuper || animation.isCrit ? 'super' : ''}">-${animation.damage} HP${animation.isCrit ? ' CRÍTICO!' : animation.isSuper ? ' 2x!' : ''}</div>` : ''}<div class="scene-caption"><strong>${escapeHtml(animation.message ?? `${attacking.label} prepara um golpe!`)}</strong><span>${escapeHtml(animation.activeElementLabel ?? 'Normal')} · turno ${animation.turn ?? 1}</span></div><div class="battle-log">${(animation.log ?? []).slice(-3).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>`;
    } else {
      scene.className = 'battle-scene';
      scene.innerHTML = '<div class="scene-idle"><span>◈</span><b>CAMPO DE BATALHA ONLINE</b><small>A simulação usa os base stats e efeitos visuais de combate.</small></div>';
    }
    const outcome = battle?.result;
    if (animation?.active) {
      result.className = 'battle-result battle-result--running';
      result.innerHTML = `<span class="battle-result__icon">⚡</span><div><strong>SIMULAÇÃO EM ANDAMENTO</strong><p>${escapeHtml(animation.message ?? 'O combate começou!')}</p><small>Calculando força, defesa e velocidade</small></div>`;
      return;
    }
    if (!outcome) {
      result.className = 'battle-result';
      result.innerHTML = '<span class="battle-result__icon">⚡</span><p>Escolha dois Pokémon na ficha técnica para iniciar a batalha.</p>';
      return;
    }
    result.className = `battle-result battle-result--${outcome.tie ? 'tie' : 'win'}`;
    result.innerHTML = `<span class="battle-result__icon">${outcome.tie ? '⚖' : '🏆'}</span><div><strong>${escapeHtml(outcome.headline)}</strong><p>${escapeHtml(outcome.summary)}</p><small>${outcome.scoreA} × ${outcome.scoreB} pontos · ${outcome.decidedBy}</small></div>`;
  }

  window.UI = {
    $,
    $$,
    escapeHtml,
    debounce,
    typeBadge,
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
  };
})(window);
