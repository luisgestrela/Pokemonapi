# Implantação no Vercel

O problema de conexão acontecia porque o projeto local iniciava o Express com `app.listen()`.
No Vercel, o backend precisa ser exportado como uma função serverless. Esta versão já contém:

- `api/index.js`: adaptador que exporta `createApp()` para o runtime Node do Vercel;
- `vercel.json`: encaminha `/api/*` para a função Express;
- frontend usando `/api` como origem relativa, sem URL `localhost` fixa;
- favoritos usando `/tmp` quando `VERCEL=1`, evitando tentativa de escrita na pasta somente leitura do deploy.

## Deploy pelo painel

1. Importe o repositório no Vercel.
2. Selecione **Other** como framework, caso o Vercel não detecte automaticamente.
3. Use a raiz do projeto, onde estão `package.json`, `api/`, `public/` e `vercel.json`.
4. Não configure `npm start` como comando de deploy. A função usada pelo Vercel é `api/index.js`.
5. Não informe uma URL de backend no frontend. O projeto já usa `/api` relativo ao domínio do Vercel.
6. Faça o deploy.

## Deploy pela CLI

```bash
npm install
npx vercel login
npx vercel
npx vercel --prod
```

Para este projeto não é necessário configurar banco de dados para a PokéAPI. O backend faz as
requisições server-side para `https://pokeapi.co/api/v2`.

## Variáveis opcionais

Podem ser adicionadas em **Project Settings → Environment Variables**:

```text
POKEAPI_BASE_URL=https://pokeapi.co/api/v2
POKEAPI_TIMEOUT_MS=8000
POKEAPI_RETRIES=2
CACHE_ENABLED=true
PAGE_SIZE=12
```

Não configure `PORT` nem `HOST` para o deploy serverless.

## Verificação após o deploy

Substitua `https://seu-projeto.vercel.app` pela URL real:

```bash
curl -i https://seu-projeto.vercel.app/api/health
curl -i 'https://seu-projeto.vercel.app/api/catalogo?pagina=1&tamanho=12'
```

O primeiro endpoint deve retornar HTTP 200 com `{"ok":true}` e `data.status` igual a `online`.
O segundo deve retornar o catálogo com o envelope `{ ok, data, meta }`.

## Observação sobre favoritos

O filesystem do Vercel é efêmero. Os favoritos funcionam durante a vida da instância serverless
e continuam disponíveis no navegador via `localStorage`, mas podem ser reinicializados quando o
Vercel criar uma nova instância. Para persistência permanente, substitua o arquivo por Vercel KV,
Postgres, Supabase ou outro banco externo.

## Erros comuns

| Sintoma | Causa | Correção |
|---|---|---|
| `Cannot GET /api/catalogo` | deploy sem `vercel.json` ou sem `api/index.js` | mantenha ambos na raiz do projeto |
| frontend chama `localhost:3000` | URL absoluta antiga no `config.js` | use a versão atual, que aponta para `/api` |
| erro 500 ao salvar favorito | tentativa de escrever na pasta do projeto | a versão atual usa `/tmp` no Vercel |
| timeout na primeira consulta | hidratação fria do catálogo | aguarde a primeira resposta; o cache reduz as próximas |
| deploy abre página, mas API falha | `npm start` configurado como função | remova o comando e deixe o Vercel detectar `api/index.js` |
