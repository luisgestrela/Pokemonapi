'use strict';

const config = require('../config');

/**
 * Cache em memória com TTL (Atividade 17).
 *
 * Objetivo: reduzir chamadas repetidas à PokéAPI, acelerar respostas e
 * permitir degradação elegante quando o serviço público está fora do ar.
 * Cada entrada guarda valor, expiração e carimbo de criação, e o cache
 * expõe métricas (hits/misses) consumidas em /api/cache/estatisticas.
 */
class TtlCache {
  constructor(options = {}) {
    this.store = new Map();
    this.maxEntries = options.maxEntries ?? config.cache.maxEntries;
    this.enabled = options.enabled ?? config.cache.enabled;
    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0 };
  }

  static key(...parts) {
    return parts
      .filter((p) => p !== undefined && p !== null && p !== '')
      .map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p)))
      .join('|');
  }

  get(key) {
    if (!this.enabled) {
      this.stats.misses += 1;
      return undefined;
    }
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.stats.expirations += 1;
      this.stats.misses += 1;
      return undefined;
    }
    this.stats.hits += 1;
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (!this.enabled || !key) return value;
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      // política simples FIFO para não crescer sem limite
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
      this.stats.evictions += 1;
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs, createdAt: Date.now() });
    this.stats.sets += 1;
    return value;
  }

  /** Envolve uma função assíncrona com cache ("fetch-through"). */
  async wrap(key, ttlMs, producer) {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, cached: true };
    const value = await producer();
    this.set(key, value, ttlMs);
    return { value, cached: false };
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear(prefix) {
    if (!prefix) {
      const size = this.store.size;
      this.store.clear();
      return size;
    }
    let removed = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  snapshot() {
    const total = this.stats.hits + this.stats.misses;
    return {
      enabled: this.enabled,
      entries: this.store.size,
      maxEntries: this.maxEntries,
      hitRate: total === 0 ? 0 : Number(((this.stats.hits / total) * 100).toFixed(1)),
      ...this.stats,
    };
  }
}

/** Instância única compartilhada pelos serviços (monólito) e reutilizada no gateway. */
const cache = new TtlCache();

module.exports = { TtlCache, cache };
