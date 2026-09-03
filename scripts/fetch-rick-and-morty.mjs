/**
 * Descarga TODOS los recursos de la Rick and Morty API (character, location,
 * episode) recorriendo la paginación, y genera:
 *
 *   db/data/characters.json  — respuesta completa de la API (array de personajes)
 *   db/data/locations.json   — respuesta completa de la API (array de ubicaciones)
 *   db/data/episodes.json    — respuesta completa de la API (array de episodios)
 *   db/seed.sql              — esquema + INSERTs para sembrar un PostgreSQL local
 *
 * Uso: node scripts/fetch-rick-and-morty.mjs
 * Sembrar: psql -U <usuario> -d <base> -f db/seed.sql
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API_URL = 'https://rickandmortyapi.com/api';
const OUT_DIR = new URL('../db/', import.meta.url).pathname;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    // La API limita peticiones (429): reintenta esperando lo que indique el servidor.
    if (response.status !== 429 || attempt > 8) {
      throw new Error(`Error ${response.status} al pedir ${url}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt);
  }
}

async function fetchAllPages(resource) {
  let url = `${API_URL}/${resource}`;
  const results = [];
  while (url) {
    const page = await fetchJson(url);
    results.push(...page.results);
    url = page.info.next;
    console.log(`${resource}: ${results.length}/${page.info.count}`);
  }
  return results;
}

const idFromUrl = (url) => {
  const id = Number(url.split('/').pop());
  return Number.isFinite(id) && id > 0 ? id : null;
};

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

const idsFromUrls = (urls) => [...new Set(urls.map(idFromUrl).filter((id) => id !== null))];

function buildSeedSql(characters, locations, episodes) {
  const lines = [
    '-- Seed generado desde https://rickandmortyapi.com/api',
    '-- Regenerar con: node scripts/fetch-rick-and-morty.mjs',
    '',
    'BEGIN;',
    '',
    'DROP TABLE IF EXISTS character_episodes, location_residents, characters, episodes, locations CASCADE;',
    '',
    'CREATE TABLE locations (',
    '  id integer PRIMARY KEY,',
    '  name text NOT NULL,',
    '  type text NOT NULL,',
    "  dimension text NOT NULL DEFAULT ''",
    ');',
    '',
    'CREATE TABLE characters (',
    '  id integer PRIMARY KEY,',
    '  name text NOT NULL,',
    '  status text NOT NULL,',
    '  species text NOT NULL,',
    "  type text NOT NULL DEFAULT '',",
    '  gender text NOT NULL,',
    '  origin_id integer REFERENCES locations (id) ON DELETE SET NULL,',
    '  location_id integer REFERENCES locations (id) ON DELETE SET NULL,',
    '  image text NOT NULL',
    ');',
    '',
    'CREATE TABLE episodes (',
    '  id integer PRIMARY KEY,',
    '  name text NOT NULL,',
    '  air_date text NOT NULL,',
    '  episode text NOT NULL',
    ');',
    '',
    '-- Relaciones N:M resueltas con tablas puente.',
    'CREATE TABLE location_residents (',
    '  location_id integer NOT NULL REFERENCES locations (id) ON DELETE CASCADE,',
    '  character_id integer NOT NULL REFERENCES characters (id) ON DELETE CASCADE,',
    '  PRIMARY KEY (location_id, character_id)',
    ');',
    '',
    'CREATE TABLE character_episodes (',
    '  character_id integer NOT NULL REFERENCES characters (id) ON DELETE CASCADE,',
    '  episode_id integer NOT NULL REFERENCES episodes (id) ON DELETE CASCADE,',
    '  PRIMARY KEY (character_id, episode_id)',
    ');',
    '',
  ];

  for (const location of locations) {
    lines.push(
      'INSERT INTO locations (id, name, type, dimension) VALUES (' +
        [
          location.id,
          sqlString(location.name),
          sqlString(location.type),
          sqlString(location.dimension),
        ].join(', ') +
        ');',
    );
  }

  for (const character of characters) {
    lines.push(
      'INSERT INTO characters (id, name, status, species, type, gender, origin_id, location_id, image) VALUES (' +
        [
          character.id,
          sqlString(character.name),
          sqlString(character.status),
          sqlString(character.species),
          sqlString(character.type),
          sqlString(character.gender),
          idFromUrl(character.origin.url) ?? 'NULL',
          idFromUrl(character.location.url) ?? 'NULL',
          sqlString(character.image),
        ].join(', ') +
        ');',
    );
  }

  for (const episode of episodes) {
    lines.push(
      'INSERT INTO episodes (id, name, air_date, episode) VALUES (' +
        [
          episode.id,
          sqlString(episode.name),
          sqlString(episode.air_date),
          sqlString(episode.episode),
        ].join(', ') +
        ');',
    );
  }

  const residentPairs = locations.flatMap((location) =>
    idsFromUrls(location.residents).map((characterId) => [location.id, characterId]),
  );
  const episodePairs = characters.flatMap((character) =>
    idsFromUrls(character.episode).map((episodeId) => [character.id, episodeId]),
  );

  const pushBatchInsert = (table, columns, pairs) => {
    for (let i = 0; i < pairs.length; i += 500) {
      const values = pairs
        .slice(i, i + 500)
        .map((pair) => `(${pair.join(', ')})`)
        .join(',\n  ');
      lines.push(`INSERT INTO ${table} (${columns}) VALUES\n  ${values};`);
    }
  };

  pushBatchInsert('location_residents', 'location_id, character_id', residentPairs);
  pushBatchInsert('character_episodes', 'character_id, episode_id', episodePairs);

  lines.push('', 'COMMIT;', '');
  return lines.join('\n');
}

// Si ya existen los JSON de una descarga anterior, se reutilizan y no se
// vuelve a llamar a la API.
async function loadResource(resource, filename) {
  const path = join(OUT_DIR, 'data', filename);
  if (existsSync(path)) {
    console.log(`${resource}: usando caché ${path}`);
    return JSON.parse(await readFile(path, 'utf8'));
  }
  // Secuencial para no saturar el límite de peticiones de la API.
  return fetchAllPages(resource);
}

const characters = await loadResource('character', 'characters.json');
const locations = await loadResource('location', 'locations.json');
const episodes = await loadResource('episode', 'episodes.json');

await mkdir(join(OUT_DIR, 'data'), { recursive: true });
await writeFile(join(OUT_DIR, 'data', 'characters.json'), JSON.stringify(characters, null, 2));
await writeFile(join(OUT_DIR, 'data', 'locations.json'), JSON.stringify(locations, null, 2));
await writeFile(join(OUT_DIR, 'data', 'episodes.json'), JSON.stringify(episodes, null, 2));
await writeFile(join(OUT_DIR, 'seed.sql'), buildSeedSql(characters, locations, episodes));

console.log(
  `\nListo: ${characters.length} personajes, ${locations.length} ubicaciones, ${episodes.length} episodios.`,
);
console.log(
  'Archivos en db/: seed.sql, data/characters.json, data/locations.json, data/episodes.json',
);
