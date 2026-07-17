const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const JSON_FILE = path.join(ROOT_DIR, 'json', 'games_es.json');
const ENV_FILE = path.join(ROOT_DIR, '.env');

let envLoaded = false;

function loadEnv() {
  if (envLoaded) return;
  envLoaded = true;

  if (!fs.existsSync(ENV_FILE)) return;

  const content = fs.readFileSync(ENV_FILE, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    let value = rest.join('=').trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    if (!process.env[key] && value !== undefined) {
      process.env[key] = value;
    }
  }
}

function getConfig() {
  loadEnv();

  return {
    RAWG_API_KEY: process.env.RAWG_API_KEY,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    DEEPL_API_KEY: process.env.DEEPL_API_KEY,
    GOOGLE_TRANSLATE_API_KEY: process.env.GOOGLE_TRANSLATE_API_KEY,
    JSON_FILE,
  };
}

function validateConfig(config) {
  const required = [
    'RAWG_API_KEY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Faltan variables de entorno obligatorias: ${missing.join(', ')}.`);
  }
}

async function rawgSearch(query) {
  const config = getConfig();
  const url = new URL('https://api.rawg.io/api/games');
  url.searchParams.set('key', config.RAWG_API_KEY);
  url.searchParams.set('search', query);
  url.searchParams.set('page_size', '10');

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
  const config = getConfig();
  const url = new URL(`https://api.rawg.io/api/games/${rawgId}`);
  url.searchParams.set('key', config.RAWG_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`RAWG detalle error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function previewGameByName(name) {
  if (!name) {
    throw new Error('El nombre del juego es obligatorio.');
  }

  const results = await rawgSearch(name);
  const best = pickBestMatch(name, results);
  if (!best) {
    throw new Error('No se encontró un juego compatible en RAWG.');
  }

  const details = await fetchRawgGameDetails(best.id);
  const translatedDescription = await translateText(details.description_raw || details.description || details.name || '', 'ES');
  const translatedGenres = await translateGenres(details.genres || []);

  return {
    rawg_id: details.id,
    name: details.name,
    slug: slugify(details.slug || details.name),
    rawg_cover: details.background_image || null,
    description_rawg: translatedDescription,
    geners: translatedGenres,
    rating: Number(details.rating ?? 0),
  };
}

function getPriceFromSize(size) {
  if (typeof size !== 'string' || !size.trim()) {
    return 150;
  }

  const match = size.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(GB|MB|TB)$/i);
  if (!match) {
    return 150;
  }

  let value = Number(match[1].replace(',', '.'));
  const unit = (match[2] || 'GB').toUpperCase();

  if (unit === 'MB') {
    value = value / 1000;
  } else if (unit === 'TB') {
    value = value * 1000;
  }

  return value < 60 ? 150 : 200;
}

async function addGameByRawgId(rawgId, overrides = {}) {
  const config = getConfig();
  validateConfig(config);

  const details = await fetchRawgGameDetails(rawgId);

  // elegir fuente de imagen: override.img (si el admin proporciona URL) o background_image
  const imageSource = overrides.img || details.background_image;
  if (!imageSource) {
    throw new Error('El juego seleccionado no tiene portada disponible y no se proporcionó una alternativa.');
  }

  const imageBuffer = await downloadImage(imageSource);
  const uploadedImageUrl = await uploadToCloudinary(imageBuffer, `${slugify(details.slug || details.name)}.jpg`, config);

  // aplicar overrides para la descripción y géneros si vienen en el request
  const finalDescription = overrides.description_rawg && overrides.description_rawg.length
    ? overrides.description_rawg
    : await translateText(details.description_raw || details.description || details.name || '', 'ES');

  let finalGenres = [];
  if (overrides.geners) {
    // si vienen como string "Accion, Aventura" -> convertir a array de objetos
    if (typeof overrides.geners === 'string') {
      finalGenres = overrides.geners.split(',').map((s) => s.trim()).filter(Boolean).map((name, idx) => ({
        id: 0,
        name,
        slug: slugify(name),
        games_count: 0,
      }));
    } else if (Array.isArray(overrides.geners)) {
      finalGenres = overrides.geners;
    }
  } else {
    finalGenres = await translateGenres(details.genres || []);
  }

  // aplicar nombre/rating/slug overrides
  const finalName = overrides.name && overrides.name.length ? overrides.name : details.name;
  const finalSlug = overrides.slug && overrides.slug.length ? overrides.slug : slugify(details.slug || details.name);
  const finalRating = typeof overrides.rating === 'number' ? overrides.rating : Number(details.rating ?? 0);
  const finalSize = overrides.size && overrides.size.length ? overrides.size : details.size || '0 GB';
  const finalPrice = typeof overrides.price === 'number'
    ? overrides.price
    : getPriceFromSize(finalSize);

  const gameEntry = {
    name: finalName,
    name_slug: finalSlug,
    img: uploadedImageUrl,
    description_rawg: finalDescription,
    geners: finalGenres,
    rating: Number(finalRating),
    size: finalSize,
    price: finalPrice,
  };

  const games = readGamesFile();
  verifyDuplicate(games, gameEntry);
  games.push(gameEntry);
  saveGamesFile(games);

  return gameEntry;
}

async function addGameByName(name) {
  if (!name) {
    throw new Error('El nombre del juego es obligatorio.');
  }

  const results = await rawgSearch(name);
  const best = pickBestMatch(name, results);
  if (!best) {
    throw new Error('No se encontró un juego compatible en RAWG.');
  }

  return addGameByRawgId(best.id);
}

function readGamesFile() {
  const config = getConfig();
  if (!fs.existsSync(config.JSON_FILE)) {
    throw new Error(`No se encontró el archivo JSON en: ${config.JSON_FILE}`);
  }

  const raw = fs.readFileSync(config.JSON_FILE, 'utf8');
  return JSON.parse(raw);
}

function saveGamesFile(games) {
  const config = getConfig();
  fs.writeFileSync(config.JSON_FILE, JSON.stringify(games, null, 2) + '\n', 'utf8');
}

function verifyDuplicate(games, newGame) {
  const duplicate = games.find((item) => {
    return (
      item.name?.toLowerCase() === newGame.name.toLowerCase() ||
      item.name_slug?.toLowerCase() === newGame.name_slug.toLowerCase()
    );
  });

  if (duplicate) {
    throw new Error(`Juego duplicado detectado: ${newGame.name}. Ya existe un registro con el mismo nombre o slug.`);
  }
}

async function downloadImage(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`No se pudo descargar la portada: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function uploadToCloudinary(buffer, fileName, config) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: 'game_catalog',
    transformation: 'q_auto,f_auto,c_scale,w_700',
    timestamp: String(timestamp),
  };

  const signature = createCloudinarySignature(params, config.CLOUDINARY_API_SECRET);
  const formData = new FormData();
  const fileBlob = new Blob([buffer], { type: 'application/octet-stream' });
  formData.append('file', fileBlob, fileName);
  formData.append('api_key', config.CLOUDINARY_API_KEY);
  formData.append('timestamp', params.timestamp);
  formData.append('folder', params.folder);
  formData.append('transformation', params.transformation);
  formData.append('signature', signature);

  const uploadUrl = `https://api.cloudinary.com/v1_1/${config.CLOUDINARY_CLOUD_NAME}/image/upload`;
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

function createCloudinarySignature(params, secret) {
  const keys = Object.keys(params).sort();
  const payload = keys.map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(payload + secret).digest('hex');
}

async function translateText(text, targetLang = 'ES') {
  if (!text) return '';
  const config = getConfig();
  if (config.DEEPL_API_KEY) {
    return translateWithDeepl(text, targetLang, config.DEEPL_API_KEY);
  }
  if (config.GOOGLE_TRANSLATE_API_KEY) {
    return translateWithGoogle(text, targetLang, config.GOOGLE_TRANSLATE_API_KEY);
  }
  return translateWithGoogleWeb(text, targetLang);
}

async function translateWithDeepl(text, targetLang, apiKey) {
  const url = 'https://api-free.deepl.com/v2/translate';
  const formData = new URLSearchParams();
  formData.append('auth_key', apiKey);
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

async function translateWithGoogle(text, targetLang, apiKey) {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
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

module.exports = {
  loadEnv,
  getConfig,
  validateConfig,
  previewGameByName,
  addGameByRawgId,
  addGameByName,
  rawgSearch,
  getPriceFromSize,
};
