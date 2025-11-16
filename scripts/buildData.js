const fs = require('fs');
const path = require('path');
const { parseLeaderboardsFromHTML } = require('./extractLeaderboards');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const OUTPUT_PATH = path.join(ROOT, 'data', 'enrichedLeaderboards.json');

const ALL_ORIGINS_ENDPOINT = 'https://api.allorigins.win/raw?url=';
const MAX_FETCH_ATTEMPTS = 3;
const FETCH_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 10000;

function readHtml() {
  return fs.readFileSync(HTML_PATH, 'utf8');
}

function ensureDataDir() {
  const dataDir = path.join(ROOT, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getLastPathSegment(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.at(-1) ?? null;
  } catch (error) {
    return null;
  }
}

function buildGeoImage(pathFragment, { width = 256, height = 256, gravity = 'ce' } = {}) {
  if (!pathFragment) {
    return null;
  }
  return `https://www.geoguessr.com/images/resize:auto:${width}:${height}/gravity:${gravity}/plain/${pathFragment}`;
}

function relativeGeoUrl(relativePath) {
  if (!relativePath) {
    return null;
  }
  return `https://www.geoguessr.com${relativePath}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performFetch(url, options = {}) {
  const { timeout = FETCH_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchNextData(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        await delay(FETCH_DELAY_MS * attempt);
      }

      const response = await performFetch(`${ALL_ORIGINS_ENDPOINT}${encodeURIComponent(url)}`);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const html = await response.text();
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match) {
        throw new Error('Missing __NEXT_DATA__ payload');
      }

      return JSON.parse(match[1]);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to fetch ${url}: ${lastError?.message ?? 'Unknown error'}`);
}

function collectReferences(groups) {
  const mapSet = new Set();
  const playerSet = new Set();

  for (const group of groups) {
    for (const card of group.cards) {
      if (card.mapUrl) {
        mapSet.add(card.mapUrl);
      }
      for (const entry of card.entries) {
        if (entry.playerUrl) {
          playerSet.add(entry.playerUrl);
        }
      }
    }
  }

  return {
    mapUrls: [...mapSet],
    playerUrls: [...playerSet],
  };
}

async function prefetchMaps(mapUrls, cache) {
  if (!mapUrls.length) {
    return;
  }

  console.log(`Fetching ${mapUrls.length} unique map profiles...`);
  let index = 0;
  for (const mapUrl of mapUrls) {
    index += 1;
    console.log(`  [map ${index}/${mapUrls.length}] ${mapUrl}`);
    await hydrateMap(mapUrl, cache);
  }
}

async function prefetchPlayers(playerUrls, cache) {
  if (!playerUrls.length) {
    return;
  }

  console.log(`Fetching ${playerUrls.length} unique player profiles...`);
  let index = 0;
  for (const playerUrl of playerUrls) {
    index += 1;
    console.log(`  [player ${index}/${playerUrls.length}] ${playerUrl}`);
    await hydratePlayer(playerUrl, cache);
  }
}

