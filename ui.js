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
        return url ? { backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.55) 65%), url('${url}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {};
    }

    function renderEntry(entry, entryIndex){
        const avatar = entry.playerInfo?.avatarImage || entry.playerInfo?.pinImage || null;
        const li = el('li', { class: 'gg-entry' }, [
            el('div', { class: 'gg-entry-rank' }, [entry.rank || '' ]),
            avatar ? el('img', { class: 'gg-entry-avatar', src: avatar, alt: '' }) : el('div', { class: 'gg-entry-avatar-placeholder' }),
            el('div', { class: 'gg-entry-player' }, [
                el('span', {}, [ entry.player || '-' ])
            ]),
            el('div', { class: 'gg-entry-score' }, [
                entry.resultUrl ? el('a', { href: entry.resultUrl, target: '_blank', rel: 'noopener noreferrer', class: 'gg-entry-score-link' }, [ entry.resultLabel || '' ]) : (entry.resultLabel || '')
            ])
        ]);
        li.dataset.entryIndex = String(entryIndex);
        
        // Make entire entry clickable to go to player profile
        if(entry.playerUrl && entry.playerUrl !== '#'){
            li.style.cursor = 'pointer';
            li.addEventListener('click', (e) => {
                // Don't navigate if clicking on the score link
                if(e.target.closest('.gg-entry-score-link')) return;
                window.open(entry.playerUrl, '_blank', 'noopener,noreferrer');
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
        (cards || []).forEach((c)=>{
            const key = c.mapUrl || c.title;
            if(!clusters.has(key)) clusters.set(key, { mapUrl: c.mapUrl, title: c.map?.name || c.title, map: c.map, variants: {}, order: [] });
            const cluster = clusters.get(key);
            const variant = detectVariant(c);
            cluster.variants[variant] = c;
            cluster.order.push(variant);
        });
        return [...clusters.values()];
    }

    function renderCard(card, groupId, cardIndex){
        const map = card.map || {};
        const cover = map.heroImage || map.coverAvatar || null;
        const chips = [];
        if(map.difficulty) chips.push(el('span', { class: 'gg-chip' }, [map.difficulty.toLowerCase()]));
        if(map.coordinateCount) chips.push(el('span', { class: 'gg-chip' }, [String(map.coordinateCount) + ' locs']));
        if(typeof map.plays === 'number') chips.push(el('span', { class: 'gg-chip' }, [String(map.plays).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' plays']));
        if(typeof map.likes === 'number') chips.push(el('span', { class: 'gg-chip' }, [String(map.likes).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' likes']));

        const creator = map.creator || {};
        const creatorEl = creator.nick ? el('a', { class: 'gg-creator', href: creator.profileUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [
            creator.avatarImage ? el('img', { class: 'gg-creator-avatar', src: creator.avatarImage, alt: '' }) : null,
            el('span', {}, [creator.nick])
        ]) : null;

        const authorPeek = map.coverAvatar ? el('img', { class: 'gg-author-peek', src: map.coverAvatar, alt: '' }) : null;
        const header = el('div', { class: 'gg-card__media', style: bgImageStyle(cover) }, [
            el('div', { class: 'gg-card__header' }, [
                el('a', { class: 'gg-card__title', href: card.mapUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ card.title || 'Map' ]),
                el('div', { class: 'gg-chip-row' }, chips)
            ]),
            authorPeek
        ]);

        const list = el('ul', { class: 'gg-entry-list' }, (card.entries || []).map((e, idx)=> renderEntry(e, idx)));

        const article = el('article', { class: `gg-card ${themeClass(card.theme)}` }, [ header, list ]);
        article.dataset.groupId = groupId;
        article.dataset.cardIndex = String(cardIndex);
        return article;
    }

    function renderClusterCard(cluster, groupId, clusterIndex){
        const map = cluster.map || {};
        const cover = map.heroImage || map.coverAvatar || null;

        const variantKeys = ['MOVING','NM','NMPZ'].filter(k=> cluster.variants[k]);
        const statsChips = [];
        if(typeof map.plays === 'number') statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.plays).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), ' plays']));
        if(typeof map.likes === 'number') statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.likes).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), ' likes']));
        if(map.coordinateCount) statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.coordinateCount), ' locs']));
        if(map.averageScore) statsChips.push(el('span', { class: 'gg-chip gg-stat' }, [String(map.averageScore), ' avg score']));

        const authorPeek = map.coverAvatar ? el('img', { class: 'gg-author-peek', src: map.coverAvatar, alt: '' }) : null;
        const header = el('div', { class: 'gg-card__media', style: bgImageStyle(cover) }, [
            el('div', { class: 'gg-card__header' }, [
                el('a', { class: 'gg-card__title', href: cluster.mapUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ cluster.title || 'Map' ]),
                el('div', { class: 'gg-chip-row' }, statsChips)
            ]),
            authorPeek
        ]);

        // For streaks section, skip MOVING variant
        let order = ['MOVING','NM','NMPZ'];
        if(groupId === 'streaks'){
            order = ['NM','NMPZ'];
        }

        const cols = el('div', { class: 'gg-variant-cols' });
        const actualVariants = order.filter(k => cluster.variants[k]);
        cols.dataset.variantCount = String(actualVariants.length);
        
        actualVariants.forEach((key)=>{
            const variantCard = cluster.variants[key];
            const col = el('div', { class: 'gg-variant-col' });
            const variantHeader = el('div', { style: { padding: 'var(--space-md) var(--space-lg)', borderBottom: '1px solid rgba(255,255,255,0.1)' } });
            variantHeader.appendChild(el('span', { class: 'gg-chip' }, [key]));
            col.appendChild(variantHeader);
            const list = el('ul', { class: 'gg-entry-list' });
            (variantCard?.entries || []).forEach((e, idx)=> list.appendChild(renderEntry(e, idx)));
            col.appendChild(list);
            cols.appendChild(col);
        });

        const article = el('article', { class: `gg-card gg-card--wide ${themeClass('secondary')}` }, [ header, cols ]);
        article.dataset.groupId = groupId;
        article.dataset.cardIndex = String(clusterIndex);
        return article;
    }

    function renderGroup(container, group){
        const grid = el('div', { class: 'gg-grid' });
        const clusters = groupCardsByMap(group.cards);
        clusters.forEach((cluster, idx)=>{
            const isCluster = Object.keys(cluster.variants).length > 1;
            const node = isCluster ? renderClusterCard(cluster, group.id, idx) : renderCard(cluster.variants[Object.keys(cluster.variants)[0]], group.id, idx);
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
        const res = await fetch(url);
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
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
            const cacheBuster = Date.now();
            data = await fetchJson(`data/enrichedLeaderboards.json?cb=${cacheBuster}&t=${cacheBuster}`);
        }catch(_){
            try{ 
                const cacheBuster = Date.now();
                data = await fetchJson(`data/leaderboards.json?cb=${cacheBuster}&t=${cacheBuster}`); 
            }
            catch(__){ /* both failed; leave static */ return; }
        }
        try{ localStorage.setItem(CACHE_KEY, JSON.stringify(data)); localStorage.setItem(CACHE_TIME_KEY, String(now)); }catch(_){ }
        const groups = data.groups || [];
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
        return el('div', { class: 'mini-leaderboard' }, [
            el('div', { class: 'mini-leaderboard-title' }, [title]),
            el('ul', { class: 'mini-leaderboard-list' }, players.map((p, idx) => {
                const avatar = p.playerInfo?.avatarImage || p.playerInfo?.pinImage || null;
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉';
                return el('li', { class: 'mini-leaderboard-entry' }, [
                    el('div', { class: 'mini-lb-rank' }, [medal]),
                    avatar ? el('img', { class: 'mini-lb-avatar', src: avatar, alt: '' }) : el('div', { class: 'mini-lb-avatar-placeholder' }),
                    el('a', { class: 'mini-lb-name', href: p.playerUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ p.player ])
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
        const podium = el('div', { class: 'podium' }, 
            podiumOrder.map((p, displayIdx) => {
                const actualRank = displayIdx === 0 ? 2 : displayIdx === 1 ? 1 : 3;
                const avatar = p?.playerInfo?.avatarImage || p?.playerInfo?.pinImage || null;
                const medal = actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : '🥉';
                return el('div', { class: `podium-place podium-place--${actualRank}` }, [
                    avatar ? el('img', { class: 'podium-avatar', src: avatar, alt: '' }) : el('div', { class: 'podium-avatar-placeholder' }),
                    el('div', { class: 'podium-rank' }, [medal]),
                    el('a', { class: 'podium-name', href: p?.playerUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ p?.player || '-' ]),
                    el('div', { class: 'podium-stats' }, [
                        el('span', {}, [`🥇${p?.first || 0}`]),
                        el('span', {}, [`🥈${p?.second || 0}`]),
                        el('span', {}, [`🥉${p?.third || 0}`])
                    ])
                ]);
            })
        );

        const restList = rest.length > 0 ? el('ul', { class: 'gg-entry-list', style: { marginTop: '16px' } }, rest.map((p, idx) => {
            const avatar = p.playerInfo?.avatarImage || p.playerInfo?.pinImage || null;
            return el('li', { class: 'gg-entry' }, [
                el('div', { class: 'gg-entry-rank' }, [String(idx + 4) + '.']),
                avatar ? el('img', { class: 'gg-entry-avatar', src: avatar, alt: '' }) : el('div', { class: 'gg-entry-avatar-placeholder' }),
                el('div', { class: 'gg-entry-player' }, [
                    el('a', { href: p.playerUrl || '#', target: '_blank', rel: 'noopener noreferrer' }, [ p.player ])
                ]),
                el('div', { class: 'gg-entry-score', style: { display: 'flex', gap: '12px', fontSize: '13px' } }, [
                    el('span', {}, [`🥇 ${p.first}`]),
                    el('span', {}, [`🥈 ${p.second}`]),
                    el('span', {}, [`🥉 ${p.third}`])
                ])
            ]);
        })) : null;

        // Mini mode leaderboards
        const movingTop = calculateModeRankings(groups, 'MOVING');
        const nmTop = calculateModeRankings(groups, 'NM');
        const nmpzTop = calculateModeRankings(groups, 'NMPZ');

        const miniBoards = el('div', { class: 'mini-leaderboards' }, [
            renderMiniLeaderboard('Moving', movingTop),
            renderMiniLeaderboard('No Move', nmTop),
            renderMiniLeaderboard('NMPZ', nmpzTop)
        ]);

        const card = el('article', { class: 'gg-card gg-card--wide gg-card--primary' }, [
            el('div', { class: 'gg-card__media', style: { minHeight: '80px', background: 'linear-gradient(135deg, #0b3d91 0%, #1e5bb8 100%)' } }, [
                el('div', { class: 'gg-card__header' }, [
                    el('div', { class: 'gg-card__title' }, ['Nejlepší hráči'])
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

    document.addEventListener('DOMContentLoaded', ()=>{
        hydrate();
        buildTOC();
    });
    window.addEventListener('gg-refresh-data', hydrate);
})();
