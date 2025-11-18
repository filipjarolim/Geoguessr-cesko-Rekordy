#!/usr/bin/env node
/**
 * Server-side script to enrich data and fetch images as base64
 * This bypasses CORS restrictions by running on Node.js server
 * 
 * Usage: node scripts/fetchImagesToBase64.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { JSDOM } = require('jsdom');

// Load enrichedLeaderboards.json
const ROOT = path.join(__dirname, '..');
const enrichedPath = path.join(ROOT, 'data/enrichedLeaderboards.json');
const HTML_PATH = path.join(ROOT, 'index.html');
let enrichedData;

try {
    const content = fs.readFileSync(enrichedPath, 'utf8');
    enrichedData = JSON.parse(content);
    console.log('✅ Loaded enrichedLeaderboards.json');
} catch (e) {
    console.error('❌ Failed to load enrichedLeaderboards.json:', e.message);
    process.exit(1);
}

// Helper functions from buildData.js
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

// Fetch HTML/data from GeoGuessr
function fetchNextData(url) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/json',
            },
            timeout: 30000
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    // Try to parse as JSON first
                    try {
                        const json = JSON.parse(data);
                        resolve(json);
                        return;
                    } catch (e) {
                        // Not JSON, parse as HTML
                    }

                    // Parse HTML and extract __NEXT_DATA__ using regex (more reliable than JSDOM)
                    const match = data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                    if (match && match[1]) {
                        try {
                            const json = JSON.parse(match[1]);
                            resolve(json);
                        } catch (e) {
                            reject(new Error(`Failed to parse __NEXT_DATA__: ${e.message}`));
                        }
                    } else {
                        // Try JSDOM as fallback
                        try {
                            const dom = new JSDOM(data);
                            const scriptTag = dom.window.document.querySelector('script#__NEXT_DATA__');
                            if (scriptTag) {
                                const json = JSON.parse(scriptTag.textContent);
                                resolve(json);
                            } else {
                                reject(new Error('No __NEXT_DATA__ found in HTML'));
                            }
                        } catch (e) {
                            reject(new Error(`Failed to parse HTML: ${e.message}`));
                        }
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Fetch image and convert to base64
function fetchImageAsBase64(imageUrl) {
    return new Promise((resolve, reject) => {
        if (!imageUrl) {
            resolve(null);
            return;
        }

        // If already base64, return as-is
        if (imageUrl.startsWith('data:')) {
            resolve(imageUrl);
            return;
        }

        const url = new URL(imageUrl);
        const client = url.protocol === 'https:' ? https : http;

        console.log(`  🖼️ Fetching: ${imageUrl.substring(0, 60)}...`);

        const req = client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*',
            },
            timeout: 30000
        }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    const base64 = `data:${res.headers['content-type'] || 'image/png'};base64,${buffer.toString('base64')}`;
                    console.log(`  ✅ Converted to base64 (${Math.round(buffer.length / 1024)}KB)`);
                    resolve(base64);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            console.warn(`  ⚠️ Failed: ${e.message}`);
            reject(e);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Hydrate map data
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
        console.log(`  📍 Fetching map: ${slug}`);
        const data = await fetchNextData(`https://www.geoguessr.com/maps/${slug}`);
        await delay(2000); // 2s delay between requests
        
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

        // Convert images to base64
        if (transformed.heroImage) {
            try {
                transformed.heroImage = await fetchImageAsBase64(transformed.heroImage);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert heroImage: ${e.message}`);
            }
        }
        if (transformed.coverAvatar) {
            try {
                transformed.coverAvatar = await fetchImageAsBase64(transformed.coverAvatar);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert coverAvatar: ${e.message}`);
            }
        }
        if (transformed.creator.avatarImage) {
            try {
                transformed.creator.avatarImage = await fetchImageAsBase64(transformed.creator.avatarImage);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert creator avatarImage: ${e.message}`);
            }
        }
        if (transformed.creator.pinImage) {
            try {
                transformed.creator.pinImage = await fetchImageAsBase64(transformed.creator.pinImage);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert creator pinImage: ${e.message}`);
            }
        }

        cache.set(mapUrl, transformed);
        return transformed;
    } catch (error) {
        console.warn(`  ⚠️ Failed to fetch map ${mapUrl}: ${error.message}`);
        cache.set(mapUrl, null);
        return null;
    }
}

// Hydrate player data
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
        console.log(`  👤 Fetching player: ${slug}`);
        const data = await fetchNextData(`https://www.geoguessr.com/user/${slug}`);
        await delay(2000); // 2s delay between requests
        
        // Debug: log structure of data
        if (!data || !data.props) {
            console.warn(`  ⚠️ No props found in response for ${slug}`);
            console.warn(`  Data keys: ${data ? Object.keys(data).join(', ') : 'null'}`);
            cache.set(playerUrl, null);
            return null;
        }
        
        if (!data.props.pageProps) {
            console.warn(`  ⚠️ No pageProps found in response for ${slug}`);
            console.warn(`  Props keys: ${Object.keys(data.props).join(', ')}`);
            cache.set(playerUrl, null);
            return null;
        }
        
        // Try userProfile.user first (newer API), then userProfile, then user (older API)
        const userProfile = data.props.pageProps.userProfile;
        const user = userProfile?.user ?? userProfile ?? data.props.pageProps.user;
        if (!user) {
            console.warn(`  ⚠️ No user data found in response for ${slug}`);
            console.warn(`  pageProps keys: ${Object.keys(data.props.pageProps).join(', ')}`);
            if (userProfile) console.warn(`  userProfile keys: ${Object.keys(userProfile).join(', ')}`);
            cache.set(playerUrl, null);
            return null;
        }

        const stats = data?.props?.pageProps?.userBasicStats ?? {};
        const progress = user.progress ?? {};

        // Extract avatar and pin paths - check multiple possible locations
        const avatarPath = user.avatar?.fullBodyPath ?? 
                          user.avatarImageUrl ?? 
                          user.avatar?.path ?? 
                          user.avatarImage ?? 
                          null;
        const pinPath = user.pin?.path ?? 
                       user.pinImageUrl ?? 
                       user.pinImage ?? 
                       null;

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
            avatarImage: buildGeoImage(avatarPath, { width: 200, height: 200 }),
            pinImage: buildGeoImage(pinPath, { width: 200, height: 200 }),
        };

        // Convert images to base64
        if (transformed.avatarImage) {
            try {
                transformed.avatarImage = await fetchImageAsBase64(transformed.avatarImage);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert player avatarImage: ${e.message}`);
            }
        }
        if (transformed.pinImage) {
            try {
                transformed.pinImage = await fetchImageAsBase64(transformed.pinImage);
                await delay(1000);
            } catch (e) {
                console.warn(`  ⚠️ Failed to convert player pinImage: ${e.message}`);
            }
        }

        cache.set(playerUrl, transformed);
        return transformed;
    } catch (error) {
        console.warn(`  ⚠️ Failed to fetch player ${playerUrl}: ${error.message}`);
        cache.set(playerUrl, null);
        return null;
    }
}

// Collect all map and player URLs from groups
function collectReferences(groups) {
    const mapUrls = new Set();
    const playerUrls = new Set();

    for (const group of groups) {
        for (const card of group.cards) {
            if (card.mapUrl) {
                mapUrls.add(card.mapUrl);
            }
            for (const entry of card.entries) {
                if (entry.playerUrl) {
                    playerUrls.add(entry.playerUrl);
                }
            }
        }
    }

    return { mapUrls: Array.from(mapUrls), playerUrls: Array.from(playerUrls) };
}

// Enrich groups with map and player data
async function enrichGroups(groups) {
    const mapCache = new Map();
    const playerCache = new Map();

    const { mapUrls, playerUrls } = collectReferences(groups);

    console.log(`\n📊 Found ${mapUrls.length} unique maps and ${playerUrls.length} unique players`);

    // Check which maps/players need enrichment
    const missingMaps = mapUrls.filter(url => {
        for (const group of groups) {
            for (const card of group.cards) {
                if (card.mapUrl === url && card.map) {
                    return false; // Already enriched
                }
            }
        }
        return true; // Missing
    });

    const missingPlayers = playerUrls.filter(url => {
        for (const group of groups) {
            for (const card of group.cards) {
                for (const entry of card.entries) {
                    if (entry.playerUrl === url) {
                        // Check if playerInfo exists and has actual data (not just null)
                        if (entry.playerInfo && entry.playerInfo !== null && entry.playerInfo.nick) {
                            return false; // Already enriched with actual data
                        }
                    }
                }
            }
        }
        return true; // Missing or null
    });

    if (missingMaps.length > 0 || missingPlayers.length > 0) {
        console.log('🔄 Enriching missing data...\n');
        console.log(`   Missing maps: ${missingMaps.length}`);
        console.log(`   Missing players: ${missingPlayers.length}\n`);
        
        // Fetch missing maps
        if (missingMaps.length > 0) {
            console.log(`📍 Fetching ${missingMaps.length} maps...`);
            for (let i = 0; i < missingMaps.length; i++) {
                const mapUrl = missingMaps[i];
                await hydrateMap(mapUrl, mapCache);
            }
        }

        // Fetch missing players
        if (missingPlayers.length > 0) {
            console.log(`\n👤 Fetching ${missingPlayers.length} players...`);
            for (let i = 0; i < missingPlayers.length; i++) {
                const playerUrl = missingPlayers[i];
                const playerData = await hydratePlayer(playerUrl, playerCache);
                if (playerData) {
                    console.log(`  ✅ Loaded player: ${playerData.nick || playerData.userId} (${playerUrl})`);
                } else {
                    console.log(`  ⚠️ Failed to load player: ${playerUrl}`);
                }
            }
            console.log(`\n📦 Player cache size: ${playerCache.size}`);
            console.log(`📦 Player cache keys: ${Array.from(playerCache.keys()).slice(0, 3).join(', ')}...`);
        }
    } else {
        console.log('✅ All maps and players already enriched\n');
    }

    // Attach enriched data to cards
    let attachedCount = 0;
    for (const group of groups) {
        for (const card of group.cards) {
            if (card.mapUrl) {
                if (!card.map) {
                    card.map = mapCache.get(card.mapUrl) ?? null;
                }
            }

            for (const entry of card.entries) {
                if (entry.playerUrl) {
                    // Always try to get from cache, even if entry already has playerInfo
                    // This ensures we update missing playerInfo
                    const cachedPlayerInfo = playerCache.get(entry.playerUrl);
                    if (cachedPlayerInfo) {
                        entry.playerInfo = cachedPlayerInfo;
                        attachedCount++;
                    } else if (!entry.playerInfo) {
                        // Check if playerUrl exists in cache with different format
                        const cacheKeys = Array.from(playerCache.keys());
                        const matchingKey = cacheKeys.find(key => key === entry.playerUrl || key.includes(entry.playerUrl) || entry.playerUrl.includes(key));
                        if (matchingKey) {
                            entry.playerInfo = playerCache.get(matchingKey);
                            attachedCount++;
                            console.log(`  🔗 Matched player by URL pattern: ${entry.playerUrl} -> ${matchingKey}`);
                        } else {
                            entry.playerInfo = null;
                        }
                    }
                }
            }
        }
    }
    console.log(`\n📎 Attached ${attachedCount} playerInfo objects to entries`);

    return { groups, stats: { maps: mapCache.size, players: playerCache.size } };
}

// Convert existing images to base64 (if enrichment already happened)
async function convertExistingImages() {
    let convertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const group of enrichedData.groups || []) {
        for (const card of group.cards || []) {
            if (card.map) {
                // Convert map images
                if (card.map.heroImage && !card.map.heroImage.startsWith('data:')) {
                    try {
                        card.map.heroImage = await fetchImageAsBase64(card.map.heroImage);
                        if (card.map.heroImage) convertedCount++;
                        await delay(1000);
                    } catch (e) {
                        console.warn(`  ⚠️ Failed to convert heroImage: ${e.message}`);
                        errorCount++;
                    }
                } else if (card.map.heroImage?.startsWith('data:')) {
                    skippedCount++;
                }

                if (card.map.coverAvatar && !card.map.coverAvatar.startsWith('data:')) {
                    try {
                        card.map.coverAvatar = await fetchImageAsBase64(card.map.coverAvatar);
                        if (card.map.coverAvatar) convertedCount++;
                        await delay(1000);
                    } catch (e) {
                        console.warn(`  ⚠️ Failed to convert coverAvatar: ${e.message}`);
                        errorCount++;
                    }
                } else if (card.map.coverAvatar?.startsWith('data:')) {
                    skippedCount++;
                }

                if (card.map.creator) {
                    if (card.map.creator.avatarImage && !card.map.creator.avatarImage.startsWith('data:')) {
                        try {
                            card.map.creator.avatarImage = await fetchImageAsBase64(card.map.creator.avatarImage);
                            if (card.map.creator.avatarImage) convertedCount++;
                            await delay(1000);
                        } catch (e) {
                            console.warn(`  ⚠️ Failed to convert creator avatarImage: ${e.message}`);
                            errorCount++;
                        }
                    } else if (card.map.creator.avatarImage?.startsWith('data:')) {
                        skippedCount++;
                    }

                    if (card.map.creator.pinImage && !card.map.creator.pinImage.startsWith('data:')) {
                        try {
                            card.map.creator.pinImage = await fetchImageAsBase64(card.map.creator.pinImage);
                            if (card.map.creator.pinImage) convertedCount++;
                            await delay(1000);
                        } catch (e) {
                            console.warn(`  ⚠️ Failed to convert creator pinImage: ${e.message}`);
                            errorCount++;
                        }
                    } else if (card.map.creator.pinImage?.startsWith('data:')) {
                        skippedCount++;
                    }
                }
            }

            // Convert player images
            for (const entry of card.entries || []) {
                if (entry.playerInfo) {
                    if (entry.playerInfo.avatarImage && !entry.playerInfo.avatarImage.startsWith('data:')) {
                        try {
                            entry.playerInfo.avatarImage = await fetchImageAsBase64(entry.playerInfo.avatarImage);
                            if (entry.playerInfo.avatarImage) convertedCount++;
                            await delay(1000);
                        } catch (e) {
                            console.warn(`  ⚠️ Failed to convert player avatarImage: ${e.message}`);
                            errorCount++;
                        }
                    } else if (entry.playerInfo.avatarImage?.startsWith('data:')) {
                        skippedCount++;
                    }

                    if (entry.playerInfo.pinImage && !entry.playerInfo.pinImage.startsWith('data:')) {
                        try {
                            entry.playerInfo.pinImage = await fetchImageAsBase64(entry.playerInfo.pinImage);
                            if (entry.playerInfo.pinImage) convertedCount++;
                            await delay(1000);
                        } catch (e) {
                            console.warn(`  ⚠️ Failed to convert player pinImage: ${e.message}`);
                            errorCount++;
                        }
                    } else if (entry.playerInfo.pinImage?.startsWith('data:')) {
                        skippedCount++;
                    }
                }
            }
        }
    }

    return { convertedCount, skippedCount, errorCount };
}

// Main execution
(async () => {
    console.log('🚀 Starting enrichment and image conversion...\n');
    
    // First, enrich groups if needed
    const enriched = await enrichGroups(enrichedData.groups);
    enrichedData.groups = enriched.groups;
    
    // Then convert any remaining images
    console.log('\n🖼️ Converting remaining images to base64...\n');
    const stats = await convertExistingImages();
    
    console.log(`\n✅ Process complete!`);
    console.log(`   Maps enriched: ${enriched.stats.maps}`);
    console.log(`   Players enriched: ${enriched.stats.players}`);
    console.log(`   Images converted: ${stats.convertedCount}`);
    console.log(`   Images skipped (already base64): ${stats.skippedCount}`);
    console.log(`   Errors: ${stats.errorCount}`);
    
    // Update generatedAt timestamp
    enrichedData.generatedAt = new Date().toISOString();
    
    // Save updated data
    fs.writeFileSync(enrichedPath, JSON.stringify(enrichedData, null, 2), 'utf8');
    console.log(`\n✅ Saved updated enrichedLeaderboards.json`);
})();
