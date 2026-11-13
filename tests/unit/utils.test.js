'use strict';

/**
 * Testes unitários (Encontro 2 — "Testes e documentação").
 * Rode com: npm run test:unit
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const units = require('../../server/utils/units');
const types = require('../../server/utils/types');
const text = require('../../server/services/text.service');

test('converte decímetros em metros sem erro de ponto flutuante', () => {
  assert.equal(units.decimetersToMeters(7), 0.7);
  assert.equal(units.decimetersToMeters(40), 4);
  assert.equal(units.decimetersToMeters(null), null);
});

test('converte hectogramas em quilogramas', () => {
  assert.equal(units.hectogramsToKilograms(69), 6.9);
  assert.equal(units.hectogramsToKilograms(690), 69);
});

test('gera medidas métricas e imperiais a partir dos dados brutos', () => {
  const measures = units.buildMeasures({ height: 40, weight: 82 });
  assert.equal(measures.meters, 4);
  assert.equal(measures.kilograms, 8.2);
  assert.equal(measures.centimeters, 400);
  assert.equal(measures.heightLabel, '4 m');
  assert.equal(measures.weightLabel, '8.2 kg');
  assert.match(measures.imperialHeightLabel, /ft$/);
  assert.match(measures.imperialWeightLabel, /lb$/);
});

test('mantém placeholders quando a PokéAPI não traz medidas', () => {
  const measures = units.buildMeasures({});
  assert.equal(measures.heightLabel, '—');
  assert.equal(measures.weightLabel, '—');
  assert.equal(measures.meters, null);
});

test('traduz e colore os 18 tipos de Pokémon', () => {
  assert.equal(types.TYPES.length, 18);
  const fire = types.findType('fire');
  assert.equal(fire.label, 'Fogo');
  assert.equal(fire.color, '#f08030');
});

test('aceita o nome do tipo em português ou inglês', () => {
  assert.equal(types.findType('agua')?.id, 'water');
  assert.equal(types.findType('Elétrico')?.id, 'electric');
  assert.equal(types.findType('inexistente'), null);
});

test('descreve tipos de um Pokémon com rótulo em português', () => {
  const described = types.describeTypes([
    { slot: 2, type: { name: 'flying' } },
    { slot: 1, type: { name: 'fire' } },
  ]);
  assert.deepEqual(described.map((t) => t.id), ['fire', 'flying']);
  assert.deepEqual(described.map((t) => t.label), ['Fogo', 'Voador']);
});

test('calcula a geração a partir do número de Pokédex', () => {
  assert.equal(types.generationFromId(1)?.id, 1);
  assert.equal(types.generationFromId(151)?.id, 1);
  assert.equal(types.generationFromId(152)?.id, 2);
  assert.equal(types.generationFromId(1025)?.id, 9);
  assert.equal(types.listGenerations().length, 9);
  assert.equal(types.listGenerations()[8].roman, 'IX');
});

test('normaliza texto para busca sem acento e sem caixa', () => {
  assert.equal(text.normalizeToken('ÉleTrico'), 'eletrico');
  assert.equal(text.normalizeToken('Mr. Mime'), 'mrmime');
  assert.equal(text.toApiSlug('Pikachu'), 'pikachu');
  assert.equal(text.toApiSlug('  Charizard '), 'charizard');
});

test('aplica título em português preservando conectivos curtos', () => {
  assert.equal(text.titleCase('bulbasaur'), 'Bulbasaur');
  assert.equal(text.titleCase('mr-mime'), 'Mr Mime');
});

test('converte números vindos de query string', () => {
  assert.equal(text.asNumber('25'), 25);
  assert.equal(text.asNumber('abc'), null);
  assert.equal(text.asNumber(undefined), null);
});
