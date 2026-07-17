#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname);
const JSON_FILE = path.join(ROOT_DIR, 'json', 'games_es.json');
const ENV_FILE = path.join(ROOT_DIR, '.env');

loadEnv();

const RAWG_API_KEY = process.env.RAWG_API_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY;

const REQUIRED_ENV = {
  RAWG_API_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
};

const MIN_NODE_VERSION = 18;

main().catch((error) => {
  console.error('\nERROR:', error.message || error);
  process.exit(1);
});

async function main() {
  validateNodeVersion();
  validateEnv();

  const gameName = getGameNameFromArgs();
  console.log('Iniciando proceso para:', gameName);

  const searchResults = await rawgSearch(gameName);
  const bestMatch = pickBestMatch(gameName, searchResults);

  if (!bestMatch) {
    throw new Error('No se encontró un juego compatible en RAWG. Intenta con otro nombre.');
  }

  console.log(`Juego encontrado: ${bestMatch.name} (${bestMatch.slug})`);

  const details = await fetchRawgGameDetails(bestMatch.id);

  if (!details.background_image) {
    throw new Error('El juego seleccionado no tiene portada disponible en RAWG.');
  }

  const imageBuffer = await downloadImage(details.background_image);
  const uploadedImageUrl = await uploadToCloudinary(imageBuffer, `${slugify(details.slug || details.name)}.jpg`);

  const translatedDescription = await translateText(details.description_raw || details.description || details.name || '', 'ES');
  const translatedGenres = await translateGenres(details.genres || []);

  const gameEntry = buildGameEntry(details, translatedDescription, translatedGenres, uploadedImageUrl);

  const games = readGamesFile();
  verifyDuplicate(games, gameEntry);

  games.push(gameEntry);
  saveGamesFile(games);

  printSummary(gameEntry);
}

function validateNodeVersion() {
  const version = process.versions.node.split('.')[0];
  if (Number(version) < MIN_NODE_VERSION) {
    throw new Error(`Node ${MIN_NODE_VERSION}+ es requerido. Versión actual: ${process.versions.node}`);
  }
}

function validateEnv() {
  const missing = Object.entries(REQUIRED_ENV)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}. Copia .env.example a .env y completa los valores.`);
  }
}

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;

  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    const value = rest.join('=').trim();
    if (!process.env[key] && value !== undefined) {
      process.env[key] = value;
    }
  }
}

function getGameNameFromArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error('Debes proveer el nombre del juego. Ejemplo: node add-game.js "Nombre del juego"');
  }
  return args.join(' ').trim();
}

async function rawgSearch(query) {
  const url = new URL('https://api.rawg.io/api/games');
  url.searchParams.set('key', RAWG_API_KEY);
  url.searchParams.set('search', query);
  url.searchParams.set('page_size', '10');

  console.log('Buscando en RAWG...');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`RAWG API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

function pickBestMatch(query, results) {
  if (!results.length) return null;

  const normalizedQuery = normalize(query);
  let bestScore = Infinity;
  let bestResult = null;

  for (const candidate of results) {
    const candidateName = normalize(candidate.name || '');
    const candidateSlug = normalize(candidate.slug || '');
    const distanceName = levenshtein(normalizedQuery, candidateName);
    const distanceSlug = levenshtein(normalizedQuery, candidateSlug);
    const score = Math.min(distanceName, distanceSlug);

    if (score < bestScore) {
      bestScore = score;
      bestResult = candidate;
    }
  }

  return bestResult;
}

async function fetchRawgGameDetails(rawgId) {
  const url = new URL(`https://api.rawg.io/api/games/${rawgId}`);
  url.searchParams.set('key', RAWG_API_KEY);

  console.log('Obteniendo detalles del juego desde RAWG...');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`RAWG detalle error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadImage(imageUrl) {
  console.log('Descargando portada desde RAWG...');
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la portada: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadToCloudinary(buffer, fileName) {
  console.log('Subiendo imagen a Cloudinary...');

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: 'game_catalog',
    transformation: 'q_auto,f_auto,c_scale,w_700',
    timestamp: String(timestamp),
  };

  const signature = createCloudinarySignature(params);
  const formData = new FormData();
  formData.append('file', buffer, {
    filename: fileName,
    contentType: 'application/octet-stream',
  });
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', params.timestamp);
  formData.append('folder', params.folder);
  formData.append('transformation', params.transformation);
  formData.append('signature', signature);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Cloudinary error: ${data.error?.message || response.statusText}`);
  }

  return data.secure_url;
}

