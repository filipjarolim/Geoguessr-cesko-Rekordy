# Test výsledky - GeoGuessr API

## Testované URL
- Game URL: `https://www.geoguessr.com/game/TGxYAZhOGxOvuHgb`
- Result URL: `https://www.geoguessr.com/results/TGxYAZhOGxOvuHgb` (404 - neexistuje)

## Výsledky testů

### 1. Game HTML (`test-game-html-full.html`)
- **Status**: ✅ Načteno
- **pageProps**: Obsahuje pouze `_sentryTraceData` a `_sentryBaggage`
- **Player data**: ❌ Nenalezeno žádné player data v HTML ani JSON

### 2. Result HTML (`test-result-html-output.html`)
- **Status**: ❌ 404 - "This game does not exist"
- **Player data**: ❌ Nenalezeno

### 3. API Endpointy

#### `/api/v3/games/{gameId}`
- **Status**: 401 (Unauthorized - vyžaduje autentizaci)

#### `/api/v3/results/{gameId}`
- **Status**: 404 (Not Found)

#### `/api/v3/scores/{gameId}`
- **Status**: ✅ 200
- **Data**: `{"all": [], "friends": []}` - prázdné pole

#### Ostatní endpointy
- Všechny vrací 404 nebo 401

## Závěr

**Problém**: Game URL `TGxYAZhOGxOvuHgb` neobsahuje žádná player data v:
- HTML stránce (`__NEXT_DATA__`)
- Result API (404)
- Game API (401 - vyžaduje autentizaci)
- Scores API (prázdné pole)

**Možné řešení**:
1. Použít jiný game URL, který obsahuje player data
2. Použít autentizaci pro `/api/v3/games/{gameId}` endpoint
3. Použít jiný přístup - možná extrahovat z input textu, který uživatel zadá

## Vygenerované soubory

- `test-game-json-full.json` - Kompletní JSON z game stránky
- `test-game-html-full.html` - Kompletní HTML z game stránky
- `test-result-full-output.json` - JSON z result stránky (404)
- `test-result-html-output.html` - HTML z result stránky (404)
- `test-api-scores-TGxYAZhOGxOvuHgb.json` - Scores API response (prázdné)
- `test-all-approaches-summary.json` - Souhrn všech testů

## Doporučení

Zkuste použít **platný game URL**, který obsahuje player data, nebo použít **input text** od uživatele ve formátu:
```
https://www.geoguessr.com/game/XXXXX Username Score Mode
```

