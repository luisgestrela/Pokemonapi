'use strict';

/**
 * Conversões de unidades (Atividade 4).
 *
 * A PokéAPI devolve altura em decímetros e peso em hectogramas.
 * Apresentamos metros/quilogramas e, como apoio extra, pés/libras.
 */
/** null/undefined/vazio não são números válidos: devolvem null (sem virar 0). */
const nullable = (value) =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

/** decímetros -> metros */
const decimetersToMeters = (dm) => (nullable(dm) === null ? null : round(dm / 10, 2));

/** hectogramas -> quilogramas */
const hectogramsToKilograms = (hg) => (nullable(hg) === null ? null : round(hg / 10, 2));

/** metros -> pés (1 m = 3,28084 ft) */
const metersToFeet = (m) => (nullable(m) === null ? null : round(m * 3.28084, 2));

/** quilogramas -> libras (1 kg = 2,20462 lb) */
const kilogramsToPounds = (kg) => (nullable(kg) === null ? null : round(kg * 2.20462, 2));

/**
 * Monta o objeto de medidas pronto para o frontend.
 * @param {{ height?: number, weight?: number }} raw dados brutos da PokéAPI
 */
function buildMeasures({ height, weight } = {}) {
  const meters = Number.isFinite(Number(height)) ? decimetersToMeters(height) : null;
  const kilograms = Number.isFinite(Number(weight)) ? hectogramsToKilograms(weight) : null;
  return {
    raw: { height, weight },
    meters,
    centimeters: meters === null ? null : round(meters * 100, 1),
    kilograms,
    feet: meters === null ? null : metersToFeet(meters),
    pounds: kilograms === null ? null : kilogramsToPounds(kilograms),
    heightLabel: meters === null ? '—' : `${meters} m`,
    weightLabel: kilograms === null ? '—' : `${kilograms} kg`,
    imperialHeightLabel: meters === null ? '—' : `${metersToFeet(meters)} ft`,
    imperialWeightLabel: kilograms === null ? '—' : `${kilogramsToPounds(kilograms)} lb`,
  };
}

module.exports = {
  round,
  decimetersToMeters,
  hectogramsToKilograms,
  metersToFeet,
  kilogramsToPounds,
  buildMeasures,
};
