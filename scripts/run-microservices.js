'use strict';

/**
 * Sobe o cenário de microsserviços com um único comando:
 *   npm run micro
 *
 * Ordem: catálogos -> estatísticas -> favoritos -> API Gateway (:4000).
 * O frontend fica idêntico ao modo monólito; basta abrir
 * http://localhost:4000 (o gateway também serve os arquivos estáticos).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const config = require('../server/config');

const services = [
  { name: 'catalog-service', file: 'services-ms/catalog/index.js', port: config.microservices.catalogPort },
  { name: 'stats-service', file: 'services-ms/stats/index.js', port: config.microservices.statsPort },
  { name: 'favorites-service', file: 'services-ms/favorites/index.js', port: config.microservices.favoritesPort },
  { name: 'api-gateway', file: 'gateway/index.js', port: config.microservices.gatewayPort },
];

// MICRO_WATCH=1 npm run micro  (ou npm run micro:dev) reinicia cada serviço ao salvar.
const watch = process.env.MICRO_WATCH === '1' || process.argv.includes('--watch');
const colors = ['#e3350d', '#4de2e2', '#ffcb05', '#a4e71d'];
const children = [];
let shuttingDown = false;

function log(name, color, message) {
  for (const line of message.split('\n')) {
    if (line.trim()) console.log(`\x1b[38;5;${color}m[${name}]\x1b[0m ${line.trim()}`);
  }
}

services.forEach((service, index) => {
  const child = spawn(process.execPath, [...(watch ? ['--watch'] : []), path.join(__dirname, '..', service.file)], {
    env: { ...process.env, LOG_REQUESTS: process.env.LOG_REQUESTS ?? 'off' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', (data) => log(service.name, colors[index % colors.length], data.toString()));
  child.stderr.on('data', (data) => log(`${service.name}!`, 203, data.toString()));
  child.on('exit', (code) => {
    log(service.name, colors[index % colors.length], `encerrado (código ${code}).`);
    if (!shuttingDown) {
      shuttingDown = true;
      for (const other of children) if (other !== child && !other.killed) other.kill('SIGTERM');
    }
  });
});

process.on('SIGINT', () => {
  shuttingDown = true;
  console.log('\nEncerrando microsserviços...');
  for (const child of children) child.kill('SIGINT');
  process.exit(0);
});

console.log(
  [
    '',
    '  Microsserviços do Pokédex Explorer',
    ...services.map((s) => `   - ${s.name.padEnd(18)} porta ${s.port}`),
    '',
    `  Frontend + API: http://localhost:${config.microservices.gatewayPort}`,
    watch ? '  Modo watch: ativo (reinicia ao salvar)' : '',
    `  Diagnóstico:    http://localhost:${config.microservices.gatewayPort}/api/health`,
    '',
  ].join('\n'),
);
