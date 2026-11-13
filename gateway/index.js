'use strict';

/**
 * API Gateway real (desafio avançado do roteiro).
 *
 *  Frontend (estático, servido aqui) -> API Gateway (:4000)
 *      -> catálogo  (:4001)  /api/catalogo*, /api/pokemon*
 *      -> estatísticas (:4002) /api/estatisticas*, /api/tipos*
 *      -> favoritos (:4003)  /api/favoritos*
 *
 * O gateway mantém a mesma interface externa do monólito, então o frontend
 * não muda: apenas a porta-base dos requests é trocada (API_BASE no browser).
 */
const path = require('node:path');
const express = require('express');
const config = require('../server/config');
const { requestLogger, errorHandler } = require('../server/middleware/error-handler');

const ROUTES = [
  // Ordem importa: os padrões mais específicos do serviço de Estatísticas
  // vêm antes do coringa /api/pokemon* do catálogo.
  {
    name: 'stats-service',
    port: config.microservices.statsPort,
    matches: [
      /^\/api\/pokemon\/[^/]+\/(especie|evolucao|estatisticas)$/,
      /^\/api\/pokemon\/comparar$/,
      /^\/api\/estatisticas(\/|$)/,
      /^\/api\/tipos(\/|$)/,
    ],
  },
  {
    name: 'catalog-service',
    port: config.microservices.catalogPort,
    matches: [/^\/api\/catalogo(\/|$)/, /^\/api\/pokemon(\/|$)/],
  },
  {
    name: 'favorites-service',
    port: config.microservices.favoritesPort,
    matches: [/^\/api\/favoritos(\/|$)/],
  },
];

/** Casa o caminho SEM a query string: "/api/catalogo?tamanho=6" -> "/api/catalogo". */
function resolveService(urlPath) {
  const pathname = String(urlPath ?? '').split('?')[0];
  return ROUTES.find((route) => route.matches.some((re) => re.test(pathname))) ?? null;
}

const metrics = { forwarded: 0, failures: 0, byService: {} };

async function forward(req, res, route) {
  const target = new URL(req.originalUrl.replace(/^\/api/, ''), `http://127.0.0.1:${route.port}`);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.microservices.internalTimeoutMs);
  metrics.forwarded += 1;
  metrics.byService[route.name] = (metrics.byService[route.name] ?? 0) + 1;
  try {
    const init = {
      method: req.method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'x-forwarded-by': 'api-gateway',
        'x-request-start': String(req.startedAt ?? startedAt),
      },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(req.body);
    }
    const upstreamResponse = await fetch(target.toString(), init);
    const text = await upstreamResponse.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { ok: false, error: { code: 'INVALID_UPSTREAM_JSON', message: text.slice(0, 200) } };
    }
    res
      .status(upstreamResponse.status)
      .set('X-Gateway-Service', route.name)
      .set('X-Gateway-Upstream', target.toString())
      .set('X-Gateway-Latency-Ms', String(Date.now() - startedAt))
      .json({
        ...(payload ?? {}),
        meta: {
          ...(payload?.meta ?? {}),
          gateway: {
            service: route.name,
            port: route.port,
            latencyMs: Date.now() - startedAt,
            architecture: 'microsservicos',
          },
        },
      });
  } catch (error) {
    metrics.failures += 1;
    res
      .status(502)
      .set('X-Gateway-Service', route.name)
      .json({
        ok: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `O serviço "${route.name}" não respondeu (${error.name === 'AbortError' ? 'tempo limite' : error.message}).`,
          service: route.name,
        },
        meta: { architecture: 'microsservicos' },
      });
  } finally {
    clearTimeout(timer);
  }
}

