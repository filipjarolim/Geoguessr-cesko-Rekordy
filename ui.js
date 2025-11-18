(function(){
    const CACHE_KEY = 'gg_enriched_cache_v1';
    const CACHE_TIME_KEY = 'gg_enriched_cache_time_v1';
    const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes
    function el(tag, attrs = {}, children = []){
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k,v])=>{
            if(k === 'class') node.className = v;
            else if(k === 'style') Object.assign(node.style, v);
            else if(k.startsWith('on') && typeof v === 'function') node[k] = v;
            else node.setAttribute(k, v);
        });
        const append = (c)=>{
            if (c == null || c === false) return;
            if (typeof c === 'string' || typeof c === 'number') {
                node.appendChild(document.createTextNode(String(c)));
            } else if (c && typeof c === 'object' && 'nodeType' in c) {
                node.appendChild(c);
            }
        };
        if(typeof children === 'string' || typeof children === 'number') append(children);
        else if (Array.isArray(children)) children.forEach(append);
        return node;
    }

    function bgImageStyle(url){
        if(!url) return {};
        // Handle both regular URLs and base64 data URLs
        // Base64 URLs are safe to use directly, regular URLs need escaping
        const safeUrl = url.startsWith('data:') ? url : url.replace(/'/g, "\\'");
        return { 
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 65%), url('${safeUrl}')`, 
            backgroundSize: 'cover', 
            backgroundPosition: 'center' 
        };
    }

    function renderEntry(entry, entryIndex){
        const avatar = entry.playerInfo?.avatarImage || entry.playerInfo?.pinImage || null;
        const avatarImg = avatar ? el('img', { 
            class: 'gg-entry-avatar', 
            src: avatar, 
            alt: '',
            loading: 'lazy',
            onerror: function(){
                // If image fails to load, hide it
                this.style.display = 'none';
                if(this.parentElement) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'gg-entry-avatar-placeholder';
                    this.parentElement.replaceChild(placeholder, this);
                }
            }
        }) : el('div', { class: 'gg-entry-avatar-placeholder' });
        const rank = entry.rank || '';
        const rankNum = parseInt(rank.trim().replace('.', ''));
        const isTopThree = !isNaN(rankNum) && rankNum >= 1 && rankNum <= 3;
        const li = el('li', { class: 'gg-entry' }, [
            el('div', { class: 'gg-entry-rank' + (isTopThree ? ' top-three' : '') }, [rank]),
            avatarImg,
            el('div', { class: 'gg-entry-player' }, [
                el('span', {}, [ entry.player || '-' ])
            ]),
            el('div', { class: 'gg-entry-score' }, [
                entry.resultUrl ? el('a', { href: entry.resultUrl, target: '_blank', rel: 'noopener noreferrer', class: 'gg-entry-score-link' }, [ entry.resultLabel || '' ]) : (entry.resultLabel || '')
            ])
        ]);
        li.dataset.entryIndex = String(entryIndex);
        
        // Make entire entry clickable to show player popup
        if(entry.playerUrl && entry.playerUrl !== '#'){
            li.style.cursor = 'pointer';
            li.setAttribute('role', 'button');
            li.setAttribute('tabindex', '0');
            li.setAttribute('aria-label', `Zobrazit profil hráče ${entry.player || 'neznámý'}`);
            li.addEventListener('click', (e) => {
                // Don't navigate if clicking on the score link
                if(e.target.closest('.gg-entry-score-link')) return;
                showPlayerPopup(entry);
            });
            // Keyboard navigation
            li.addEventListener('keydown', (e) => {
                if(e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if(!e.target.closest('.gg-entry-score-link')) {
                        showPlayerPopup(entry);
                    }
                }
            });
        }
        
        return li;
    }

    function themeClass(theme){
        switch(theme){
            case 'primary': return 'gg-card--primary';
            case 'secondary': return 'gg-card--secondary';
            default: return 'gg-card--tertiary';
        }
    }

    function detectVariant(card){
        const t = (card.title || '').toLowerCase();
        if (t.includes('nmpz')) return 'NMPZ';
        if (t.includes('nm') || t.includes('no move')) return 'NM';
        if (t.includes('moving') || t.includes('25k')) return 'MOVING';
        return 'OTHER';
    }

    function groupCardsByMap(cards){
        const clusters = new Map();
        (cards || []).forEach((c, originalIndex)=>{
            const key = c.mapUrl || c.title;
            if(!clusters.has(key)) {
                // Use existing map data if available, otherwise create placeholder
                const mapData = c.map || null;
                clusters.set(key, { 
                    mapUrl: c.mapUrl, 
                    title: mapData?.name || c.title, 
                    map: mapData, 
                    variants: {}, 
                    order: [],
                    originalCardIndices: [], // Store original card indices for admin editing
                    variantToCardIndex: {} // Map variant -> original card index
                });
            }
            const cluster = clusters.get(key);
            const variant = detectVariant(c);
            cluster.variants[variant] = c;
            cluster.order.push(variant);
            // Store original card index for this variant
            if(!cluster.originalCardIndices) cluster.originalCardIndices = [];
            cluster.originalCardIndices.push(originalIndex);
            // Map variant to original card index for reliable lookup
            cluster.variantToCardIndex[variant] = originalIndex;
            // Ensure map data is preserved in cluster
            if(c.map && !cluster.map) {
                cluster.map = c.map;
                cluster.title = c.map.name || cluster.title;
            }
        });
        
        // Calculate total entries for each cluster (across all variants)
        const clustersWithStats = [...clusters.values()].map(cluster => {
            const totalEntries = Object.values(cluster.variants).reduce((sum, card) => {
                return sum + (card?.entries?.length || 0);
            }, 0);
            
            // Also count entries per variant for more detailed sorting
            const variantEntryCounts = {};
            Object.keys(cluster.variants).forEach(variantKey => {
                const card = cluster.variants[variantKey];
                variantEntryCounts[variantKey] = card?.entries?.length || 0;
            });
            
            return {
                ...cluster,
                totalEntries,
                variantEntryCounts,
                isEmpty: totalEntries === 0
            };
        });
        
        // Smart sorting: non-empty first (by entry count desc), empty last
        clustersWithStats.sort((a, b) => {
            // First: separate empty from non-empty
            if(a.isEmpty && !b.isEmpty) return 1;  // a goes to end
            if(!a.isEmpty && b.isEmpty) return -1; // b goes to end
            
            // Both empty or both non-empty - maintain relative order
            if(a.isEmpty && b.isEmpty) {
                // Both empty - sort alphabetically by title
                return (a.title || '').localeCompare(b.title || '', 'cs');
            }
            
            // Both non-empty - sort by total entries (descending)
            if(b.totalEntries !== a.totalEntries) {
                return b.totalEntries - a.totalEntries;
            }
            
            // Same total entries - prefer clusters with more variants
            const aVariantCount = Object.keys(a.variants).length;
            const bVariantCount = Object.keys(b.variants).length;
            if(bVariantCount !== aVariantCount) {
                return bVariantCount - aVariantCount;
            }
            
            // Same variant count - prefer clusters with NMPZ entries (most prestigious)
            const aHasNMPZ = (a.variantEntryCounts.NMPZ || 0) > 0;
            const bHasNMPZ = (b.variantEntryCounts.NMPZ || 0) > 0;
            if(aHasNMPZ && !bHasNMPZ) return -1;
            if(!aHasNMPZ && bHasNMPZ) return 1;
            
            // Final tie-breaker: alphabetical by title
            return (a.title || '').localeCompare(b.title || '', 'cs');
        });
        
        // Return clusters without the extra stats (clean up)
        return clustersWithStats.map(({ totalEntries, variantEntryCounts, isEmpty, ...cluster }) => cluster);
    }

    function renderCard(card, groupId, cardIndex, originalCardIndex){
        const map = card.map || {};
        // Remove heroImage background, keep only creator avatar
        const cover = null;
        const chips = [];
        if(map.difficulty) chips.push(el('span', { class: 'gg-chip' }, [map.difficulty.toLowerCase()]));
        if(map.coordinateCount) chips.push(el('span', { class: 'gg-chip' }, [String(map.coordinateCount) + ' locs']));
        if(typeof map.plays === 'number') chips.push(el('span', { class: 'gg-chip' }, [String(map.plays).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' plays']));
        if(typeof map.likes === 'number') chips.push(el('span', { class: 'gg-chip' }, [String(map.likes).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' likes']));

        const creator = map.creator || {};
        const creatorEl = creator.nick ? el('a', { class: 'gg-creator', href: creator.profileUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [
            creator.avatarImage ? el('img', { 
                class: 'gg-creator-avatar', 
                src: creator.avatarImage, 
                alt: '',
                onerror: function(){ this.style.display = 'none'; }
            }) : null,
            el('span', {}, [creator.nick])
        ]) : null;

        const header = el('div', { class: 'gg-card__media', style: cover ? bgImageStyle(cover) : {} }, [
            el('div', { class: 'gg-card__header' }, [
                el('a', { class: 'gg-card__title', href: card.mapUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ card.title || 'Map' ]),
                el('div', { class: 'gg-chip-row' }, chips)
            ])
        ]);

        const list = el('ul', { class: 'gg-entry-list' }, (card.entries || []).map((e, idx)=> {
            const entryEl = renderEntry(e, idx);
            // Store ALL identifying information for 100% reliable lookup
            entryEl.dataset.mapUrl = card.mapUrl || '';
            const variant = detectVariant(card);
            entryEl.dataset.variant = variant;
            const finalCardIndex = originalCardIndex !== undefined ? originalCardIndex : cardIndex;
            entryEl.dataset.originalCardIndex = String(finalCardIndex);
            entryEl.dataset.cardTitle = card.title || '';
            // Store a unique card identifier: mapUrl + variant
            entryEl.dataset.cardId = `${card.mapUrl || ''}_${variant}`;
            return entryEl;
        }));

        const article = el('article', { class: `gg-card ${themeClass(card.theme)}` }, [ header, list ]);
        article.dataset.groupId = groupId;
        article.dataset.cardIndex = String(originalCardIndex !== undefined ? originalCardIndex : cardIndex);
        article.dataset.mapUrl = card.mapUrl || '';
        return article;
    }

    function renderClusterCard(cluster, groupId, clusterIndex){
        const map = cluster.map || {};
        // Remove heroImage background, keep only creator avatar
        const cover = null;

        const variantKeys = ['MOVING','NM','NMPZ'].filter(k=> cluster.variants[k]);
        const statsChips = [];
        if(typeof map.plays === 'number') statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.plays).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), ' plays']));
        if(typeof map.likes === 'number') statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.likes).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), ' likes']));
        if(map.coordinateCount) statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.coordinateCount), ' locs']));
        if(map.averageScore) statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.averageScore), ' avg score']));

        const header = el('div', { class: 'gg-card__media', style: cover ? bgImageStyle(cover) : {} }, [
            el('div', { class: 'gg-card__header' }, [
                el('a', { class: 'gg-card__title', href: cluster.mapUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ cluster.title || 'Map' ]),
                el('div', { class: 'gg-chip-row' }, statsChips)
            ])
        ]);

        // For streaks section, skip MOVING variant
        let order = ['MOVING','NM','NMPZ'];
        if(groupId === 'streaks'){
            order = ['NM','NMPZ'];
        }

        const cols = el('div', { class: 'gg-variant-cols' });
        const actualVariants = order.filter(k => cluster.variants[k]);
        cols.dataset.variantCount = String(actualVariants.length);
        
        // Get original card indices for this cluster (use first variant's index as primary)
        const originalCardIndices = cluster.originalCardIndices || [];
        const primaryCardIndex = originalCardIndices.length > 0 ? originalCardIndices[0] : clusterIndex;
        
        actualVariants.forEach((key, variantIdx)=>{
            const variantCard = cluster.variants[key];
            const col = el('div', { class: 'gg-variant-col' });
            const variantHeader = el('div', { style: { padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid rgba(255,255,255,0.1)' } });
            variantHeader.appendChild(el('span', { class: 'gg-chip' }, [key]));
            col.appendChild(variantHeader);
            const list = el('ul', { class: 'gg-entry-list' });
            // Get original card index for this variant - CRITICAL: use variantToCardIndex map
            const variantCardIndex = cluster.variantToCardIndex && cluster.variantToCardIndex[key] !== undefined 
                ? cluster.variantToCardIndex[key] 
                : (originalCardIndices[variantIdx] !== undefined ? originalCardIndices[variantIdx] : primaryCardIndex);
            
            // Debug: Log variant mapping (can be removed in production)
            // console.log(`🎯 Cluster card variant "${key}": originalCardIndex=${variantCardIndex}`);
            
            (variantCard?.entries || []).forEach((e, idx)=> {
                const entryEl = renderEntry(e, idx);
                // Store ALL identifying information for 100% reliable lookup
                entryEl.dataset.mapUrl = cluster.mapUrl || '';
                entryEl.dataset.variant = key;
                entryEl.dataset.originalCardIndex = String(variantCardIndex);
                entryEl.dataset.cardTitle = variantCard?.title || '';
                // Store a unique card identifier: mapUrl + variant
                entryEl.dataset.cardId = `${cluster.mapUrl || ''}_${key}`;
                list.appendChild(entryEl);
            });
            col.appendChild(list);
            cols.appendChild(col);
        });

        const article = el('article', { class: `gg-card gg-card--wide ${themeClass('secondary')}` }, [ header, cols ]);
        article.dataset.groupId = groupId;
        // Use primary card index (first variant's original index)
        article.dataset.cardIndex = String(primaryCardIndex);
        return article;
    }

    function renderGroup(container, group){
        const grid = el('div', { class: 'gg-grid' });
        const clusters = groupCardsByMap(group.cards);
        clusters.forEach((cluster, idx)=>{
            const isCluster = Object.keys(cluster.variants).length > 1;
            const originalCardIndices = cluster.originalCardIndices || [];
            const primaryCardIndex = originalCardIndices.length > 0 ? originalCardIndices[0] : idx;
            const node = isCluster 
                ? renderClusterCard(cluster, group.id, idx) 
                : renderCard(cluster.variants[Object.keys(cluster.variants)[0]], group.id, idx, primaryCardIndex);
            grid.appendChild(node);
        });
        container.innerHTML = '';
        container.appendChild(grid);
        // inform admin layer
        try{ document.dispatchEvent(new CustomEvent('gg-rendered', { detail: { groupId: group.id } })); }catch(_){ }

        // reveal animation + ripple
        try{
            const cards = grid.querySelectorAll('.gg-card');
            const io = new IntersectionObserver((entries)=>{
                entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('gg-in'); io.unobserve(e.target); } });
            }, { rootMargin: '0px 0px -10% 0px' });
            cards.forEach(c => io.observe(c));

            // ripple on chips and titles
            grid.querySelectorAll('.gg-chip, .gg-card__title, .gg-entry a, .gg-creator').forEach(el => {
                el.style.position = 'relative';
                el.style.overflow = 'hidden';
                el.addEventListener('pointerdown', (ev)=>{
                    const r = document.createElement('span');
                    r.className = 'gg-ripple';
                    const rect = el.getBoundingClientRect();
                    const size = Math.max(rect.width, rect.height) * 1.2;
                    r.style.width = r.style.height = size + 'px';
                    r.style.left = (ev.clientX - rect.left - size/2) + 'px';
                    r.style.top = (ev.clientY - rect.top - size/2) + 'px';
                    el.appendChild(r);
                    setTimeout(()=>{ r.remove(); }, 650);
                });
            });
        }catch(_){ }
    }

    function renderSkeleton(container){
        const grid = el('div', { class: 'gg-grid' });
        for(let i=0;i<6;i+=1){
            const s = el('article', { class: 'gg-card gg-skeleton' }, [
                el('div', { class: 'gg-card__media', style: { minHeight: '160px' } }),
                el('ul', { class: 'gg-entry-list' }, [ el('li', { class: 'gg-entry gg-skeleton' }, []), el('li', { class: 'gg-entry gg-skeleton' }, []) ])
            ]);
            grid.appendChild(s);
        }
        container.innerHTML=''; container.appendChild(grid);
    }

    function ensureSectionContainer(sectionId){
        const section = document.getElementById(sectionId) || document.querySelector(`#${sectionId}`);
        if(!section){ return null; }
        // Remove legacy static tables so dynamic UI replaces them
        section.querySelectorAll('.leaderboard-red, .leaderboard-blue, .leaderboard-green').forEach((n)=>{ try{ n.remove(); }catch(_){} });
        let placeholder = section.querySelector('.gg-dynamic');
        if(!placeholder){
            placeholder = el('div', { class: 'gg-dynamic' });
            section.appendChild(placeholder);
        }
        return placeholder;
    }

    async function fetchJson(url){
        try {
            const res = await fetch(url);
            if(!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            return await res.json();
        } catch(error) {
            console.error(`Failed to fetch ${url}:`, error);
            throw error;
        }
    }

    function renderError(container, message, retryCallback = null){
        const errorEl = el('div', { class: 'gg-error', style: { 
            padding: 'var(--space-xl)', 
            textAlign: 'center', 
            background: 'rgba(215, 20, 26, 0.1)', 
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(215, 20, 26, 0.3)',
            color: 'var(--cz-white)'
        }}, [
            el('div', { style: { fontSize: '48px', marginBottom: 'var(--space-md)' } }, ['⚠️']),
            el('h3', { style: { fontSize: 'var(--font-lg)', marginBottom: 'var(--space-sm)', fontWeight: 'var(--font-weight-bold)' } }, ['Chyba při načítání dat']),
            el('p', { style: { fontSize: 'var(--font-base)', marginBottom: retryCallback ? 'var(--space-lg)' : '0', opacity: 0.9 } }, [message]),
            retryCallback ? el('button', { 
                class: 'gg-btn-retry',
                onclick: retryCallback,
                style: {
                    padding: 'var(--space-md) var(--space-xl)',
                    background: 'var(--cz-blue)',
                    color: 'var(--cz-white)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-base)',
                    fontWeight: 'var(--font-weight-semibold)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                }
            }, ['🔄 Zkusit znovu']) : null
        ]);
        container.innerHTML = '';
        container.appendChild(errorEl);
    }

    async function hydrate(){
        if (location.protocol === 'file:') {
            try {
                if (!window.__ggFileWarned) {
                    window.__ggFileWarned = true;
                    alert('Open via http:// (not file://) so the JSON can be loaded. For example: python3 -m http.server 8000 then visit http://localhost:8000/');
                }
            } catch(_) {}
            return;
        }
        let data = null;
        const now = Date.now();
        // try cache first
        try{
            const cached = localStorage.getItem(CACHE_KEY);
            const cacheTime = Number(localStorage.getItem(CACHE_TIME_KEY) || '0');
            if(cached && (now - cacheTime) < CACHE_TTL_MS){ data = JSON.parse(cached); }
        }catch(_){ }

        const scoreContainer = document.getElementById('score-time-dynamic') || ensureSectionContainer('score-time');
        const streaksContainer = document.getElementById('streaks-dynamic') || ensureSectionContainer('streaks');
        if(!data){
            if(scoreContainer) renderSkeleton(scoreContainer);
            if(streaksContainer) renderSkeleton(streaksContainer);
        }
        try{
            // Add cache busting with timestamp to ensure fresh data
            // Use multiple cache busters to bypass aggressive caching
            const cacheBuster = Date.now();
            const randomId = Math.random().toString(36).substring(7);
            data = await fetchJson(`data/enrichedLeaderboards.json?cb=${cacheBuster}&t=${cacheBuster}&r=${randomId}&_=${Date.now()}`);
        }catch(_){
            try{ 
                // Fallback to raw leaderboards.json if enriched fails
                const cacheBuster = Date.now();
                const randomId = Math.random().toString(36).substring(7);
                data = await fetchJson(`data/leaderboards.json?cb=${cacheBuster}&t=${cacheBuster}&r=${randomId}&_=${Date.now()}`); 
            }
            catch(__){ 
                console.error('Failed to load both enrichedLeaderboards.json and leaderboards.json');
                // Try to use cached data if available
                if(data) {
                    console.warn('Using cached data as fallback');
                } else {
                    // Show error message to user
                    const errorMessage = 'Nepodařilo se načíst data. Zkontrolujte připojení k internetu a obnovte stránku.';
                    if(scoreContainer) renderError(scoreContainer, errorMessage, () => hydrate());
                    if(streaksContainer) renderError(streaksContainer, errorMessage, () => hydrate());
                    const overallContainer = document.getElementById('overall-dynamic') || ensureSectionContainer('overall-leaderboard');
                    if(overallContainer) renderError(overallContainer, errorMessage, () => hydrate());
                    return; // both failed; show error
                }
            }
        }
        try{ localStorage.setItem(CACHE_KEY, JSON.stringify(data)); localStorage.setItem(CACHE_TIME_KEY, String(now)); }catch(_){ }
        const groups = data.groups || [];
        
        // Debug: Log image data availability
        let totalMaps = 0;
        let totalPlayers = 0;
        let mapsWithImages = 0;
        let playersWithImages = 0;
        for(const group of groups){
            for(const card of group.cards || []){
                if(card.map){
                    totalMaps++;
                    if(card.map.heroImage || card.map.coverAvatar) mapsWithImages++;
                }
                for(const entry of card.entries || []){
                    if(entry.playerInfo){
                        totalPlayers++;
                        if(entry.playerInfo.avatarImage || entry.playerInfo.pinImage) playersWithImages++;
                    }
                }
            }
        }
        // Debug logging (can be removed in production)
        if(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'){
            console.log(`📊 Data loaded: ${totalMaps} maps (${mapsWithImages} with images), ${totalPlayers} players (${playersWithImages} with images)`);
        }
        
        const scoreGroup = groups.find(g => g.id === 'score-time');
        const streaksGroup = groups.find(g => g.id === 'streaks');
        if(scoreGroup && scoreContainer) renderGroup(scoreContainer, scoreGroup);
        if(streaksGroup && streaksContainer) renderGroup(streaksContainer, streaksGroup);
        
        // Overall leaderboard
        const overallContainer = document.getElementById('overall-dynamic') || ensureSectionContainer('overall-leaderboard');
        if(overallContainer) renderOverallLeaderboard(overallContainer, groups);
    }

    function calculateOverallRankings(groups){
        const playerStats = new Map();
        const WEIGHTS = { '1.': 100, '2.': 50, '3.': 25 };
        
        (groups || []).forEach(group => {
            (group.cards || []).forEach(card => {
                (card.entries || []).forEach(entry => {
                    if(!entry.player || entry.player === '-') return;
                    const key = entry.playerUrl || entry.player;
                    if(!playerStats.has(key)){
                        playerStats.set(key, {
                            player: entry.player,
                            playerUrl: entry.playerUrl,
                            playerInfo: entry.playerInfo,
                            first: 0,
                            second: 0,
                            third: 0,
                            score: 0
                        });
                    }
                    const stats = playerStats.get(key);
                    const rank = (entry.rank || '').trim();
                    if(rank === '1.') stats.first += 1;
                    else if(rank === '2.') stats.second += 1;
                    else if(rank === '3.') stats.third += 1;
                    stats.score += WEIGHTS[rank] || 0;
                });
            });
        });

        return [...playerStats.values()].sort((a, b) => {
            if(b.score !== a.score) return b.score - a.score;
            if(b.first !== a.first) return b.first - a.first;
            if(b.second !== a.second) return b.second - a.second;
            return b.third - a.third;
        }).slice(0, 10);
    }

    function calculateModeRankings(groups, modeVariant){
        const playerStats = new Map();
        const WEIGHTS = { '1.': 100, '2.': 50, '3.': 25 };
        
        (groups || []).forEach(group => {
            (group.cards || []).forEach(card => {
                const variant = detectVariant(card);
                if(variant !== modeVariant) return;
                (card.entries || []).forEach(entry => {
                    if(!entry.player || entry.player === '-') return;
                    const key = entry.playerUrl || entry.player;
                    if(!playerStats.has(key)){
                        playerStats.set(key, { player: entry.player, playerUrl: entry.playerUrl, playerInfo: entry.playerInfo, first: 0, second: 0, third: 0, score: 0 });
                    }
                    const stats = playerStats.get(key);
                    const rank = (entry.rank || '').trim();
                    if(rank === '1.') stats.first += 1;
                    else if(rank === '2.') stats.second += 1;
                    else if(rank === '3.') stats.third += 1;
                    stats.score += WEIGHTS[rank] || 0;
                });
            });
        });

        return [...playerStats.values()].sort((a, b) => {
            if(b.score !== a.score) return b.score - a.score;
            if(b.first !== a.first) return b.first - a.first;
            if(b.second !== a.second) return b.second - a.second;
            return b.third - a.third;
        }).slice(0, 3);
    }

    function renderMiniLeaderboard(title, players){
        // Ensure we always show 3 positions, even if some are missing
        // Handle case where players might be undefined, null, or empty array
        const safePlayers = Array.isArray(players) ? players : [];
        const displayPlayers = [];
        
        for(let i = 0; i < 3; i++){
            if(safePlayers[i] && safePlayers[i].player && safePlayers[i].player !== '-'){
                displayPlayers.push(safePlayers[i]);
            } else {
                // Add placeholder for missing position
                displayPlayers.push({ player: '-', playerUrl: null, playerInfo: null });
            }
        }
        
        return el('div', { class: 'mini-leaderboard' }, [
            el('div', { class: 'mini-leaderboard-title' }, [title]),
            el('ul', { class: 'mini-leaderboard-list' }, displayPlayers.map((p, idx) => {
                const avatar = p.playerInfo?.avatarImage || p.playerInfo?.pinImage || null;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                return el('li', { 
                    class: 'mini-leaderboard-entry',
                    role: p.playerUrl ? 'button' : null,
                    tabindex: p.playerUrl ? '0' : null,
                    onclick: () => p.playerUrl && showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo }),
                    onkeydown: (e) => {
                        if((e.key === 'Enter' || e.key === ' ') && p.playerUrl) {
                            e.preventDefault();
                            showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo });
                        }
                    }
                }, [
                    el('div', { class: 'mini-lb-rank' }, [medal]),
                    avatar ? el('img', { class: 'mini-lb-avatar', src: avatar, alt: p.player || '', loading: 'lazy' }) : el('div', { class: 'mini-lb-avatar-placeholder' }),
                    el('span', { class: 'mini-lb-name' }, [ p.player || '-' ])
                ]);
            }))
        ]);
    }

    function renderOverallLeaderboard(container, groups){
        const rankings = calculateOverallRankings(groups);
        const top3 = rankings.slice(0, 3);
        const rest = rankings.slice(3);
        
        // Podium order: 2nd, 1st, 3rd
        const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);
        const podium = el('div', { class: 'podium-wrapper' }, [
            el('div', { class: 'podium-header' }, [
                el('h3', { class: 'podium-header-title' }, ['Top 3 Hráči']),
                el('p', { class: 'podium-header-subtitle' }, ['Celkové pořadí podle medailí'])
            ]),
            el('div', { class: 'podium' }, 
                podiumOrder.map((p, displayIdx) => {
                    const actualRank = displayIdx === 0 ? 2 : displayIdx === 1 ? 1 : 3;
                    const avatar = p?.playerInfo?.avatarImage || p?.playerInfo?.pinImage || null;
                    const medal = actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉';
                    const totalMedals = (p?.first || 0) + (p?.second || 0) + (p?.third || 0);
                    return el('div', { 
                        class: `podium-place podium-place--${actualRank}`,
                        'data-rank': actualRank,
                        role: 'button',
                        tabindex: '0',
                        'aria-label': `${actualRank === 1 ? 'První' : actualRank === 2 ? 'Druhý' : 'Třetí'} místo: ${p?.player || 'Neznámý'}`,
                        onclick: () => p?.playerUrl && showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo }),
                        onkeydown: (e) => {
                            if((e.key === 'Enter' || e.key === ' ') && p?.playerUrl) {
                                e.preventDefault();
                                showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo });
                            }
                        }
                    }, [
                        el('div', { class: 'podium-crown', 'aria-hidden': 'true' }, actualRank === 1 ? '👑' : ''),
                        avatar ? el('img', { class: 'podium-avatar', src: avatar, alt: p?.player || '', loading: 'lazy' }) : el('div', { class: 'podium-avatar-placeholder' }),
                        el('div', { class: 'podium-rank' }, [medal]),
                        el('span', { class: 'podium-name' }, [ p?.player || '-' ]),
                        el('div', { class: 'podium-stats' }, [
                            el('div', { class: 'podium-stat-item' }, [
                                el('span', { class: 'podium-stat-icon' }, ['🥇']),
                                el('span', { class: 'podium-stat-value' }, [String(p?.first || 0)])
                            ]),
                            el('div', { class: 'podium-stat-item' }, [
                                el('span', { class: 'podium-stat-icon' }, ['🥈']),
                                el('span', { class: 'podium-stat-value' }, [String(p?.second || 0)])
                            ]),
                            el('div', { class: 'podium-stat-item' }, [
                                el('span', { class: 'podium-stat-icon' }, ['🥉']),
                                el('span', { class: 'podium-stat-value' }, [String(p?.third || 0)])
                            ])
                        ]),
                        el('div', { class: 'podium-total' }, [
                            el('span', { class: 'podium-total-label' }, ['Celkem']),
                            el('span', { class: 'podium-total-value' }, [String(totalMedals)])
                        ])
                    ]);
                })
            )
        ]);

        const restList = rest.length > 0 ? el('div', { class: 'overall-rest-wrapper' }, [
            el('h3', { class: 'overall-rest-title' }, ['Pořadí 4-10']),
            el('ul', { class: 'gg-entry-list overall-rest-list' }, rest.map((p, idx) => {
                const avatar = p.playerInfo?.avatarImage || p.playerInfo?.pinImage || null;
                const rank = idx + 4;
                const totalMedals = p.first + p.second + p.third;
                return el('li', { 
                    class: 'gg-entry overall-entry',
                    role: 'button',
                    tabindex: '0',
                    'aria-label': `${rank}. místo: ${p.player}`,
                    onclick: () => p.playerUrl && showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo }),
                    onkeydown: (e) => {
                        if((e.key === 'Enter' || e.key === ' ') && p.playerUrl) {
                            e.preventDefault();
                            showPlayerPopup({ player: p.player, playerUrl: p.playerUrl, playerInfo: p.playerInfo });
                        }
                    }
                }, [
                    el('div', { class: 'gg-entry-rank overall-rank' }, [String(rank) + '.']),
                    avatar ? el('img', { class: 'gg-entry-avatar', src: avatar, alt: p.player || '', loading: 'lazy' }) : el('div', { class: 'gg-entry-avatar-placeholder' }),
                    el('div', { class: 'gg-entry-player' }, [
                        el('span', {}, [ p.player ])
                    ]),
                    el('div', { class: 'gg-entry-score overall-score' }, [
                        el('div', { class: 'overall-medals' }, [
                            el('div', { class: 'overall-medal-item' }, [
                                el('span', { class: 'overall-medal-icon' }, ['🥇']),
                                el('span', { class: 'overall-medal-count' }, [String(p.first)])
                            ]),
                            el('div', { class: 'overall-medal-item' }, [
                                el('span', { class: 'overall-medal-icon' }, ['🥈']),
                                el('span', { class: 'overall-medal-count' }, [String(p.second)])
                            ]),
                            el('div', { class: 'overall-medal-item' }, [
                                el('span', { class: 'overall-medal-icon' }, ['🥉']),
                                el('span', { class: 'overall-medal-count' }, [String(p.third)])
                            ])
                        ]),
                        el('div', { class: 'overall-total-badge' }, [
                            el('span', {}, [String(totalMedals)])
                        ])
                    ])
                ]);
            }))
        ]) : null;

        // Mini mode leaderboards
        const movingTop = calculateModeRankings(groups, 'MOVING');
        const nmTop = calculateModeRankings(groups, 'NM');
        const nmpzTop = calculateModeRankings(groups, 'NMPZ');

        const miniBoards = el('div', { class: 'mini-leaderboards-wrapper' }, [
            el('h3', { class: 'mini-leaderboards-title' }, ['Top 3 podle módu']),
            el('div', { class: 'mini-leaderboards' }, [
                renderMiniLeaderboard('Moving', movingTop),
                renderMiniLeaderboard('No Move', nmTop),
                renderMiniLeaderboard('NMPZ', nmpzTop)
            ])
        ]);

        const card = el('article', { class: 'gg-card gg-card--wide gg-card--primary overall-card' }, [
            el('div', { class: 'gg-card__media', style: { minHeight: '140px', background: 'linear-gradient(135deg, #0b3d91 0%, #1e5bb8 100%)' } }, [
                el('div', { class: 'gg-card__header' }, [
                    el('div', { class: 'gg-card__title' }, ['🏆 Celkové pořadí']),
                    el('p', { class: 'gg-card__subtitle' }, ['Nejlepší hráči podle celkového počtu medailí'])
                ])
            ]),
            el('div', { class: 'overall-content' }, [
                el('div', { class: 'overall-main' }, [
                    podium,
                    restList
                ]),
                miniBoards
            ])
        ]);
        container.innerHTML = '';
        container.appendChild(card);
        setTimeout(()=> card.classList.add('gg-in'), 50);
    }

    function buildTOC(){
        const sidebar = document.getElementById('toc-sidebar');
        const nav = sidebar?.querySelector('.toc-nav');
        if(!sidebar || !nav) return;

        let currentTOCSection = null;

        function updateTOC(){
            // Determine which section to show TOC for based on scroll position
            const scoreSection = document.getElementById('score-time');
            const streaksSection = document.getElementById('streaks');
            
            let activeSection = null;
            [scoreSection, streaksSection].forEach(sec => {
                if(!sec) return;
                const rect = sec.getBoundingClientRect();
                // Show TOC if any part of the section is visible
                if(rect.top < window.innerHeight * 0.8 && rect.bottom > window.innerHeight * 0.2){
                    activeSection = sec.id;
                }
            });
            
            if(!activeSection){
                sidebar.classList.remove('toc-visible');
                currentTOCSection = null;
                return;
            }

            // Rebuild TOC only if section changed
            if(currentTOCSection !== activeSection){
                currentTOCSection = activeSection;
                const section = document.getElementById(activeSection);
                const cards = section.querySelectorAll('.gg-card');
                nav.innerHTML = '';
                cards.forEach((card, idx)=>{
                    const title = card.querySelector('.gg-card__title')?.textContent || `Card ${idx+1}`;
                    const link = el('a', { href: `#${activeSection}-card-${idx}`, 'data-card-idx': idx }, [title]);
                    link.addEventListener('click', (e)=>{
                        e.preventDefault();
                        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                    nav.appendChild(link);
                    card.id = `${activeSection}-card-${idx}`;
                });
                sidebar.classList.add('toc-visible');
            }
            
            updateActiveTOCLink();
        }

        function updateActiveTOCLink(){
            if(!currentTOCSection) return;
            
            const section = document.getElementById(currentTOCSection);
            if(!section) return;

            const cards = [...section.querySelectorAll('.gg-card')];
            const viewportCenter = window.innerHeight * 0.4;
            
            let bestIdx = 0;
            let bestDistance = Number.POSITIVE_INFINITY;
            
            cards.forEach((card, i)=>{
                const rect = card.getBoundingClientRect();
                const distance = Math.abs(rect.top - viewportCenter);
                if(distance < bestDistance){ bestDistance = distance; bestIdx = i; }
            });

            nav.querySelectorAll('a').forEach((link, i)=>{
                if(i === bestIdx) link.classList.add('active');
                else link.classList.remove('active');
            });
        }

        window.addEventListener('hashchange', updateTOC);
        window.addEventListener('scroll', ()=>{ updateTOC(); }, { passive: true });
        document.addEventListener('gg-rendered', updateTOC);
        setTimeout(updateTOC, 200);
    }

    function showPlayerPopup(entry){
        const playerInfo = entry.playerInfo || {};
        const avatar = playerInfo.avatarImage || playerInfo.pinImage || null;
        
        // Create modal overlay
        const overlay = el('div', { class: 'gg-player-modal-overlay' });
        const modal = el('div', { class: 'gg-player-modal' }, [
            el('button', { 
                class: 'gg-player-modal-close', 
                onclick: () => overlay.remove(),
                'aria-label': 'Zavřít',
                type: 'button'
            }, ['×']),
            avatar ? el('img', { class: 'gg-player-modal-avatar', src: avatar, alt: '', loading: 'eager' }) : el('div', { class: 'gg-player-modal-avatar-placeholder' }),
            el('h3', { class: 'gg-player-modal-name' }, [entry.player || 'Unknown']),
            playerInfo.countryCode ? el('div', { class: 'gg-player-modal-country' }, [`🇺🇳 ${playerInfo.countryCode}`]) : null,
            playerInfo.level ? el('div', { class: 'gg-player-modal-level' }, [`Level ${playerInfo.level}`]) : null,
            playerInfo.xp ? el('div', { class: 'gg-player-modal-xp' }, [`${playerInfo.xp.toLocaleString()} XP`]) : null,
            el('a', { 
                class: 'gg-player-modal-link', 
                href: entry.playerUrl, 
                target: '_blank', 
                rel: 'noopener noreferrer',
                onclick: () => overlay.remove(),
                'aria-label': `Otevřít GeoGuessr profil ${entry.player || 'neznámý'} v novém okně`
            }, ['View GeoGuessr Profile →']),
            el('button', {
                class: 'gg-player-modal-copy',
                onclick: () => {
                    if(navigator.clipboard) {
                        navigator.clipboard.writeText(entry.playerUrl).then(() => {
                            const btn = document.querySelector('.gg-player-modal-copy');
                            if(btn) {
                                const originalText = btn.textContent;
                                btn.textContent = '✓ Zkopírováno!';
                                btn.style.background = '#28a745';
                                setTimeout(() => {
                                    btn.textContent = originalText;
                                    btn.style.background = '';
                                }, 2000);
                            }
                        }).catch(() => {
                            alert('Nepodařilo se zkopírovat odkaz');
                        });
                    }
                },
                style: {
                    marginTop: 'var(--space-md)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: 'rgba(11,61,145,0.1)',
                    color: 'var(--cz-blue)',
                    border: '1px solid rgba(11,61,145,0.2)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--font-sm)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                }
            }, ['📋 Kopírovat odkaz'])
        ]);
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if(e.target === overlay) overlay.remove();
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if(e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        
        // Focus trap for accessibility
        const focusableElements = modal.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        if(firstElement) firstElement.focus();
        
        const trapHandler = (e) => {
            if(e.key !== 'Tab') return;
            
            if(e.shiftKey) {
                if(document.activeElement === firstElement) {
                    e.preventDefault();
                    lastElement?.focus();
                }
            } else {
                if(document.activeElement === lastElement) {
                    e.preventDefault();
                    firstElement?.focus();
                }
            }
        };
        modal.addEventListener('keydown', trapHandler);
        
        // Clean up trap handler when modal closes
        const originalRemove = overlay.remove.bind(overlay);
        overlay.remove = function() {
            modal.removeEventListener('keydown', trapHandler);
            originalRemove();
        };
        
        // Animate in
        setTimeout(() => overlay.classList.add('gg-player-modal-visible'), 10);
    }

    // Lazy load images using Intersection Observer
    let imageObserver = null;
    
    function initLazyLoading(){
        if(!imageObserver){
            imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if(entry.isIntersecting){
                        const img = entry.target;
                        const dataSrc = img.getAttribute('data-src');
                        if(dataSrc){
                            img.src = dataSrc;
                            img.removeAttribute('data-src');
                            observer.unobserve(img);
                        }
                    }
                });
            }, {
                rootMargin: '50px'
            });
        }

        // Observe all lazy images
        document.querySelectorAll('img[data-src]').forEach(img => {
            // Check if image is already visible (in viewport)
            const rect = img.getBoundingClientRect();
            const isVisible = rect.top < window.innerHeight + 50 && rect.bottom > -50;
            
            if(isVisible){
                // Load immediately if already visible
                const dataSrc = img.getAttribute('data-src');
                if(dataSrc){
                    img.src = dataSrc;
                    img.removeAttribute('data-src');
                }
            } else {
                // Observe if not yet visible
                imageObserver.observe(img);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', ()=>{
        hydrate();
        buildTOC();
        initLazyLoading();
    });
    window.addEventListener('gg-refresh-data', hydrate);
})();
