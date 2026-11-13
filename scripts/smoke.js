'use strict';

/**
 * Smoke test de endpoints (Atividade 20).
 *
 * Uso:
 *   node scripts/smoke.js                     # monólito em http://localhost:3000
 *   node scripts/smoke.js http://localhost:4000  # gateway dos microsserviços
 *
 * Cada verificação imprime OK/FALHA e o script sai com código != 0 se alguma
 * falhar, servindo como evidência de testes manuais/orientados a objetos.
 */
const BASE = process.argv[2] ?? process.env.SMOKE_BASE ?? 'http://localhost:3000';

const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures += 1;
  results.push({ name, ok, detail });
  const icon = ok ? 'OK  ' : 'FALHA';
  console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

function hasEnvelope(name, body, extra = {}) {
  check(`${name}: envelope {ok,data,meta}`, body && body.ok === true && 'data' in body && body.meta);
  if (extra.total !== undefined) check(`${name}: total`, body?.meta?.total === extra.total, `total=${body?.meta?.total}`);
  if (extra.length !== undefined) check(`${name}: itens`, body?.data?.length === extra.length, `itens=${body?.data?.length}`);
  return body;
}

async function main() {
  console.log(`\nSmoke test — ${BASE}\n${'='.repeat(BASE.length + 16)}\n`);

  // infraestrutura
  const health = await get('/api/health');
  check('health responde 200', health.status === 200, `status=${health.status}`);
  check(
  'health informa modo de execução',
  ['monolito', 'microsservicos', 'gateway'].includes(health.body?.data?.mode),
  `modo=${health.body?.data?.mode}`,
);
  check('cabeçalho de versão da API', health.headers.get('x-api-version') === 'v1', health.headers.get('x-api-version') ?? 'ausente');

  // atividades 1, 2, 3, 4, 5, 6, 7
  const byNumber = await get('/api/pokemon/25');
  const pika = hasEnvelope('GET /api/pokemon/25', byNumber.body);
  check('identificador numérico resolve', pika?.data?.id === 25, `id=${pika?.data?.id}`);
  const byName = await get('/api/pokemon/pikachu');
  check('nome resolve para o mesmo Pokémon', byName.body?.data?.id === 25, `id=${byName.body?.data?.id}`);
  check('imagens oficiais presentes', Boolean(pika?.data?.sprites?.official));
  check('altura convertida para metros', pika?.data?.measures?.meters === 0.4, `m=${pika?.data?.measures?.meters}`);
  check('peso convertido para quilogramas', pika?.data?.measures?.kilograms === 6, `kg=${pika?.data?.measures?.kilograms}`);
  check('habilidades com descrição', (pika?.data?.abilities ?? []).length >= 1, `qtd=${pika?.data?.abilities?.length}`);
  check('seis atributos com barra percentual', (pika?.data?.stats ?? []).length === 6, `qtd=${pika?.data?.stats?.length}`);

  // atividade 14 e 15
  const species = await get('/api/pokemon/25/especie');
  check('espécie com texto', (species.body?.data?.description ?? '').length > 20, `geração=${species.body?.data?.generation?.label}`);
  const evolution = await get('/api/pokemon/6/evolucao');
  check('cadeia evolutiva com 3 estágios', evolution.body?.data?.count === 3, `count=${evolution.body?.data?.count}`);
  check('gatilho de evolução em português', evolution.body?.data?.stages?.[1]?.triggers?.[0]?.label?.startsWith('Nível'), evolution.body?.data?.stages?.[1]?.triggers?.[0]?.label ?? 'sem gatilho');

  // atividades 8, 10, 11 (catálogo, busca, paginação, filtros)
  const catalog = await get('/api/catalogo?tamanho=12');
  const page = hasEnvelope('GET /api/catalogo', catalog.body, { length: 12 });
  check('paginação com total e páginas', page?.meta?.total > 1000 && page?.meta?.pages > 80, `total=${page?.meta?.total} páginas=${page?.meta?.pages}`);
  const page2 = await get('/api/catalogo?pagina=2');
  check('segunda página avança o offset', page2.body?.data?.[0]?.id === 13, `primeiro id=${page2.body?.data?.[0]?.id}`);
  const search = await get('/api/catalogo?q=pika');
  check('busca por parte do nome', search.body?.data?.[0]?.name === 'pikachu', `resultado=${search.body?.data?.[0]?.name}`);
  const fireFilter = await get('/api/catalogo?tipos=fire&tamanho=12');
  check('filtro por tipo Fogo', (fireFilter.body?.data ?? []).every((i) => i.types.some((t) => t.id === 'fire')), `total=${fireFilter.body?.meta?.total}`);
  const combo = await get('/api/catalogo?tipos=fire,water&match=all');
  check('combinação Fogo + Água (todos)', combo.body?.meta?.total === 1, `total=${combo.body?.meta?.total}`);
  const gen1 = await get('/api/catalogo?geracao=1');
  check('filtro por geração I', gen1.body?.meta?.total === 151, `total=${gen1.body?.meta?.total}`);

  // metadados de filtro
  const types = await get('/api/catalogo/tipos');
  check('lista com os 18 tipos', types.body?.data?.length === 18, `qtd=${types.body?.data?.length}`);
  const generations = await get('/api/catalogo/geracoes');
  check('lista com as 9 gerações', generations.body?.data?.length === 9, `qtd=${generations.body?.data?.length}`);
  const effectiveness = await get('/api/catalogo/tipos/fire/efetividade');
  check('efetividade do tipo Fogo', (effectiveness.body?.data?.effectiveness?.weaknesses ?? []).length > 0, `fraquezas=${effectiveness.body?.data?.effectiveness?.weaknesses?.length}`);
  const suggestions = await get('/api/catalogo/sugestoes?q=char');
  check('autocomplete de busca', (suggestions.body?.data ?? []).length > 0, `sugestões=${suggestions.body?.data?.length}`);

  // atividade 13 e 16
  const compare = await get('/api/pokemon/comparar?a=25&b=6');
  check('comparação com veredito', Boolean(compare.body?.data?.winner?.baseTotal?.winner), `venceu=${compare.body?.data?.winner?.baseTotal?.winner}`);
  const random = await get('/api/pokemon/aleatorio?geracao=1');
  check('sorteio respeitando a geração', random.body?.data?.id >= 1 && random.body?.data?.id <= 151, `id=${random.body?.data?.id}`);

  // atividades 12 e 18 (favoritos)
  await get('/api/favoritos').then((r) => check('lista de favoritos', r.status === 200, `itens=${r.body?.data?.count}`));
  const addFav = await fetch(`${BASE}/api/favoritos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 25, name: 'pikachu', label: 'Pikachu', types: [{ id: 'electric', label: 'Elétrico' }] }),
  });
  const addBody = await addFav.json();
  check('adicionar favorito (POST)', addFav.status === 201 && addBody.data.created === true, `status=${addFav.status}`);
  const removeFav = await fetch(`${BASE}/api/favoritos/25`, { method: 'DELETE' });
  check('remover favorito (DELETE)', removeFav.status === 200, `status=${removeFav.status}`);

  // atividade 17 (cache)
  await get('/api/pokemon/150');
  const second = await get('/api/pokemon/150');
  check('segunda consulta vem do cache', second.body?.meta?.cached === true, `cached=${second.body?.meta?.cached}`);
  const cacheStats = await get('/api/cache/estatisticas');
  check('métricas de cache expostas', cacheStats.body?.data?.cache?.entries >= 0, `entradas=${cacheStats.body?.data?.cache?.entries} taxa=${cacheStats.body?.data?.cache?.hitRate}%`);

  // atividade 9 (erros)
  const notFound = await get('/api/pokemon/999999');
  check('404 para Pokémon inexistente', notFound.status === 404 && notFound.body?.error?.code === 'NOT_FOUND', `código=${notFound.body?.error?.code}`);
  const badPage = await get('/api/catalogo?geracao=42');
  check('400 para geração inválida', badPage.status === 400 && badPage.body?.error?.code === 'BAD_REQUEST', `código=${badPage.body?.error?.code}`);
  const badRoute = await get('/api/nao-existe');
  check('404 de rota inexistente', badRoute.status === 404, `status=${badRoute.status}`);

  // frontend
  const home = await fetch(`${BASE}/`);
  const html = await home.text();
  check('frontend servido pelo backend', home.status === 200 && html.includes('Pokédex Explorer'), `bytes=${html.length}`);

  console.log(`\n${'='.repeat(40)}\n${results.length - failures}/${results.length} verificações OK.`);
  if (failures) {
    console.log(`FALHAS: ${failures}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nNão foi possível executar o smoke test:', error.message);
  console.error('O servidor está de pé? Use: npm start  (ou npm run micro para o gateway em :4000)');
  process.exitCode = 1;
});
