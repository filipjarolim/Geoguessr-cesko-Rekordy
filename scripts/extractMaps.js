const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENRICHED_PATH = path.join(ROOT, 'data', 'enrichedLeaderboards.json');
const MAPS_OUTPUT_PATH = path.join(ROOT, 'data', 'maps.json');

function extractMaps() {
  console.log('📖 Reading enrichedLeaderboards.json...');
  const enrichedData = JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf8'));
  
  const mapsMap = new Map(); // Use Map to avoid duplicates by mapUrl
  
  // Extract all unique maps from groups
  (enrichedData.groups || []).forEach(group => {
    (group.cards || []).forEach(card => {
      if(card.mapUrl && card.map) {
        const mapUrl = card.mapUrl;
        
        // Only add if not already added (use mapUrl as unique key)
        if(!mapsMap.has(mapUrl)) {
          const mapData = {
            url: mapUrl,
            id: card.map.id || null,
            slug: card.map.slug || null,
            name: card.map.name || card.title || null,
            description: card.map.description || null,
            difficulty: card.map.difficulty || null,
            coordinateCount: card.map.coordinateCount || null,
            plays: card.map.plays || null,
            likes: card.map.likes || null,
            averageScore: card.map.averageScore || null,
            heroImage: card.map.heroImage || null, // Base64 image
            coverAvatar: card.map.coverAvatar || null, // Base64 image
            creator: card.map.creator ? {
              nick: card.map.creator.nick || null,
              profileUrl: card.map.creator.profileUrl || null,
              avatarImage: card.map.creator.avatarImage || null // Base64 image
            } : null,
            tags: card.map.tags || [],
            createdAt: card.map.createdAt || null,
            updatedAt: card.map.updatedAt || null
          };
          
          mapsMap.set(mapUrl, mapData);
        }
      }
    });
  });
  
  const maps = Array.from(mapsMap.values());
  
  console.log(`✅ Extracted ${maps.length} unique maps`);
  
  // Sort by name
  maps.sort((a, b) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  
  // Write to file
  const output = {
    maps: maps,
    generatedAt: new Date().toISOString(),
    totalMaps: maps.length
  };
  
  fs.writeFileSync(MAPS_OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Saved to ${path.relative(ROOT, MAPS_OUTPUT_PATH)}`);
  
  return maps;
}

if (require.main === module) {
  try {
    extractMaps();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

module.exports = { extractMaps };

