(function exposeConfig(window) {
  'use strict';

  /**
   * Configuração do frontend.
   * `API` aceita tanto o monólito (porta 3000) quanto o API Gateway dos
   * microsserviços (porta 4000): basta trocar a origem ou usar ?api=... na URL
   * para alternar durante a demonstração em sala.
   */
  const params = new URLSearchParams(window.location.search);
  const override = params.get('api');
  const gatewayHint = params.get('gateway') === '1';
  const origin = override
    ? override
    : gatewayHint
      ? `${window.location.protocol}//${window.location.hostname}:4000/api`
      : '/api';

  window.APP_CONFIG = {
    api: origin.replace(/\/$/, ''),
    pageSize: Number(params.get('tamanho')) || 12,
    maxTypes: 6,
    debounceMs: 320,
    requestTimeoutMs: 20000,
    storage: {
      favorites: 'pokedex.favoritos.v1',
      filters: 'pokedex.filtros.v1',
      lastSeen: 'pokedex.ultimo.v1',
    },
    fallbackCacheMs: 5 * 60 * 1000,
    sprite: (id) =>
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`,
    artwork: (id) =>
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  };
})(window);
