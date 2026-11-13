'use strict';

const config = require('../config');
const { pokeapi } = require('../core/pokeapi-client');
const { titleCase } = require('./text.service');

const SPRITE = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const ARTWORK = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const idFromUrl = (url) => {
  const match = String(url ?? '').match(/\/(\d+)\/$/);
  return match ? Number(match[1]) : null;
};

/**
 * Evoluções (Atividade 15): GET /evolution-chain/{id}.
 * Achata a cadeia recursiva em estágios e normaliza gatilhos (level, item,
 * trade, felicidade, pedra, gênero etc.).
 */
function flattenChain(nodes, stages = [], depth = 0) {
  for (const node of nodes ?? []) {
    const id = idFromUrl(node.species?.url);
    stages.push({
      stage: depth + 1,
      id,
      position: stages.length + 1,
      name: node.species?.name ?? null,
      label: titleCase(node.species?.name ?? ''),
      image: id ? SPRITE(id) : null,
      artwork: id ? ARTWORK(id) : null,
      triggers: (node.evolution_details ?? []).map(describeTrigger),
      isBaby: Boolean(node.is_baby),
    });
    // A PokéAPI usa "evolves_to" para os filhos de cada nó da cadeia.
    flattenChain(node.evolves_to ?? [], stages, depth + 1);
  }
  return stages;
}

function describeTrigger(details) {
  const minLevel = details.min_level ?? details.min_happiness ?? details.min_beauty ?? null;
  // A PokéAPI publica o gatilho em "trigger.name"; "evolution_type" é aceito
  // como alias para não quebrar caso o formato mude.
  const typeKey = (details.trigger?.name ?? details.evolution_type?.name ?? 'unknown')
    .replace(/-/g, '_');
  const labels = {
    level_up: minLevel ? `Nível ${minLevel}` : 'Subir de nível',
    use_item: details.item?.name ? `Item: ${titleCase(details.item.name)}` : 'Usar item',
    trade: details.hold_item?.name ? `Troca segurando ${titleCase(details.hold_item.name)}` : 'Troca',
    use_move: details.used_move?.name ? `Ao usar ${titleCase(details.used_move.name)}` : 'Usar golpe',
    use_item_dark: 'Item em ambiente escuro',
    shed: 'Troca (Shed)',
    level_up_special: minLevel ? `Nível ${minLevel} (especial)` : 'Nível (condição especial)',
    friendly_happiness: 'Amizade alta',
    beautiful: 'Beleza',
    tough: 'Robustez',
    intellectual: 'Intelecto',
    cool: 'Frieza',
  };
  return {
    key: typeKey,
    label: labels[typeKey] ?? labels.level_up ?? titleCase(details.evolution_type?.name ?? 'Evolução'),
    minLevel: details.min_level ?? null,
    item: details.item?.name ?? null,
    heldItem: details.hold_item?.name ?? null,
    knownMove: details.known_move?.name ?? null,
    timeOfDay: details.time_of_day ?? null,
    partyType: details.party_type?.name ?? null,
    gender: details.gender ?? null,
  };
}

async function getChainBySpecies(input) {
  const speciesService = require('./species.service');
  const species = await speciesService.getSpecies(input);
  const chainUrl = species.evolutionChainUrl;
  if (!chainUrl) {
    return { chainId: null, species, stages: [], baby: null, root: null };
  }
  const chainId = idFromUrl(chainUrl.replace(/\/$/, '') + '/');
  const data = await pokeapi.get(`evolution-chain/${chainId ?? chainUrl.split('/').filter(Boolean).pop()}`, {
    ttl: config.cache.ttl.evolution,
    label: `cadeia ${chainId}`,
  });
  const stages = flattenChain([data.chain]);
  return {
    chainId,
    species: { id: species.id, name: species.name, label: species.label, genus: species.genus },
    baby: stages.find((s) => s.isBaby) ?? null,
    root: stages[0] ?? null,
    stages,
    count: stages.length,
  };
}

module.exports = { getChainBySpecies, flattenChain, describeTrigger, idFromUrl };