function createCloudinarySignature(params) {
  const keys = Object.keys(params).sort();
  const payload = keys
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return crypto.createHash('sha1').update(payload + CLOUDINARY_API_SECRET).digest('hex');
}

async function translateText(text, targetLang = 'ES') {
  if (!text) return '';

  console.log('Traduciendo descripción al español...');
  if (DEEPL_API_KEY) {
    return translateWithDeepl(text, targetLang);
  }

  if (GOOGLE_TRANSLATE_API_KEY) {
    return translateWithGoogle(text, targetLang);
  }

  return translateWithGoogleWeb(text, targetLang);
}

async function translateWithDeepl(text, targetLang) {
  const url = 'https://api-free.deepl.com/v2/translate';
  const formData = new URLSearchParams();
  formData.append('auth_key', DEEPL_API_KEY);
  formData.append('text', text);
  formData.append('target_lang', targetLang);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`DeepL error: ${data.message || response.statusText}`);
  }

  return data.translations?.[0]?.text || text;
}

async function translateWithGoogle(text, targetLang) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target: targetLang.toLowerCase(), format: 'text' }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Google Translate error: ${data.error?.message || response.statusText}`);
  }

  return data.data?.translations?.[0]?.translatedText || text;
}

async function translateWithGoogleWeb(text, targetLang) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', targetLang.toLowerCase());
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Google Translate web error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data[0].map((item) => item[0]).join('') || text;
}

async function translateGenres(genres) {
  if (!Array.isArray(genres) || !genres.length) return [];

  console.log('Traduciendo géneros al español...');
  const translated = [];

  for (const genre of genres) {
    const name = genre.name || '';
    const translatedName = await translateText(name, 'ES');
    translated.push({
      id: genre.id,
      name: translatedName || name,
      slug: genre.slug || slugify(translatedName || name),
      games_count: genre.games_count ?? 0,
    });
  }

  return translated;
}

function buildGameEntry(details, translatedDescription, translatedGenres, imageUrl) {
  return {
    name: details.name,
    name_slug: slugify(details.slug || details.name),
    img: imageUrl,
    description_rawg: translatedDescription,
    geners: translatedGenres,
    rating: Number(details.rating ?? 0),
  };
}

function readGamesFile() {
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`No se encontró el archivo JSON en: ${JSON_FILE}`);
  }

  const raw = fs.readFileSync(JSON_FILE, 'utf8');
  return JSON.parse(raw);
}

function verifyDuplicate(games, newGame) {
  const existing = games.find((item) => {
    const sameSlug = item.name_slug?.toLowerCase() === newGame.name_slug.toLowerCase();
    const sameName = item.name?.toLowerCase() === newGame.name.toLowerCase();
    return sameSlug || sameName;
  });

  if (existing) {
    throw new Error(`Juego duplicado detectado: ${newGame.name}. Ya existe un registro con el mismo nombre o slug.`);
  }
}

function saveGamesFile(games) {
  fs.writeFileSync(JSON_FILE, JSON.stringify(games, null, 2) + '\n', 'utf8');
  console.log(`Juego guardado correctamente en ${JSON_FILE}`);
}

function printSummary(game) {
  console.log('\n--- Resumen final ---');
  console.log(`Nombre: ${game.name}`);
  console.log(`Slug: ${game.name_slug}`);
  console.log(`Portada: ${game.img}`);
  console.log(`Rating: ${game.rating}`);
  console.log(`Géneros: ${game.geners.map((g) => g.name).join(', ')}`);
  console.log('Descripción traducida guardada en description_rawg.');
  console.log('----------------------');
}

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

function slugify(text) {
  return normalize(text).replace(/\s+/g, '-');
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}
