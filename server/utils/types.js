'use strict';

/**
 * Tabela de tipos (Atividade 11 ampliada).
 *
 * O roteiro demonstra 4 filtros (Todos, Fogo, Água, Planta).
 * Aqui expomos os 18 tipos oficiais + filtros combinados, com rótulos
 * em português e as cores clássicas usadas nas artes dos jogos.
 */
const TYPES = [
  { id: 'normal', label: 'Normal', color: '#9fa19f' },
  { id: 'fighting', label: 'Lutador', color: '#ff8000' },
  { id: 'flying', label: 'Voador', color: '#80a0ff' },
  { id: 'poison', label: 'Venenoso', color: '#b567ce' },
  { id: 'ground', label: 'Terrestre', color: '#f9d27f' },
  { id: 'rock', label: 'Pedra', color: '#c8b88a' },
  { id: 'bug', label: 'Inseto', color: '#a4b81d' },
  { id: 'ghost', label: 'Fantasma', color: '#705898' },
  { id: 'steel', label: 'Aço', color: '#b8b8e0' },
  { id: 'fire', label: 'Fogo', color: '#f08030' },
  { id: 'water', label: 'Água', color: '#70a0f8' },
  { id: 'grass', label: 'Planta', color: '#7ac74c' },
  { id: 'electric', label: 'Elétrico', color: '#f8d030' },
  { id: 'psychic', label: 'Psíquico', color: '#f85888' },
  { id: 'ice', label: 'Gelo', color: '#98d8d8' },
  { id: 'dragon', label: 'Dragão', color: '#624de0' },
  { id: 'dark', label: 'Sombrio', color: '#624d4e' },
  { id: 'fairy', label: 'Fada', color: '#ee99ac' },
];

const TYPE_BY_ID = new Map(TYPES.map((t) => [t.id, t]));

/** Faixas de número de Pokédex Nacional por geração. */
const GENERATIONS = [
  { id: 1, label: 'Geração I', roman: 'I', from: 1, to: 151, games: 'Red, Blue e Yellow' },
  { id: 2, label: 'Geração II', roman: 'II', from: 152, to: 251, games: 'Gold, Silver e Crystal' },
  { id: 3, label: 'Geração III', roman: 'III', from: 252, to: 386, games: 'Ruby, Sapphire e Emerald' },
  { id: 4, label: 'Geração IV', roman: 'IV', from: 387, to: 493, games: 'Diamond, Pearl e Platinum' },
  { id: 5, label: 'Geração V', roman: 'V', from: 494, to: 649, games: 'Black e White' },
  { id: 6, label: 'Geração VI', roman: 'VI', from: 650, to: 721, games: 'X e Y' },
  { id: 7, label: 'Geração VII', roman: 'VII', from: 722, to: 809, games: 'Sun e Moon' },
  { id: 8, label: 'Geração VIII', roman: 'VIII', from: 810, to: 905, games: 'Sword e Shield' },
  { id: 9, label: 'Geração IX', roman: 'IX', from: 906, to: 1025, games: 'Scarlet e Violet' },
];

const STAT_LABELS = {
  hp: 'HP',
  attack: 'Ataque',
  defense: 'Defesa',
  'special-attack': 'At. Especial',
  'special-defense': 'Def. Especial',
  speed: 'Velocidade',
};

/** Normaliza a lista de tipos vindo da PokéAPI em objetos de apresentação. */
function describeTypes(pokemonTypes = []) {
  return pokemonTypes
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(({ type }) => ({
      id: type.name,
      label: TYPE_BY_ID.get(type.name)?.label ?? type.name,
      color: TYPE_BY_ID.get(type.name)?.color ?? '#7d8896',
    }));
}

/** Retorna metadados de um tipo; aceita id em inglês ou sinônimos pt-BR. */
function findType(value) {
  // remove acento para aceitar "Elétrico", "Água" e também os ids em inglês
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[-_\s]/g, '');
  const aliases = {
    agua: 'water',
    fogo: 'fire',
    planta: 'grass',
    eletrico: 'electric',
    lutador: 'fighting',
    voador: 'flying',
    venenoso: 'poison',
    terrestre: 'ground',
    pedra: 'rock',
    inseto: 'bug',
    fantasma: 'ghost',
    aco: 'steel',
    psiquico: 'psychic',
    gelo: 'ice',
    gelado: 'ice',
    dragao: 'dragon',
    sombrio: 'dark',
    fada: 'fairy',
    normal: 'normal',
  };
  const id = aliases[normalized] ?? normalized;
  return TYPE_BY_ID.get(id) ?? null;
}

/** Descobre a geração a partir do número de Pokédex Nacional. */
function generationFromId(id) {
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return null;
  return GENERATIONS.find((g) => numeric >= g.from && numeric <= g.to) ?? null;
}

function listTypes() {
  return TYPES.map((type) => ({ ...type }));
}

function listGenerations() {
  return GENERATIONS.map((g) => ({
    id: g.id,
    label: g.label,
    roman: g.roman,
    from: g.from,
    to: g.to,
    games: g.games,
    count: g.to - g.from + 1,
  }));
}

module.exports = {
  TYPES,
  GENERATIONS,
  STAT_LABELS,
  describeTypes,
  findType,
  generationFromId,
  listTypes,
  listGenerations,
};
