(function exposeApi(window) {
  'use strict';

  const config = window.APP_CONFIG;

  /** Erro de aplicação com status, código e mensagem amigável em pt-BR. */
  class ApiError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = options.status ?? 0;
      this.code = options.code ?? 'NETWORK';
      this.details = options.details ?? null;
    }
  }

  const MESSAGES = {
    NOT_FOUND: 'Esse Pokémon não existe na PokéAPI. Confira o nome ou o número.',
    ROUTE_NOT_FOUND: 'Rota não existe na API. Verifique o endereço base.',
    BAD_REQUEST: 'A requisição foi rejeitada pelo servidor.',
    VALIDATION_ERROR: 'Os dados enviados são inválidos.',
    UPSTREAM_ERROR: 'A PokéAPI respondeu com erro. Tente novamente em instantes.',
    UPSTREAM_TIMEOUT: 'A PokéAPI demorou demais para responder.',
    SERVICE_UNAVAILABLE: 'Microsserviço indisponível no gateway.',
    GATEWAY_ERROR: 'Falha ao rotear a requisição no gateway.',
    NETWORK: 'Sem conexão com o backend. Rode `npm start` e recarregue.',
    TIMEOUT: 'Tempo limite excedido no navegador.',
  };

  function friendly(error) {
    const code = error.code ?? 'NETWORK';
    return `${MESSAGES[code] ?? MESSAGES.NETWORK}${error.message && !MESSAGES[code] ? ` (${error.message})` : ''}`;
  }

  /**
   * GET/POST/DELETE com envelope { ok, data, meta }, timeout e erros traduzidos.
   */
  async function request(path, { method = 'GET', body, params, timeoutMs = config.requestTimeoutMs } = {}) {
    const url = new URL(config.api + path, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url.toString(), {
        method,
        signal: controller.signal,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (error) {
      if (error.name === 'AbortError') throw new ApiError(MESSAGES.TIMEOUT, { code: 'TIMEOUT' });
      throw new ApiError(MESSAGES.NETWORK, { code: 'NETWORK' });
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    const text = await response.text();
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError('Resposta do backend não é JSON válido.', { status: response.status });
    }

    if (!response.ok || payload?.ok === false) {
      const error = payload?.error ?? {};
      throw new ApiError(friendly(error), {
        status: response.status,
        code: error.code ?? 'UPSTREAM_ERROR',
        message: error.message,
        details: error.details,
      });
    }
    return payload;
  }

  const catalog = (filters) => request('/catalogo', { params: filters });
  const pokemon = (id, include) =>
    request(`/pokemon/${encodeURIComponent(id)}`, { params: { incluir: include } });
  const random = (params) => request('/pokemon/aleatorio', { params });
  const suggest = (q) => request('/catalogo/sugestoes', { params: { q, limite: 8 } });
  const types = () => request('/catalogo/tipos');
  const generations = () => request('/catalogo/geracoes');
  const effectiveness = (typeId) => request(`/catalogo/tipos/${typeId}/efetividade`);
  const favorites = {
    list: () => request('/favoritos'),
    add: (item) => request('/favoritos', { method: 'POST', body: item }),
    remove: (id) => request(`/favoritos/${id}`, { method: 'DELETE' }),
    clear: () => request('/favoritos', { method: 'DELETE' }),
    toggle: (item) => request('/favoritos/alternar', { method: 'POST', body: item }),
  };
  const cacheStats = () => request('/cache/estatisticas');
  const flushCache = () => request('/cache', { method: 'DELETE' });
  const health = () => request('/health');

  window.API = {
    ApiError,
    request,
    catalog,
    pokemon,
    random,
    suggest,
    types,
    generations,
    effectiveness,
    favorites,
    cacheStats,
    flushCache,
    health,
  };
})(window);
