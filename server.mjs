import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4174);
const apiBase = 'https://api.sympla.com.br/public/v1.6.0';
const spotifyApiBase = 'https://api.spotify.com/v1';
const maxPages = 100;
let spotifyToken = '';
let spotifyTokenExpiresAt = 0;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function spotifyArtistId(value) {
  const raw = String(value || '').trim();
  const uriMatch = /^spotify:artist:([A-Za-z0-9]{22})$/.exec(raw);
  if (uriMatch) return uriMatch[1];
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('Cole o link completo do perfil de artista no Spotify.'), { status: 400 });
  }
  if (url.protocol !== 'https:' || !['open.spotify.com', 'www.open.spotify.com'].includes(url.hostname.toLowerCase())) {
    throw Object.assign(new Error('Use um link oficial do Spotify, como https://open.spotify.com/artist/…'), { status: 400 });
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.lastIndexOf('artist');
  const id = index >= 0 ? parts[index + 1] : '';
  if (!/^[A-Za-z0-9]{22}$/.test(id || '')) {
    throw Object.assign(new Error('Esse link não parece ser de um perfil de artista do Spotify.'), { status: 400 });
  }
  return id;
}

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error('Spotify não configurado. Adicione SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET ao arquivo .env e reinicie o servidor.'), { status: 503 });
  }
  if (spotifyToken && Date.now() < spotifyTokenExpiresAt - 30000) return spotifyToken;
  let response;
  try {
    response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('Falha ao solicitar autenticação ao Spotify.', error.name || 'Erro de rede');
    throw Object.assign(new Error('Não foi possível conectar ao Spotify. Tente novamente.'), { status: 502 });
  }
  if (!response.ok) {
    console.error(`O Spotify recusou a autenticação de servidor (HTTP ${response.status}).`);
    throw Object.assign(new Error('O Spotify recusou as credenciais do app. Confira o Client ID e Client Secret no .env.'), { status: 502 });
  }
  const tokenData = await response.json();
  if (typeof tokenData.access_token !== 'string' || !Number.isFinite(tokenData.expires_in)) {
    throw Object.assign(new Error('O Spotify retornou uma resposta de autenticação inválida.'), { status: 502 });
  }
  spotifyToken = tokenData.access_token;
  spotifyTokenExpiresAt = Date.now() + tokenData.expires_in * 1000;
  return spotifyToken;
}

