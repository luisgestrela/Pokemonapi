'use strict';

/**
 * Glossário PT-BR (localização de campos que a PokéAPI publica em inglês).
 *
 * A PokéAPI não traz habitat, cor, grupos de ovo e taxa de crescimento em
 * português; traduzimos aqui os valores conhecidos e devolvemos o original
 * entre parênteses quando não houver correspondência, sem esconder o dado.
 */
const HABITATS = {
  'aquatic': 'Aquático',
  'forest': 'Floresta',
  'grassland': 'Campina',
  'mountain': 'Montanha',
  'rough-terrain': 'Terreno acidentado',
  'sea': 'Mar',
  'urban': 'Urbano',
  'rare': 'Raro',
  'waters-edge': 'Borda de água',
  'dense-grass': 'Mata fechada',
  'cave': 'Caverna',
  'snow': 'Neve',
  'fresh-water': 'Água doce',
  'saltwater': 'Água salgada',
  'grounds': 'Solo',
  'rocks': 'Rochas'
};

const COLORS = {
  black: 'Preto',
  blue: 'Azul',
  brown: 'Marrom',
  gray: 'Cinza',
  green: 'Verde',
  pink: 'Rosa',
  purple: 'Roxo',
  red: 'Vermelho',
  white: 'Branco',
  yellow: 'Amarelo',
};

const EGG_GROUPS = {
  'monster': 'Monstro',
  'water-1': 'Aquático 1',
  'water-2': 'Aquático 2',
  'water-3': 'Aquático 3',
  'bug': 'Inseto',
  'flying': 'Voador',
  'field': 'Campo',
  'fairy': 'Fada',
  'grass': 'Planta',
  'human-like': 'Humanoide',
  'mineral': 'Mineral',
  'amorphous': 'Amorfo',
  'dragon': 'Dragão',
  'no-eggs': 'Sem ovos',
  'water1': 'Aquático 1',
  'water2': 'Aquático 2',
  'water3': 'Aquático 3',
};

const GROWTH_RATES = {
  'fast': 'Rápido',
  'medium': 'Médio',
  'medium-fast': 'Médio-rápido',
  'medium-slow': 'Médio-lento',
  'slow': 'Lento',
  'erratic': 'Instável',
  'fluctuating': 'Flutuante',
};

const SHAPES = {
  'ball': 'Bola',
  'squiggle': 'Serpantino',
  'fish': 'Peixe',
  'arms': 'Braços',
  'blob': 'Gota',
  'upright': 'Ereto',
  'quadruped': 'Quadrúpede',
  'shrimp': 'Camarão',
  'winged': 'Com asas',
  'tentacles': 'Tentáculos',
  'head': 'Cabeça',
};

/** Traduz um valor de enumeração, preservando o termo original. */
function translate(table, value) {
  if (value === null || value === undefined) return null;
  const key = String(value).toLowerCase();
  const label = table[key];
  return label ? { id: key, label, original: key } : { id: key, label: null, original: key };
}

function habitat(value) {
  return translate(HABITATS, value);
}
function color(value) {
  return translate(COLORS, value);
}
function eggGroup(value) {
  return translate(EGG_GROUPS, typeof value === 'object' ? value?.name : value);
}
function growthRate(value) {
  return translate(GROWTH_RATES, typeof value === 'object' ? value?.name : value);
}
function shape(value) {
  return translate(SHAPES, typeof value === 'object' ? value?.name : value);
}

module.exports = { HABITATS, COLORS, EGG_GROUPS, GROWTH_RATES, SHAPES, habitat, color, eggGroup, growthRate, shape };