async function hydrateMap(mapUrl, cache) {
  if (!mapUrl) {
    return null;
  }
  if (cache.has(mapUrl)) {
    return cache.get(mapUrl);
  }

  const slug = getLastPathSegment(mapUrl);
  if (!slug) {
    cache.set(mapUrl, null);
    return null;
  }

  try {
    const data = await fetchNextData(`https://www.geoguessr.com/maps/${slug}`);
    const map = data?.props?.pageProps?.map;
    if (!map) {
      cache.set(mapUrl, null);
      return null;
    }

    const creator = map.creator ?? {};
    const transformed = {
      id: map.id,
      slug,
      name: map.name,
      description: map.description ?? null,
      playUrl: relativeGeoUrl(map.playUrl),
      likes: map.likes ?? null,
      plays: map.numFinishedGames ?? null,
      averageScore: map.averageScore ?? null,
      coordinateCount: map.coordinateCount ?? null,
      difficulty: map.difficulty ?? null,
      difficultyLevel: map.difficultyLevel ?? null,
      tags: map.tags ?? [],
      createdAt: map.createdAt ?? null,
      updatedAt: map.updatedAt ?? null,
      heroImage: buildGeoImage(creator.pin?.path ?? null, { width: 512, height: 512 }),
      coverAvatar: buildGeoImage(creator.avatar?.fullBodyPath ?? null, { width: 320, height: 320 }),
      creator: {
        nick: creator.nick ?? null,
        userId: creator.userId ?? null,
        profileUrl: relativeGeoUrl(creator.url),
        countryCode: creator.countryCode ?? null,
        isVerified: creator.isVerified ?? false,
        isProUser: creator.isProUser ?? false,
        avatarImage: buildGeoImage(creator.avatar?.fullBodyPath ?? null, { width: 256, height: 256 }),
        pinImage: buildGeoImage(creator.pin?.path ?? null, { width: 256, height: 256 }),
      },
    };

    cache.set(mapUrl, transformed);
    return transformed;
  } catch (error) {
    console.warn(`[map] ${mapUrl} -> ${error.message}`);
    cache.set(mapUrl, null);
    return null;
  }
}

async function hydratePlayer(playerUrl, cache) {
  if (!playerUrl) {
    return null;
  }
  if (cache.has(playerUrl)) {
    return cache.get(playerUrl);
  }

  const slug = getLastPathSegment(playerUrl);
  if (!slug) {
    cache.set(playerUrl, null);
    return null;
  }

  try {
    const data = await fetchNextData(`https://www.geoguessr.com/user/${slug}`);
    const user = data?.props?.pageProps?.user;
    if (!user) {
      cache.set(playerUrl, null);
      return null;
    }

    const stats = data?.props?.pageProps?.userBasicStats ?? {};
    const progress = user.progress ?? {};

    const transformed = {
      nick: user.nick ?? null,
      userId: user.userId ?? slug,
      url: `https://www.geoguessr.com/user/${slug}`,
      countryCode: user.countryCode ?? null,
      isVerified: user.isVerified ?? false,
      isProUser: user.isProUser ?? false,
      level: progress.level ?? null,
      xp: progress.xp ?? null,
      title: progress.title ?? null,
      gamesPlayed: stats.gamesPlayed ?? null,
      averageGameScore: stats.averageGameScore ?? null,
      maxGameScore: stats.maxGameScore ?? null,
      streakHighlights: (stats.streakRecords ?? []).slice(0, 5),
      avatarImage: buildGeoImage(user.avatar?.fullBodyPath ?? null, { width: 200, height: 200 }),
      pinImage: buildGeoImage(user.pin?.path ?? null, { width: 200, height: 200 }),
    };

    cache.set(playerUrl, transformed);
    return transformed;
  } catch (error) {
    console.warn(`[player] ${playerUrl} -> ${error.message}`);
    cache.set(playerUrl, null);
    return null;
  }
}

async function enrichGroups(groups) {
  const mapCache = new Map();
  const playerCache = new Map();

  const { mapUrls, playerUrls } = collectReferences(groups);

  await prefetchMaps(mapUrls, mapCache);
  await prefetchPlayers(playerUrls, playerCache);

  for (const group of groups) {
    for (const card of group.cards) {
      card.map = mapCache.get(card.mapUrl) ?? null;

      for (const entry of card.entries) {
        entry.playerInfo = playerCache.get(entry.playerUrl) ?? null;
      }
    }
  }

  return { groups, stats: { maps: mapCache.size, players: playerCache.size } };
}

async function build() {
  const html = readHtml();
  const groups = parseLeaderboardsFromHTML(html);

  const enriched = await enrichGroups(groups);

  ensureDataDir();
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'https://www.geoguessr.com',
    groups: enriched.groups,
    lookupCounts: enriched.stats,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Generated enriched dataset with ${enriched.stats.maps} maps and ${enriched.stats.players} players → ${path.relative(ROOT, OUTPUT_PATH)}`);
}

if (require.main === module) {
  build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  build,
};

