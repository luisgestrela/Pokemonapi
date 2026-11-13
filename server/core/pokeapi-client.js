'use strict';

const config = require('../config');
const { cache, TtlCache } = require('./cache');
const { upstream, timeout, notFound } = require('./http-error');

/**
 * Cliente HTTP da PokéAPI v2.
 *
 * Regras do roteiro:
 *  - usa SOMENTE o verbo GET (a PokéAPI é uma API pública de leitura);
 *  - aplica timeout, novas tentativas e mapeia falhas em erros de domínio;
 *  - usa cache fetch-through por chave semântica (Atividade 17).
 */
class PokeApiClient {
  constructor({ baseUrl = config.pokeapi.baseUrl, cacheInstance = cache } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.cache = cacheInstance;
    this.metrics = { requests: 0, cacheHits: 0, retries: 0, failures: 0 };
  }

  /** Normaliza "pikachu", 25, "025" ou URL completa em um recurso seguro. */
  static resourceKey(input) {
    const value = String(input ?? '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) {
      const match = value.match(/\/api\/v2\/([a-z-]+)\/([^/]+)/i);
      if (match) return `${match[1]}/${match[2]}`.toLowerCase();
      return value;
    }
    return value.toLowerCase();
  }

  buildUrl(resource, params = {}) {
    const url = new URL(`${this.baseUrl}/${resource}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  async fetchJson(url, { attempt = 0, label } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.pokeapi.timeoutMs);
    this.metrics.requests += 1;
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': config.pokeapi.userAgent,
        },
      });

      if (response.status === 404) {
        throw notFound(`A PokéAPI não possui o recurso "${label ?? url}".`);
      }
      if (!response.ok) {
        const error = upstream(`A PokéAPI respondeu com HTTP ${response.status}.`, {
          status: response.status,
        });
        // GET é idempotente: falhas 5xx do upstream merecem nova tentativa.
        error.retryable = response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      const isUpstream = error.code === 'UPSTREAM_ERROR' || isTimeout;
      // 404 e erros de validação são definitivos: não devem ser repetidos.
      if (error.name === 'HttpError' && !error.retryable && !isUpstream) throw error;
      const canRetry = (error.retryable || isUpstream) && attempt < config.pokeapi.retries;
      if (canRetry) {
        this.metrics.retries += 1;
        const backoff = config.pokeapi.retryBackoffMs * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchJson(url, { attempt: attempt + 1, label });
      }
      this.metrics.failures += 1;
      if (isTimeout) {
        throw timeout(`Tempo limite de ${config.pokeapi.timeoutMs}ms excedido.`, { url });
      }
      throw upstream('Não foi possível consultar a PokéAPI agora.', {
        cause: error.message,
        url,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET com cache.
   * @param {string} resource ex.: "pokemon/25"
   * @param {object} options { params, ttl, cacheKey, label }
   */
  async get(resource, options = {}) {
    const { params = {}, ttl = config.cache.ttl.pokemon, cacheKey, label } = options;
    const key = TtlCache.key('pokeapi', resource, params);
    const before = this.cache.stats.hits;
    const result = await this.cache.wrap(cacheKey ?? key, ttl, () =>
      this.fetchJson(this.buildUrl(resource, params), { label }),
    );
    if (before < this.cache.stats.hits) this.metrics.cacheHits += 1;
    return result.value;
  }

  /** Consulta de recurso por id, nome ou URL; retorna também se veio do cache. */
  async getResource(resourceCollection, input, options = {}) {
    const resource = PokeApiClient.resourceKey(input);
    if (!resource) throw notFound('Identificador de Pokémon vazio.');
    const scoped = resource.includes('/') ? resource : `${resourceCollection}/${resource}`;
    const before = this.cache.stats.hits;
    const value = await this.get(scoped, options);
    return { value, cached: before < this.cache.stats.hits };
  }

  snapshot() {
    return { ...this.metrics, cache: this.cache.snapshot() };
  }
}

const pokeapi = new PokeApiClient();

module.exports = { PokeApiClient, pokeapi };