function createGatewayApp({ staticDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(requestLogger);
  app.use((req, res, next) => {
    req.startedAt = Date.now();
    res.setHeader('X-Powered-By', 'PokedexExplorer API Gateway');
    // mesmo contrato de cabeçalho do monólito, para o frontend não mudar
    res.setHeader('X-API-Version', 'v1');
    next();
  });

  app.get('/api/health', async (req, res) => {
    const checks = await Promise.all(
      ROUTES.map(async (route) => {
        const url = `http://127.0.0.1:${route.port}/health`;
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
          return { service: route.name, port: route.port, status: response.ok ? 'online' : 'degraded', url };
        } catch (error) {
          return { service: route.name, port: route.port, status: 'offline', url, error: error.message };
        }
      }),
    );
    res.json({
      ok: true,
      data: {
        status: checks.every((c) => c.status === 'online') ? 'online' : 'degraded',
        mode: 'microsservicos',
        checks,
      },
      meta: { architecture: 'microsservicos', metrics, generatedAt: new Date().toISOString() },
    });
  });

  app.get('/api/arquitetura', (req, res) =>
    res.json({
      ok: true,
      data: {
        entryPoint: 'API Gateway',
        services: ROUTES.map((r) => ({ name: r.name, port: r.port, patterns: r.matches.map(String) })),
        metrics,
      },
    }),
  );

  // Cache: agrega o contrato de cada serviço (Atividade 17 em modo distribuído).
  app.get('/api/cache/estatisticas', async (req, res) => {
    const services = await Promise.all(
      ROUTES.map(async (route) => {
        try {
          const response = await fetch(`http://127.0.0.1:${route.port}/cache/estatisticas`);
          const body = await response.json();
          return { service: route.name, port: route.port, ...(body.data ?? {}) };
        } catch (error) {
          return { service: route.name, port: route.port, error: error.message };
        }
      }),
    );
    const totals = services.reduce(
      (acc, item) => {
        acc.entries += item.cache?.entries ?? 0;
        acc.hits += item.cache?.hits ?? 0;
        acc.misses += item.cache?.misses ?? 0;
        acc.requests += item.upstream?.requests ?? 0;
        return acc;
      },
      { entries: 0, hits: 0, misses: 0, requests: 0 },
    );
    const looked = totals.hits + totals.misses;
    res.json({
      ok: true,
      data: {
        architecture: 'microsservicos',
        // chaves espelhadas do monólito (cache/upstream) para manter o contrato
        cache: { entries: totals.entries, hits: totals.hits, misses: totals.misses, hitRate: looked ? Number(((totals.hits / looked) * 100).toFixed(1)) : 0 },
        upstream: { requests: totals.requests },
        totals,
        services,
      },
      meta: { source: 'gateway', generatedAt: new Date().toISOString(), gateway: { metrics } },
    });
  });
  app.delete('/api/cache', async (req, res) => {
    const results = await Promise.all(
      ROUTES.map(async (route) => {
        try {
          const response = await fetch(`http://127.0.0.1:${route.port}/cache`, { method: 'DELETE' });
          const body = await response.json();
          return { service: route.name, removed: body.data?.removed ?? 0 };
        } catch (error) {
          return { service: route.name, error: error.message };
        }
      }),
    );
    res.json({
      ok: true,
      data: { removed: results.reduce((sum, r) => sum + (r.removed ?? 0), 0), services: results },
      meta: { source: 'gateway', architecture: 'microsservicos', generatedAt: new Date().toISOString() },
    });
  });
  app.use('/api', (req, res) => {
    // req.originalUrl preserva o prefixo /api (req.path viraria relativo ao mount).
    const route = resolveService(req.originalUrl);
    if (!route) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'ROUTE_NOT_FOUND',
          message: `Nenhum microsserviço atende ${req.method} ${req.originalUrl}.`,
        },
      });
    }
    return forward(req, res, route);
  });

  const assets = staticDir ?? path.join(__dirname, '..', 'public');
  app.use(
    express.static(assets, {
      extensions: ['html'],
      setHeaders(res) {
        res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('/', (req, res) => res.sendFile(path.join(assets, 'index.html')));

  app.use(errorHandler);
  return app;
}

if (require.main === module) {
  createGatewayApp().listen(config.microservices.gatewayPort, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[api-gateway] http://localhost:${config.microservices.gatewayPort} -> ` +
        ROUTES.map((r) => `${r.name}:${r.port}`).join(', '),
    );
  });
}

module.exports = { createGatewayApp, resolveService, ROUTES };
