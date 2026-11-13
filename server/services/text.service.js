'use strict';

/** Remove acentos e normaliza para comparações de busca. */
function deaccent(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Token pesquisável: minúsculas, sem acento, só [a-z0-9]. */
function normalizeToken(value) {
  return deaccent(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** "mr-mime" -> "Mr Mime"; "farfetchd" -> "Farfetchd". */
const SHORT_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'no', 'na']);
/** Título em português: conectivos curtos permanecem em minúsculas. */
function titleCase(value) {
  return deaccent(value)
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (SHORT_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Identificador aceito pela PokéAPI a partir de nome digitado pelo usuário. */
function toApiSlug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/['.\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Verifica se o termo é numérico (busca por número de Pokédex). */
function asNumber(value) {
  const cleaned = String(value ?? '').replace(/[^\d]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = { deaccent, normalizeToken, titleCase, toApiSlug, asNumber };