async function getSpotifyArtist(value) {
  const id = spotifyArtistId(value);
  const token = await getSpotifyToken();
  let response;
  try {
    response = await fetch(`${spotifyApiBase}/artists/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    console.error('Falha de comunicação com o catálogo do Spotify.', error.name || 'Erro de rede');
    throw Object.assign(new Error('Não foi possível consultar o catálogo do Spotify. Tente novamente.'), { status: 502 });
  }
  if (!response.ok) {
    if (response.status === 401) {
      spotifyToken = '';
      spotifyTokenExpiresAt = 0;
    }
    if (response.status === 404) throw Object.assign(new Error('Esse perfil de artista não foi encontrado no Spotify.'), { status: 404 });
    if (response.status === 429) throw Object.assign(new Error('O Spotify limitou as consultas. Aguarde um pouco e tente novamente.'), { status: 429 });
    console.error(`O catálogo do Spotify respondeu com HTTP ${response.status}.`);
    throw Object.assign(new Error('Não foi possível consultar esse perfil do Spotify agora.'), { status: 502 });
  }
  let artist;
  try {
    artist = await response.json();
  } catch {
    throw Object.assign(new Error('A resposta do Spotify não veio no formato esperado.'), { status: 502 });
  }
  const image = Array.isArray(artist.images)
    ? artist.images.find(item => typeof item?.url === 'string' && item.url.startsWith('https://'))?.url || null
    : null;
  const spotifyUrl = artist.external_urls?.spotify;
  if (artist.id !== id || typeof artist.name !== 'string' || typeof spotifyUrl !== 'string' || !spotifyUrl.startsWith('https://open.spotify.com/')) {
    throw Object.assign(new Error('O perfil retornado pelo Spotify não veio no formato esperado.'), { status: 502 });
  }
  return { id, name: artist.name, url: spotifyUrl, image };
}

async function loadLocalEnv() {
  let contents;
  try {
    contents = await readFile(path.join(root, '.env'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !['SYMPLA_TOKEN', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'].includes(match[1]) || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\s+#.*$/, '');
    process.env[match[1]] = value;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function validLocalRequest(req) {
  const host = (req.headers.host || '').toLowerCase();
  if (!['127.0.0.1', 'localhost'].includes(host.split(':')[0])) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

async function symplaGet(resource, query = {}) {
  const token = process.env.SYMPLA_TOKEN?.trim();
  if (!token) {
    const error = new Error('Token Sympla não configurado. Copie .env.example para .env, preencha SYMPLA_TOKEN e reinicie o servidor.');
    error.status = 503;
    throw error;
  }
  const url = new URL(`${apiBase}${resource}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      headers: { s_token: token, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.error('Falha de comunicação com a Sympla.', error.name || 'Erro de rede');
    const failure = new Error('Não foi possível acessar a Sympla agora. Tente novamente.');
    failure.status = 502;
    throw failure;
  }
  if (!response.ok) {
    const failure = new Error(`A Sympla respondeu com HTTP ${response.status}. Confira o token e tente novamente.`);
    failure.status = response.status === 429 ? 429 : 502;
    throw failure;
  }
  if (response.status === 204) return { data: [], pagination: {} };
  try {
    return await response.json();
  } catch {
    const failure = new Error('A resposta da Sympla não veio no formato esperado.');
    failure.status = 502;
    throw failure;
  }
}

async function listEvents() {
  const events = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const result = await symplaGet('/events', {
      published: 'all',
      timezone: 'America/Sao_Paulo',
      sort: 'desc',
      page_size: 100,
      cursor,
      fields: 'id,name,start_date,end_date,url,published,cancelled',
    });
    if (!Array.isArray(result.data)) throw new Error('A resposta de eventos da Sympla não veio no formato esperado.');
    events.push(...result.data.map(event => ({
      id: String(event.id || ''),
      name: String(event.name || 'Evento sem nome'),
      startDate: event.start_date || null,
      endDate: event.end_date || null,
      url: event.url || null,
    })).filter(event => event.id));
    cursor = result.pagination?.next_cursor;
    if (!cursor) return events;
  }
  throw new Error('A lista de eventos ultrapassou o limite de páginas desta integração.');
}

async function summarizeSales(eventId) {
  let cursor;
  let tickets = 0;
  let gross = 0;
  let net = 0;
  for (let page = 0; page < maxPages; page++) {
    const result = await symplaGet(`/events/${encodeURIComponent(eventId)}/participants`, {
      cancelled_filter: 'none',
      timezone: 'America/Sao_Paulo',
      page_size: 500,
      cursor,
      fields: 'ticket_sale_price,ticket_net_value,ticket_created_at',
    });
    if (!Array.isArray(result.data)) throw new Error('A resposta de ingressos da Sympla não veio no formato esperado.');
    for (const ticket of result.data) {
      tickets++;
      const salePrice = Number(ticket.ticket_sale_price);
      const netValue = Number(ticket.ticket_net_value);
      if (Number.isFinite(salePrice)) gross += salePrice;
      if (Number.isFinite(netValue)) net += netValue;
    }
    cursor = result.pagination?.next_cursor;
    if (!cursor) return { tickets, gross, net, syncedAt: new Date().toISOString() };
  }
  throw new Error('As vendas deste evento ultrapassaram o limite de páginas desta integração.');
}

async function serveStatic(req, res, pathname) {
  const publicRoot = path.resolve(root, 'dist');
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!relative) relative = 'index.html';
  let file = path.resolve(publicRoot, relative);
  if (file !== publicRoot && !file.startsWith(`${publicRoot}${path.sep}`)) {
    res.writeHead(403);
    res.end('Acesso negado.');
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const content = await readFile(file);
    res.writeHead(200, {
      'content-type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    res.end(content);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const index = await readFile(path.join(publicRoot, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff' });
    res.end(index);
  }
}

await loadLocalEnv();
const apiOnly = process.env.SYMPLA_API_ONLY === '1';
const server = createServer(async (req, res) => {
  if (!validLocalRequest(req)) {
    json(res, 403, { error: 'A integração só aceita solicitações locais.' });
    return;
  }
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || `127.0.0.1:${port}`}`);
  } catch {
    json(res, 400, { error: 'Endereço de solicitação inválido.' });
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET') {
      json(res, 405, { error: 'Método não permitido.' });
      return;
    }
    try {
      if (url.pathname === '/api/sympla/events') {
        json(res, 200, { events: await listEvents() });
        return;
      }
      const salesMatch = /^\/api\/sympla\/events\/([A-Za-z0-9_-]+)\/sales$/.exec(url.pathname);
      if (salesMatch) {
        json(res, 200, await summarizeSales(salesMatch[1]));
        return;
      }
      if (url.pathname === '/api/spotify/artist') {
        json(res, 200, { artist: await getSpotifyArtist(url.searchParams.get('url')) });
        return;
      }
      json(res, 404, { error: 'Rota da integração não encontrada.' });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      if (!error.status) console.error('Falha ao processar resposta de integração.', error.message);
      json(res, status, { error: error.message || 'Não foi possível concluir a solicitação.' });
    }
    return;
  }
  if (apiOnly) {
    json(res, 404, { error: 'Rota não encontrada.' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end('Método não permitido.');
    return;
  }
  try {
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error('Falha ao servir o app.', error);
    res.writeHead(500);
    res.end('Não foi possível abrir o app.');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Backend local disponível em http://127.0.0.1:${port}`);
  if (!apiOnly) console.log('App servido localmente. Gere a versão de produção com npm run build antes de iniciar.');
  if (!process.env.SYMPLA_TOKEN?.trim()) console.log('Sympla ainda não configurada: preencha SYMPLA_TOKEN no arquivo .env.');
  if (!process.env.SPOTIFY_CLIENT_ID?.trim() || !process.env.SPOTIFY_CLIENT_SECRET?.trim()) console.log('Spotify ainda não configurado: preencha SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no arquivo .env.');
});
