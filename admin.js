(function(){
    const ADMIN_HASH_SHA256 = 'db691e0df28a3033d1e596431a9f1bfd202d884fb90105f3c03eee6f2672b52c';
    const DEFAULT_OWNER = 'filipjarolim';
    const DEFAULT_REPO = 'Geoguessr-cesko-Rekordy';
    const DEFAULT_BRANCH = 'main';

    function el(tag, attrs = {}, children = []){
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k,v])=>{
            if(k === 'class') node.className = v;
            else if(k === 'style') Object.assign(node.style, v);
            else if(k.startsWith('on') && typeof v === 'function') node[k] = v;
            else node.setAttribute(k, v);
        });
        if(typeof children === 'string') node.textContent = children;
        else children.forEach(c=> node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return node;
    }

    async function sha256Hex(text){
        const enc = new TextEncoder();
        const hash = await crypto.subtle.digest('SHA-256', enc.encode(text));
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    }

    function base64Encode(str){ return btoa(unescape(encodeURIComponent(str))); }
    function base64Decode(b64){ return decodeURIComponent(escape(atob(b64))); }

    function getRoot(){
        let root = document.getElementById('admin-root');
        if(!root){
            root = document.createElement('div');
            root.id = 'admin-root';
            Object.assign(root.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', zIndex: '2000', overflow: 'auto', padding: '40px 20px' });
            document.body.appendChild(root);
        }
        return root;
    }
    function removeRoot(){ const r = document.getElementById('admin-root'); if(r) r.remove(); }

    function isAdminAuthenticated(){
        const adminData = localStorage.getItem('gg_admin_data');
        if(!adminData) return false;
        
        try{
            const data = JSON.parse(adminData);
            // Check if session is still valid (24 hours)
            const sessionExpiry = 24 * 60 * 60 * 1000; // 24 hours in ms
            const now = Date.now();
            if(data.loginTime && (now - data.loginTime) < sessionExpiry){
                return true;
            } else {
                // Session expired, clear it
                localStorage.removeItem('gg_admin_data');
                localStorage.removeItem('gg_admin_ok');
                return false;
            }
        }catch(e){
            return false;
        }
    }

    function saveAdminSession(){
        const adminData = {
            loginTime: Date.now(),
            sessionId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
        };
        localStorage.setItem('gg_admin_data', JSON.stringify(adminData));
        localStorage.setItem('gg_admin_ok', '1'); // Keep for backward compatibility
    }

    function clearAdminSession(){
        localStorage.removeItem('gg_admin_data');
        localStorage.removeItem('gg_admin_ok');
        contextMenuBound = false; // Reset context menu binding
        const indicator = document.getElementById('admin-mode-indicator');
        if(indicator) indicator.remove();
    }

    function uiLogin(onSuccess){
        const root = getRoot();
        root.innerHTML = '';
        const pwd = el('input', { type: 'password', placeholder: 'Admin password', style: { padding: '10px', width: '100%', marginBottom: '10px' }});
        const info = el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '10px', padding: '8px', background: '#f5f5f5', borderRadius: '6px' } }, [
            '💡 Tip: Heslo je uloženo jako SHA-256 hash. Pokud jste ho zapomněli, kontaktujte správce nebo změňte hash v kódu.'
        ]);
        const btn = el('button', { class: 'gg-btn', style: { padding: '10px 16px' }, onclick: async ()=>{
            const ok = await sha256Hex(pwd.value || '') === ADMIN_HASH_SHA256;
            if(!ok){ alert('Wrong password'); return; }
            saveAdminSession();
            onSuccess();
        }}, ['Enter']);
        const close = el('button', { style: { padding: '8px 12px', float: 'right' }, onclick: ()=>{ removeRoot(); history.replaceState(null, '', location.pathname + location.search); } }, ['Close']);
        
        // Allow Enter key to submit
        pwd.addEventListener('keypress', async (e)=>{
            if(e.key === 'Enter'){
                const ok = await sha256Hex(pwd.value || '') === ADMIN_HASH_SHA256;
                if(!ok){ alert('Wrong password'); return; }
                saveAdminSession();
                onSuccess();
            }
        });
        
        root.appendChild(el('div', { style: { maxWidth: '980px', margin: '0 auto', background: '#fff', color: '#111', borderRadius: '12px', padding: '16px' } }, [close, el('h3', {}, ['Admin login']), info, pwd, btn]));
    }

    function readTokenFromURL(){
        try{
            const searchToken = new URLSearchParams(location.search).get('token');
            if(searchToken) return searchToken;
            const h = location.hash || '';
            if(h.includes('token=')){
                const after = h.slice(h.indexOf('token='));
                const part = after.split('&')[0];
                return decodeURIComponent(part.split('=')[1] || '');
            }
        }catch(_){ }
        return '';
    }

    function uiApp(){
        const root = getRoot();
        root.innerHTML = '';

        const tokenInput = el('input', { type: 'password', placeholder: 'GitHub Personal Access Token (stored in your browser)', style: { padding: '10px', width: '100%', marginBottom: '10px', display: 'none' }});
        const ownerInput = el('input', { value: DEFAULT_OWNER, style: { padding: '8px', marginRight: '8px' }});
        const repoInput = el('input', { value: DEFAULT_REPO, style: { padding: '8px', marginRight: '8px' }});
        const branchInput = el('input', { value: DEFAULT_BRANCH, style: { padding: '8px' }});

        const status = el('div', { style: { margin: '10px 0', color: '#444' } });

        const loadBtn = el('button', { onclick: loadData, style: { padding: '8px 12px', marginRight: '8px' } }, ['Load data']);
        const saveBtn = el('button', { onclick: saveAll, style: { padding: '8px 12px' } }, ['Save changes']);
        const clearTokenBtn = el('button', { onclick: ()=>{ localStorage.removeItem('gg_pat'); tokenInput.value=''; setStatus('Token cleared'); }, style: { padding: '8px 12px', marginLeft: '8px' } }, ['Clear token']);
        const logoutBtn = el('button', { onclick: ()=>{ clearAdminSession(); removeRoot(); history.replaceState(null, '', location.pathname + location.search); alert('Logged out'); }, style: { padding: '8px 12px', marginLeft: '8px', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' } }, ['Logout']);

        const configRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } }, [
            el('label', {}, ['Owner: ']), ownerInput,
            el('label', {}, ['Repo: ']), repoInput,
            el('label', {}, ['Branch: ']), branchInput,
        ]);

        const editor = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }});
        const visualPane = el('div');
        const jsonPane = el('div');
        const jsonArea = el('textarea', { style: { width: '100%', height: '520px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px' } });
        jsonPane.appendChild(jsonArea);

        editor.appendChild(visualPane);
        editor.appendChild(jsonPane);

        const adminInfo = el('div', { style: { marginBottom: '12px', padding: '8px', background: '#e7f3ff', borderRadius: '6px', fontSize: '12px', color: '#0066cc' } });
        function updateAdminInfo(){
            const adminData = localStorage.getItem('gg_admin_data');
            if(adminData){
                try{
                    const data = JSON.parse(adminData);
                    const loginDate = new Date(data.loginTime);
                    const hoursLeft = Math.max(0, Math.floor((24 * 60 * 60 * 1000 - (Date.now() - data.loginTime)) / (60 * 60 * 1000)));
                    adminInfo.innerHTML = `✅ Admin session active | Logged in: ${loginDate.toLocaleString('cs-CZ')} | Session expires in: ${hoursLeft}h | Session ID: ${data.sessionId?.substring(0, 8)}...`;
                }catch(e){
                    adminInfo.textContent = 'Admin session active';
                }
            }
        }
        updateAdminInfo();
        
        root.appendChild(el('div', { style: { maxWidth: '980px', margin: '0 auto', background: '#fff', color: '#111', borderRadius: '12px', padding: '16px' } }, [ adminInfo, tokenInput, configRow, el('div', {}, [loadBtn, saveBtn, clearTokenBtn, logoutBtn]), status, editor ]));

        let state = { leaderboards: null, sha: null };

        // Prefill token from URL, localStorage, or environment variable, and persist on change
        (function initToken(){
            // Try to get token from various sources
            const fromUrl = readTokenFromURL();
            const saved = localStorage.getItem('gg_pat') || '';
            
            // Note: In browser JS, we can't access process.env directly
            // But if running in Node.js context or via build tool, check window.GITHUB_TOKEN
            const fromEnv = typeof window !== 'undefined' && window.GITHUB_TOKEN ? window.GITHUB_TOKEN : null;
            
            tokenInput.value = fromUrl || fromEnv || saved || '';
            tokenInput.addEventListener('input', ()=>{
                localStorage.setItem('gg_pat', tokenInput.value || '');
            });
        })();

        function setStatus(msg){ status.textContent = msg; }

        function getGitHubToken(){
            // Try multiple sources for GitHub token
            return tokenInput.value || 
                   localStorage.getItem('gg_pat') || 
                   (typeof window !== 'undefined' && window.GITHUB_TOKEN) ||
                   '';
        }

        async function ghGet(path){
            const url = `https://api.github.com/repos/${ownerInput.value}/${repoInput.value}/contents/${path}?ref=${branchInput.value}`;
            const token = getGitHubToken();
            const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
            if(!res.ok) throw new Error(`GET ${path} ${res.status}`);
            return await res.json();
        }

        async function ghPut(path, content, sha, message){
            const url = `https://api.github.com/repos/${ownerInput.value}/${repoInput.value}/contents/${path}`;
            const body = { message, content: base64Encode(content), branch: branchInput.value, sha };
            const token = getGitHubToken();
            const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
            if(!res.ok) throw new Error(`PUT ${path} ${res.status}`);
            return await res.json();
        }

        function renderVisual(){
            if(!state.leaderboards){ visualPane.innerHTML = ''; return; }
            const groups = state.leaderboards.groups || [];

            const groupSelect = el('select');
            groups.forEach((g, i)=> groupSelect.appendChild(el('option', { value: i }, [g.header || g.id])));

            const cardSelect = el('select');
            const cardsBox = el('div', { style: { marginTop: '8px' } });

            function refreshCards(){
                const gi = Number(groupSelect.value || 0);
                cardSelect.innerHTML = '';
                (groups[gi].cards || []).forEach((c, i)=> cardSelect.appendChild(el('option', { value: i }, [c.title])));
                drawCard();
            }

            function drawCard(){
                const gi = Number(groupSelect.value || 0);
                const ci = Number(cardSelect.value || 0);
                const card = groups[gi].cards[ci];
                cardsBox.innerHTML = '';

                const title = el('input', { value: card.title, style: { padding: '6px', width: '100%', margin: '6px 0' } });
                const mapUrl = el('input', { value: card.mapUrl || '', style: { padding: '6px', width: '100%', margin: '6px 0' } });
                const theme = el('select', { style: { padding: '6px', margin: '6px 0' } }, [
                    el('option', { value: 'primary' }, ['primary']),
                    el('option', { value: 'secondary' }, ['secondary']),
                    el('option', { value: 'tertiary' }, ['tertiary'])
                ]);
                theme.value = card.theme || 'primary';

                const entriesBox = el('div');
                function renderEntries(){
                    entriesBox.innerHTML = '';
                    (card.entries || []).forEach((e, idx)=>{
                        const row = el('div', { style: { display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr', gap: '6px', marginBottom: '6px' } }, [
                            el('input', { value: e.rank || '', placeholder: 'rank' }),
                            el('input', { value: e.player || '', placeholder: 'player' }),
                            el('input', { value: e.playerUrl || '', placeholder: 'playerUrl' }),
                            el('input', { value: e.resultLabel || '', placeholder: 'result' }),
                        ]);
                        const resUrl = el('input', { value: e.resultUrl || '', placeholder: 'resultUrl', style: { width: '100%', marginBottom: '6px' } });
                        const rm = el('button', { onclick: ()=>{ card.entries.splice(idx,1); renderEntries(); syncJson(); }, style: { padding: '4px 8px' } }, ['Remove']);
                        entriesBox.appendChild(row);
                        entriesBox.appendChild(resUrl);
                        entriesBox.appendChild(rm);
                        // Bind updates
                        const [rankI, playerI, playerUrlI, resultI] = row.querySelectorAll('input');
                        rankI.oninput = ()=>{ e.rank = rankI.value; syncJson(); };
                        playerI.oninput = ()=>{ e.player = playerI.value; syncJson(); };
                        playerUrlI.oninput = ()=>{ e.playerUrl = playerUrlI.value; syncJson(); };
                        resultI.oninput = ()=>{ e.resultLabel = resultI.value; syncJson(); };
                        resUrl.oninput = ()=>{ e.resultUrl = resUrl.value; syncJson(); };
                    });
                }

                const addEntry = el('button', { onclick: ()=>{ card.entries = card.entries || []; card.entries.push({ rank: '', player: '', playerUrl: '', resultLabel: '', resultUrl: '' }); renderEntries(); syncJson(); }, style: { padding: '6px 10px', marginBottom: '8px' } }, ['Add entry']);

                cardsBox.appendChild(title);
                cardsBox.appendChild(mapUrl);
                cardsBox.appendChild(theme);
                cardsBox.appendChild(addEntry);
                cardsBox.appendChild(entriesBox);
                renderEntries();

                title.oninput = ()=>{ card.title = title.value; syncJson(); };
                mapUrl.oninput = ()=>{ card.mapUrl = mapUrl.value; syncJson(); };
                theme.onchange = ()=>{ card.theme = theme.value; syncJson(); };
            }

            groupSelect.onchange = refreshCards;
            cardSelect.onchange = drawCard;

            visualPane.innerHTML = '';
            visualPane.appendChild(el('div', {}, [ groupSelect, cardSelect ]));
            visualPane.appendChild(cardsBox);

            refreshCards();
        }

        function syncJson(){
            jsonArea.value = JSON.stringify(state.leaderboards, null, 2);
        }

        async function loadData(){
            try{
                setStatus('Loading data from GitHub...');
                const res = await ghGet('data/leaderboards.json');
                state.sha = res.sha;
                state.leaderboards = JSON.parse(base64Decode(res.content));
                setStatus('Loaded leaderboards.json');
                renderVisual();
                syncJson();
            }catch(e){
                setStatus('Failed to load: ' + e.message);
            }
        }

        async function enrichAll(groups){
            async function fetchNextData(url){
                const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
                const html = await res.text();
                const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                return JSON.parse(m[1]);
            }
            const mapCache = new Map();
            const playerCache = new Map();
            async function hydrateMap(mapUrl){
                if(!mapUrl) return null; if(mapCache.has(mapUrl)) return mapCache.get(mapUrl);
                const slug = new URL(mapUrl).pathname.split('/').filter(Boolean).at(-1);
                const data = await fetchNextData(`https://www.geoguessr.com/maps/${slug}`);
                const map = data?.props?.pageProps?.map;
                const creator = map?.creator || {};
                const build = (p)=> p ? `https://www.geoguessr.com/images/resize:auto:256:256/gravity:ce/plain/${p}` : null;
                const obj = map ? {
                    id: map.id, slug, name: map.name, description: map.description || null,
                    playUrl: map.playUrl ? `https://www.geoguessr.com${map.playUrl}` : null,
                    likes: map.likes ?? null, plays: map.numFinishedGames ?? null, averageScore: map.averageScore ?? null,
                    coordinateCount: map.coordinateCount ?? null, difficulty: map.difficulty ?? null, difficultyLevel: map.difficultyLevel ?? null,
                    tags: map.tags ?? [], createdAt: map.createdAt ?? null, updatedAt: map.updatedAt ?? null,
                    heroImage: build(creator.pin?.path || null), coverAvatar: build(creator.avatar?.fullBodyPath || null),
                    creator: { nick: creator.nick || null, userId: creator.userId || null, profileUrl: creator.url ? `https://www.geoguessr.com${creator.url}`: null,
                        countryCode: creator.countryCode || null, isVerified: !!creator.isVerified, isProUser: !!creator.isProUser,
                        avatarImage: build(creator.avatar?.fullBodyPath || null), pinImage: build(creator.pin?.path || null) }
                } : null;
                mapCache.set(mapUrl, obj); return obj;
            }
            async function hydratePlayer(playerUrl){
                if(!playerUrl) return null; if(playerCache.has(playerUrl)) return playerCache.get(playerUrl);
                const slug = new URL(playerUrl).pathname.split('/').filter(Boolean).at(-1);
                const data = await fetchNextData(`https://www.geoguessr.com/user/${slug}`);
                const user = data?.props?.pageProps?.user; const stats = data?.props?.pageProps?.userBasicStats || {}; const progress = user?.progress || {};
                const build = (p)=> p ? `https://www.geoguessr.com/images/resize:auto:200:200/gravity:ce/plain/${p}` : null;
                const obj = user ? { nick: user.nick || null, userId: user.userId || slug, url: `https://www.geoguessr.com/user/${slug}`,
                    countryCode: user.countryCode || null, isVerified: !!user.isVerified, isProUser: !!user.isProUser,
                    level: progress.level ?? null, xp: progress.xp ?? null, title: progress.title ?? null,
                    gamesPlayed: stats.gamesPlayed ?? null, averageGameScore: stats.averageGameScore ?? null, maxGameScore: stats.maxGameScore ?? null,
                    streakHighlights: (stats.streakRecords || []).slice(0,5), avatarImage: build(user.avatar?.fullBodyPath || null), pinImage: build(user.pin?.path || null) } : null;
                playerCache.set(playerUrl, obj); return obj;
            }
            for(const group of groups){
                for(const card of group.cards){
                    card.map = await hydrateMap(card.mapUrl);
                    for(const entry of card.entries){ entry.playerInfo = await hydratePlayer(entry.playerUrl); }
                }
            }
            return { groups, lookupCounts: { maps: mapCache.size, players: playerCache.size }, generatedAt: new Date().toISOString(), source: 'https://www.geoguessr.com' };
        }

        async function saveAll(){
            try{
                if(!tokenInput.value){ alert('Enter a GitHub token'); return; }
                // Parse edited JSON
                state.leaderboards = JSON.parse(jsonArea.value);
                setStatus('Enriching (client-side)...');
                const enriched = await enrichAll(JSON.parse(JSON.stringify(state.leaderboards)).groups || state.leaderboards.groups);

                setStatus('Committing leaderboards.json...');
                const updated1 = await ghPut('data/leaderboards.json', JSON.stringify(state.leaderboards, null, 2), state.sha, 'chore(admin): update leaderboards');
                state.sha = updated1.content.sha;

                setStatus('Committing enrichedLeaderboards.json...');
                await ghPut('data/enrichedLeaderboards.json', JSON.stringify(enriched, null, 2), null, 'chore(admin): regenerate enriched dataset');
                setStatus('Done.');
                alert('Saved to GitHub.');
            }catch(e){
                setStatus('Save failed: ' + e.message);
            }
        }

        // Auto-load once
        // loadData();
    }

    // Context menu edit (right-click)
    let contextMenuBound = false;
    function bindContextMenu(){
        if(contextMenuBound) return; // Prevent duplicate listeners
        contextMenuBound = true;
        
        document.addEventListener('contextmenu', async (e)=>{
            const isAdmin = isAdminAuthenticated();
            if(!isAdmin) {
                contextMenuBound = false; // Reset if admin session expired
                return;
            }
            const entry = e.target.closest('.gg-entry');
            const card = e.target.closest('.gg-card');
            if(!entry && !card) return;
            e.preventDefault();

            const hostCard = card || entry.closest('.gg-card');
            if(!hostCard) return;
            const groupId = hostCard.dataset.groupId;
            const cardIndex = Number(hostCard.dataset.cardIndex);
            const entryIndex = entry ? Number(entry.dataset.entryIndex) : null;

            openEditor({ groupId, cardIndex, entryIndex });
        });
    }

    function showSuccessNotification(message){
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease-out;
            display: flex;
            align-items: center;
            gap: 12px;
        `;
        notification.innerHTML = `<span>${message}</span>`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }
    
    function showErrorNotification(message){
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 600;
            z-index: 10001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // Users management
    let usersList = [];
    let usersLoadingPromise = null; // For loadUsers()
    let enrichmentPromise = null; // For enrichUsersWithProfiles()
    let enrichmentProgress = { loaded: 0, total: 0, failed: [] };
    
    async function loadUsers(){
        // Prevent multiple simultaneous loads
        if(usersLoadingPromise) return usersLoadingPromise;
        
        usersLoadingPromise = (async () => {
            try{
                const res = await fetch('data/users.json?cb=' + Date.now());
                if(!res.ok){
                    throw new Error(`Failed to fetch users.json: ${res.status} ${res.statusText}`);
                }
                const data = await res.json();
                usersList = Array.isArray(data.users) ? data.users : [];
                usersLoadingPromise = null;
                return usersList;
            }catch(e){
                console.warn('Failed to load users.json:', e);
                usersList = [];
                usersLoadingPromise = null;
                return [];
            }
        })();
        
        return usersLoadingPromise;
    }
    
    async function fetchUserProfile(url, retries = 2){
        try{
            // Extract user ID from URL
            const userIdMatch = url.match(/\/user\/([a-z0-9]+)/i);
            if(!userIdMatch) return null;
            const userId = userIdMatch[1];
            
            // Try direct API endpoint first (more reliable)
            for(let attempt = 0; attempt <= retries; attempt++){
                try{
                    const apiUrl = `https://www.geoguessr.com/api/v3/users/${userId}`;
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
                    
                    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`, {
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    
                    if(res.ok){
                        const userData = await res.json();
                        if(userData && userData.nick){
                            const avatarPath = userData.fullBodyPin || userData.pin?.url || null;
                            return { 
                                name: userData.nick, 
                                avatarUrl: avatarPath ? `https://www.geoguessr.com/images/resize:auto:200:200/gravity:ce/plain/${avatarPath}` : null 
                            };
                        }
                    }
                }catch(apiError){
                    if(attempt < retries && apiError.name !== 'AbortError'){
                        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
                        continue;
                    }
                    if(apiError.name === 'AbortError'){
                        console.warn(`API request timeout for ${userId} (attempt ${attempt + 1}/${retries + 1})`);
                    }else{
                        console.warn(`API endpoint failed (attempt ${attempt + 1}/${retries + 1}):`, apiError);
                    }
                }
            }
            
            // Fallback to HTML parsing
            try{
                const data = await fetchNextData(url);
                const user = data?.props?.pageProps?.user;
                if(user && user.nick){
                    const avatarPath = user.avatar?.fullBodyPath || user.pin?.path || user.fullBodyPin || null;
                    return { 
                        name: user.nick, 
                        avatarUrl: avatarPath ? `https://www.geoguessr.com/images/resize:auto:200:200/gravity:ce/plain/${avatarPath}` : null 
                    };
                }
            }catch(htmlError){
                console.warn('HTML parsing also failed:', htmlError);
            }
        }catch(e){
            console.warn('Failed to fetch user profile:', e);
        }
        return null;
    }
    
    async function enrichUsersWithProfiles(saveToGitHub = false, onProgress = null){
        // Don't start multiple enrichment processes
        if(enrichmentPromise) return enrichmentPromise;
        
        enrichmentPromise = (async () => {
            const usersToEnrich = usersList.filter(u => !u.name || !u.avatarUrl);
            if(usersToEnrich.length === 0) {
                enrichmentProgress = { loaded: 0, total: 0, failed: [] };
                return;
            }
            
            enrichmentProgress = { loaded: 0, total: usersToEnrich.length, failed: [] };
            console.log(`Loading profiles for ${usersToEnrich.length} users...`);
            
            // Load in parallel batches for better performance - increased batch size
            const batchSize = 8; // Increased from 5 to 8 for faster loading
            let hasUpdates = false;
            
            for(let i = 0; i < usersToEnrich.length; i += batchSize){
                const batch = usersToEnrich.slice(i, i + batchSize);
                const results = await Promise.allSettled(batch.map(async (user) => {
                    try{
                        const profile = await fetchUserProfile(user.url, 2); // Increased retries from 1 to 2
                        if(profile && (profile.name !== user.name || profile.avatarUrl !== user.avatarUrl)){
                            user.name = profile.name;
                            user.avatarUrl = profile.avatarUrl;
                            hasUpdates = true;
                            enrichmentProgress.loaded++;
                            if(onProgress) onProgress(enrichmentProgress);
                            return { success: true, user };
                        }else if(!profile){
                            enrichmentProgress.failed.push(user.url);
                        }
                        enrichmentProgress.loaded++;
                        if(onProgress) onProgress(enrichmentProgress);
                        return { success: false, user };
                    }catch(e){
                        enrichmentProgress.failed.push(user.url);
                        enrichmentProgress.loaded++;
                        if(onProgress) onProgress(enrichmentProgress);
                        console.warn(`Failed to load profile for ${user.url}:`, e);
                        return { success: false, user, error: e };
                    }
                }));
                
                // Smaller delay between batches - we can be more aggressive
                if(i + batchSize < usersToEnrich.length){
                    await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 300ms to 200ms
                }
            }
            
            // Sort by name after enrichment
            usersList.sort((a, b) => (a.name || a.url).localeCompare(b.name || b.url));
            
            // Save to GitHub if requested and we have updates
            if(saveToGitHub && hasUpdates){
                try{
                    const owner = DEFAULT_OWNER;
                    const repo = DEFAULT_REPO;
                    const branch = DEFAULT_BRANCH;
                    const token = localStorage.getItem('gg_pat') || (typeof window !== 'undefined' && window.GITHUB_TOKEN) || '';
                    
                    if(token){
                        async function ghGet(path){
                            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
                            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
                            if(!r.ok) throw new Error(`GET ${path} ${r.status}`);
                            return await r.json();
                        }
                        
                        async function ghPut(path, content, sha, message){
                            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                            const body = { message, content: base64Encode(content), branch, ...(sha ? { sha } : {}) };
                            const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                            if(!r.ok) throw new Error(`PUT ${path} ${r.status}`);
                            return await r.json();
                        }
                        
                        let base;
                        try{
                            base = await ghGet('data/users.json');
                        }catch(e){
                            base = { sha: null };
                        }
                        
                        await ghPut('data/users.json', JSON.stringify({ users: usersList }, null, 2), base.sha, 'chore(admin): enrich user profiles');
                        console.log('✅ User profiles saved to GitHub');
                    }
                }catch(e){
                    console.warn('Failed to save enriched profiles to GitHub:', e);
                }
            }
            
            enrichmentPromise = null;
            enrichmentProgress = { loaded: 0, total: 0, failed: [] };
        })();
        
        return enrichmentPromise;
    }
    
    async function addUser(profileUrl){
        if(!profileUrl || !profileUrl.includes('/user/')) return null;
        // Check if already exists
        if(usersList.find(u => u.url === profileUrl)) return null;
        
        const userInfo = await fetchUserProfile(profileUrl);
        const newUser = { url: profileUrl, name: userInfo?.name || null, avatarUrl: userInfo?.avatarUrl || null };
        usersList.push(newUser);
        usersList.sort((a, b) => (a.name || a.url).localeCompare(b.name || b.url));
        
        // Save to GitHub
        try{
            const owner = DEFAULT_OWNER;
            const repo = DEFAULT_REPO;
            const branch = DEFAULT_BRANCH;
            const token = localStorage.getItem('gg_pat') || (typeof window !== 'undefined' && window.GITHUB_TOKEN) || '';
            
            async function ghGet(path){
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
                const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
                if(!r.ok) throw new Error(`GET ${path} ${r.status}`);
                return await r.json();
            }
            
            async function ghPut(path, content, sha, message){
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
                const body = { message, content: base64Encode(content), branch, ...(sha ? { sha } : {}) };
                const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
                if(!r.ok) throw new Error(`PUT ${path} ${r.status}`);
                return await r.json();
            }
            
            let base;
            try{
                base = await ghGet('data/users.json');
            }catch(e){
                base = { sha: null };
            }
            
            await ghPut('data/users.json', JSON.stringify({ users: usersList }, null, 2), base.sha, 'chore(admin): add user');
            return newUser;
        }catch(e){
            console.error('Failed to save user:', e);
            throw e;
        }
    }

    function openEditor(ref){
        const root = getRoot();
        root.innerHTML = '';
        root.style.animation = 'fadeIn 0.2s ease-out';
        
        const title = el('h3', { style: { marginBottom: '8px', fontSize: '24px', fontWeight: '700', color: '#0b3d91' } }, ['Edit record']);
        const info = el('div', { style: { marginBottom: '0', color: '#666', fontSize: '13px', fontFamily: 'ui-monospace, Menlo, monospace' } }, [ `Group: ${ref.groupId} · Card: ${ref.cardIndex}` + (ref.entryIndex != null ? ` · Entry: ${ref.entryIndex}` : '') ]);
        
        const statusDiv = el('div', { style: { marginBottom: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', display: 'none', transition: 'all 0.3s ease', fontWeight: '500', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' } });
        
        // Main input: game URL + optional text
        const mainInput = el('textarea', { 
            placeholder: 'Paste game URL + optional info\nExample: https://www.geoguessr.com/game/TGxYAZhOGxOvuHgb AI Generated World NMPZ 23907', 
            style: { 
                padding: '14px', 
                width: '100%', 
                minHeight: '100px',
                fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: '14px',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                resize: 'vertical',
                transition: 'border-color 0.2s ease',
                background: '#fff'
            },
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#e0e0e0'; }
        });
        
        // Custom user dropdown with avatars
        const userDropdownWrapper = el('div', { style: { position: 'relative', marginBottom: '12px' } });
        const userSelectButton = el('button', { 
            style: { 
                padding: '10px 12px', 
                width: '100%', 
                fontSize: '14px',
                background: '#fff',
                border: '2px solid #ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                textAlign: 'left',
                minHeight: '48px',
                justifyContent: 'space-between'
            },
            onclick: () => {
                userDropdownList.style.display = userDropdownList.style.display === 'none' ? 'block' : 'none';
                if(userDropdownList.style.display === 'block' && userSearchInput){
                    setTimeout(() => userSearchInput.focus(), 100);
                }
            }
        }, [
            el('span', { style: { color: '#666', display: 'flex', alignItems: 'center', gap: '8px' } }, [
                el('span', {}, ['Select user...']),
                el('span', { style: { fontSize: '10px', color: '#999' } }, [`(${usersList.length})`])
            ]),
            el('span', { style: { fontSize: '12px', color: '#999' } }, ['▼'])
        ]);
        
        const userDropdownList = el('div', { 
            style: { 
                display: 'none',
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#fff',
                border: '2px solid #ddd',
                borderRadius: '8px',
                marginTop: '4px',
                maxHeight: '400px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }
        });
        
        // Search input for filtering users
        const userSearchInput = el('input', {
            type: 'text',
            placeholder: 'Hledat uživatele...',
            style: {
                width: '100%',
                padding: '8px 12px',
                border: 'none',
                borderBottom: '1px solid #e0e0e0',
                fontSize: '13px',
                outline: 'none',
                background: '#f8f9fa'
            },
            oninput: function(){
                updateUserDropdown();
            },
            onclick: function(e){
                e.stopPropagation(); // Prevent dropdown from closing
            }
        });
        
        userDropdownWrapper.appendChild(userSelectButton);
        userDropdownWrapper.appendChild(userDropdownList);
        
        // Add user section
        const addUserSection = el('div', { style: { marginBottom: '16px', padding: '16px', background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', borderRadius: '12px', border: '1px solid rgba(11,61,145,0.1)' } });
        const addUserInputWrapper = el('div', { style: { display: 'flex', gap: '8px', marginBottom: '8px' } });
        const addUserInput = el('input', { 
            placeholder: 'Paste user profile URL to add new user', 
            style: { 
                padding: '10px 14px', 
                flex: 1,
                fontSize: '14px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                background: '#fff'
            } 
        });
        const addUserBtn = el('button', { 
            style: { 
                padding: '10px 20px', 
                fontSize: '14px', 
                fontWeight: '600',
                background: '#0b3d91', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(11,61,145,0.2)',
                whiteSpace: 'nowrap'
            },
            onmouseenter: function(){ this.style.background = '#1e5bb8'; this.style.transform = 'translateY(-1px)'; },
            onmouseleave: function(){ this.style.background = '#0b3d91'; this.style.transform = 'translateY(0)'; },
            onclick: async ()=>{
                const url = addUserInput.value.trim();
                if(!url) return;
                try{
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fff3cd';
                    statusDiv.style.color = '#856404';
                    statusDiv.textContent = 'Adding user...';
                    
                    const newUser = await addUser(url);
                    if(newUser){
                        // Reload users and update dropdown
                        await loadUsers();
                        updateUserDropdown();
                        // Enrich new user if needed
                        if(!newUser.name || !newUser.avatarUrl){
                            const profile = await fetchUserProfile(newUser.url);
                            if(profile){
                                newUser.name = profile.name;
                                newUser.avatarUrl = profile.avatarUrl;
                                updateUserDropdown();
                            }
                        }
                        addUserInput.value = '';
                        statusDiv.style.background = '#d4edda';
                        statusDiv.style.color = '#155724';
                        statusDiv.textContent = `✓ User added: ${newUser.name || newUser.url}`;
                    }else{
                        statusDiv.style.background = '#f8d7da';
                        statusDiv.style.color = '#721c24';
                        statusDiv.textContent = 'User already exists or invalid URL';
                    }
                }catch(e){
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = 'Error: ' + (e.message || 'Failed to add user');
                }
            }
        }, ['Add User']);
        addUserInputWrapper.appendChild(addUserInput);
        addUserInputWrapper.appendChild(addUserBtn);
        addUserSection.appendChild(addUserInputWrapper);
        
        // Refresh button to reload users
        const refreshUsersBtn = el('button', {
            style: {
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '500',
                background: '#fff',
                color: '#0b3d91',
                border: '1px solid #0b3d91',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                width: '100%'
            },
            onmouseenter: function(){ this.style.background = '#0b3d91'; this.style.color = '#fff'; },
            onmouseleave: function(){ this.style.background = '#fff'; this.style.color = '#0b3d91'; },
            onclick: async () => {
                try{
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fff3cd';
                    statusDiv.style.color = '#856404';
                    statusDiv.textContent = 'Reloading users...';
                    
                    await loadUsers();
                    updateUserDropdown();
                    
                    // Restart enrichment
                    enrichmentPromise = null;
                    const enrichPromise = enrichUsersWithProfiles(false, (progress) => {
                        updateUserDropdown();
                    });
                    
                    statusDiv.style.background = '#d4edda';
                    statusDiv.style.color = '#155724';
                    statusDiv.textContent = `✓ Reloaded ${usersList.length} users`;
                    
                    enrichPromise.then(() => {
                        updateUserDropdown();
                    });
                }catch(e){
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = 'Error reloading: ' + (e.message || 'Failed');
                }
            }
        }, ['🔄 Reload Users']);
        addUserSection.appendChild(refreshUsersBtn);
        
        let selectedUserUrl = '';
        let progressIndicator = null;
        
        function updateUserDropdown(){
            // Update button with user count (only if not showing selected user)
            if(!selectedUserUrl){
                const buttonSpans = userSelectButton.querySelectorAll('span');
                if(buttonSpans.length > 0 && buttonSpans[0].textContent.includes('Select user')){
                    buttonSpans[0].innerHTML = '';
                    buttonSpans[0].appendChild(el('span', {}, ['Select user...']));
                    if(buttonSpans[0].querySelector('span:last-child')){
                        buttonSpans[0].querySelector('span:last-child').textContent = `(${usersList.length})`;
                    }else{
                        buttonSpans[0].appendChild(el('span', { style: { fontSize: '10px', color: '#999' } }, [`(${usersList.length})`]));
                    }
                }
            }
            
            // Save search term before clearing
            const savedSearch = userSearchInput ? userSearchInput.value : '';
            
            userDropdownList.innerHTML = '';
            
            // Re-add search input
            if(userSearchInput){
                userDropdownList.appendChild(userSearchInput);
                userSearchInput.value = savedSearch;
            }
            
            // Show loading indicator with progress if enriching
            if(enrichmentPromise){
                const progress = enrichmentProgress.total > 0 
                    ? `${enrichmentProgress.loaded}/${enrichmentProgress.total}`
                    : '';
                const progressPercent = enrichmentProgress.total > 0
                    ? Math.round((enrichmentProgress.loaded / enrichmentProgress.total) * 100)
                    : 0;
                
                const loadingContainer = el('div', {
                    style: {
                        padding: '12px',
                        background: '#f8f9fa',
                        borderBottom: '2px solid #0b3d91'
                    }
                });
                
                const loadingText = el('div', {
                    style: {
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#0b3d91',
                        marginBottom: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }
                });
                loadingText.appendChild(el('span', {}, ['Načítání uživatelů...']));
                if(progress) loadingText.appendChild(el('span', { style: { fontSize: '12px', color: '#666' } }, [progress]));
                
                const progressBarContainer = el('div', {
                    style: {
                        width: '100%',
                        height: '6px',
                        background: '#e0e0e0',
                        borderRadius: '3px',
                        overflow: 'hidden'
                    }
                });
                const progressBar = el('div', {
                    style: {
                        width: `${progressPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #0b3d91 0%, #1e5bb8 100%)',
                        transition: 'width 0.3s ease',
                        borderRadius: '3px'
                    }
                });
                progressBarContainer.appendChild(progressBar);
                
                loadingContainer.appendChild(loadingText);
                loadingContainer.appendChild(progressBarContainer);
                
                if(enrichmentProgress.failed.length > 0){
                    const retryBtn = el('button', {
                        style: {
                            marginTop: '8px',
                            padding: '6px 12px',
                            fontSize: '11px',
                            background: '#fff',
                            border: '1px solid #0b3d91',
                            color: '#0b3d91',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600'
                        },
                        onclick: async () => {
                            // Retry failed users
                            const failedUrls = [...enrichmentProgress.failed];
                            enrichmentProgress.failed = [];
                            enrichmentProgress.loaded = enrichmentProgress.total - failedUrls.length;
                            
                            for(const url of failedUrls){
                                const user = usersList.find(u => u.url === url);
                                if(user){
                                    const profile = await fetchUserProfile(url, 2);
                                    if(profile){
                                        user.name = profile.name;
                                        user.avatarUrl = profile.avatarUrl;
                                    }
                                    enrichmentProgress.loaded++;
                                    updateUserDropdown();
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                }
                            }
                            updateUserDropdown();
                        }
                    }, [`Zkusit znovu (${enrichmentProgress.failed.length} selhalo)`]);
                    loadingContainer.appendChild(retryBtn);
                }
                
                userDropdownList.appendChild(loadingContainer);
                progressIndicator = loadingContainer;
            }
            
            // Filter users - show only those that match search or all if no search
            const searchTerm = userSearchInput && userSearchInput.value ? userSearchInput.value.toLowerCase() : '';
            const filteredUsers = searchTerm 
                ? usersList.filter(u => {
                    const name = (u.name || '').toLowerCase();
                    const urlId = (u.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || '').toLowerCase();
                    return name.includes(searchTerm) || urlId.includes(searchTerm) || u.url.toLowerCase().includes(searchTerm);
                })
                : usersList;
            
            if(filteredUsers.length === 0 && searchTerm){
                const noResults = el('div', {
                    style: {
                        padding: '20px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '13px',
                        fontStyle: 'italic'
                    }
                }, ['Žádní uživatelé nenalezeni']);
                userDropdownList.appendChild(noResults);
                return; // Don't render users if no results
            }
            
            filteredUsers.forEach(user => {
                const item = el('div', {
                    style: {
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'background 0.2s'
                    },
                    onmouseenter: (e) => {
                        if(!e.target.closest('.user-item')) return;
                        e.target.closest('.user-item').style.background = '#f5f5f5';
                    },
                    onmouseleave: (e) => {
                        if(!e.target.closest('.user-item')) return;
                        e.target.closest('.user-item').style.background = '#fff';
                    },
                    onclick: async () => {
                        selectedUserUrl = user.url;
                        userDropdownList.style.display = 'none';
                        
                        // Update button
                        userSelectButton.innerHTML = '';
                        if(user.avatarUrl){
                            userSelectButton.appendChild(el('img', { 
                                src: user.avatarUrl, 
                                style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                                alt: ''
                            }));
                        }else{
                            userSelectButton.appendChild(el('div', { 
                                style: { width: '28px', height: '28px', borderRadius: '4px', background: '#e0e0e0', flexShrink: 0 }
                            }));
                        }
                        userSelectButton.appendChild(el('span', {}, [user.name || 'Loading...']));
                        
                        // Fetch name if not cached
                        if(!user.name || !user.avatarUrl){
                            statusDiv.style.display = 'block';
                            statusDiv.style.background = '#fff3cd';
                            statusDiv.style.color = '#856404';
                            statusDiv.textContent = 'Loading user info...';
                            
                            const userInfo = await fetchUserProfile(user.url);
                            if(userInfo){
                                user.name = userInfo.name;
                                user.avatarUrl = userInfo.avatarUrl;
                                updateUserDropdown();
                                // Update button again with new data
                                userSelectButton.innerHTML = '';
                                if(user.avatarUrl){
                                    userSelectButton.appendChild(el('img', { 
                                        src: user.avatarUrl, 
                                        style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                                        alt: ''
                                    }));
                                }else{
                                    userSelectButton.appendChild(el('div', { 
                                        style: { width: '28px', height: '28px', borderRadius: '4px', background: '#e0e0e0', flexShrink: 0 }
                                    }));
                                }
                                userSelectButton.appendChild(el('span', {}, [user.name || user.url]));
                            }
                            statusDiv.style.display = 'none';
                        }
                        
                        // Fill form fields
                        player.value = user.name || '';
                        playerUrl.value = user.url;
                    }
                });
                item.className = 'user-item';
                
                // Avatar
                if(user.avatarUrl){
                    const avatarImg = el('img', { 
                        src: user.avatarUrl, 
                        style: { width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 },
                        alt: '',
                        onerror: function(){
                            // Fallback if image fails to load
                            this.style.display = 'none';
                            const placeholder = el('div', { 
                                style: { width: '32px', height: '32px', borderRadius: '4px', background: '#e0e0e0', flexShrink: 0 }
                            });
                            this.parentNode.replaceChild(placeholder, this);
                        }
                    });
                    item.appendChild(avatarImg);
                }else{
                    item.appendChild(el('div', { 
                        style: { width: '32px', height: '32px', borderRadius: '4px', background: '#e0e0e0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#999' },
                        textContent: '?'
                    }));
                }
                
                // Name or URL
                const displayName = user.name || (user.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || user.url);
                item.appendChild(el('span', { style: { flex: 1, color: user.name ? '#333' : '#999', fontStyle: user.name ? 'normal' : 'italic' } }, [displayName]));
                userDropdownList.appendChild(item);
            });
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if(!userDropdownWrapper.contains(e.target)){
                userDropdownList.style.display = 'none';
            }
        });
        
        // Load users on open and enrich with profiles
        loadUsers().then(async () => {
            updateUserDropdown();
            // Start enriching users in background with progress updates
            const enrichPromise = enrichUsersWithProfiles(false, (progress) => {
                updateUserDropdown();
            });
            
            // Update dropdown periodically while enriching
            const updateInterval = setInterval(() => {
                if(!enrichmentPromise){
                    clearInterval(updateInterval);
                }else{
                    updateUserDropdown();
                }
            }, 500);
            
            enrichPromise.then(() => {
                clearInterval(updateInterval);
                updateUserDropdown();
            });
        });
        
        // Optional manual override fields (collapsed by default)
        const advancedToggle = el('button', { 
            style: { 
                padding: '10px 16px', 
                marginBottom: '12px', 
                fontSize: '13px', 
                fontWeight: '500',
                background: '#fff', 
                border: '1px solid #ddd', 
                borderRadius: '8px', 
                cursor: 'pointer',
                color: '#666',
                transition: 'all 0.2s ease',
                width: '100%',
                textAlign: 'left'
            },
            onmouseenter: function(){ this.style.background = '#f8f9fa'; this.style.borderColor = '#0b3d91'; },
            onmouseleave: function(){ this.style.background = '#fff'; this.style.borderColor = '#ddd'; },
            onclick: () => {
                advancedSection.style.display = advancedSection.style.display === 'none' ? 'block' : 'none';
                advancedToggle.textContent = advancedSection.style.display === 'none' ? 'Show advanced fields' : 'Hide advanced fields';
            }
        }, ['Show advanced fields']);
        
        const advancedSection = el('div', { style: { display: 'none', marginBottom: '12px', padding: '16px', background: '#f8f9fa', borderRadius: '10px', border: '1px solid #e0e0e0' } });
        const inputStyle = { 
            padding: '10px 14px', 
            width: '100%', 
            marginBottom: '12px', 
            fontSize: '14px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#fff',
            transition: 'border-color 0.2s ease'
        };
        const rank = el('input', { 
            placeholder: 'Rank (auto-detected)', 
            style: inputStyle,
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#ddd'; }
        });
        const player = el('input', { 
            placeholder: 'Player name (from user selection)', 
            style: inputStyle,
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#ddd'; }
        });
        const playerUrl = el('input', { 
            placeholder: 'Player URL (from user selection)', 
            style: inputStyle,
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#ddd'; }
        });
        const resultLabel = el('input', { 
            placeholder: 'Result/Score (auto-detected)', 
            style: inputStyle,
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#ddd'; }
        });
        const resultUrl = el('input', { 
            placeholder: 'Result URL (auto-detected)', 
            style: inputStyle,
            onfocus: function(){ this.style.borderColor = '#0b3d91'; },
            onblur: function(){ this.style.borderColor = '#ddd'; }
        });
        advancedSection.appendChild(rank);
        advancedSection.appendChild(player);
        advancedSection.appendChild(playerUrl);
        advancedSection.appendChild(resultLabel);
        advancedSection.appendChild(resultUrl);
        
        const btnProcess = el('button', { 
            style: { 
                padding: '12px 24px', 
                fontSize: '16px', 
                fontWeight: '600', 
                background: '#0b3d91', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '10px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(11,61,145,0.25)',
                flex: '1'
            },
            onmouseenter: function(){ this.style.background = '#1e5bb8'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 4px 12px rgba(11,61,145,0.35)'; },
            onmouseleave: function(){ this.style.background = '#0b3d91'; this.style.transform = 'translateY(0)'; this.style.boxShadow = '0 2px 8px rgba(11,61,145,0.25)'; }, 
            onclick: async ()=>{
                try{
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fff3cd';
                    statusDiv.style.color = '#856404';
                    statusDiv.textContent = 'Processing...';
                    
                    const inputText = mainInput.value.trim();
                    if(!inputText){ 
                        statusDiv.style.background = '#f8d7da';
                        statusDiv.style.color = '#721c24';
                        statusDiv.textContent = 'Please paste a game URL';
                        return; 
                    }
                    
                    const data = await parseAndFetchGameData(inputText);
                    
                    if(data.error){
                        statusDiv.style.background = '#f8d7da';
                        statusDiv.style.color = '#721c24';
                        statusDiv.textContent = 'Error: ' + data.error;
                        return;
                    }
                    
                    // Fill in fields
                    if(data.rank) rank.value = data.rank;
                    if(data.resultLabel) resultLabel.value = data.resultLabel;
                    if(data.resultUrl) resultUrl.value = data.resultUrl;
                    
                    // Try to match player URL with users list
                    if(data.playerUrl){
                        const matchedUser = usersList.find(u => u.url === data.playerUrl);
                        if(matchedUser){
                            selectedUserUrl = matchedUser.url;
                            // Update dropdown button
                            userSelectButton.innerHTML = '';
                            if(matchedUser.avatarUrl){
                                userSelectButton.appendChild(el('img', { 
                                    src: matchedUser.avatarUrl, 
                                    style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                                    alt: ''
                                }));
                            }
                            userSelectButton.appendChild(el('span', {}, [matchedUser.name || matchedUser.url]));
                            player.value = matchedUser.name || '';
                            playerUrl.value = matchedUser.url;
                        }else{
                            // User not in list, fill manually
                            player.value = data.player || '';
                            playerUrl.value = data.playerUrl;
                        }
                    }
                    
                    statusDiv.style.background = '#d4edda';
                    statusDiv.style.color = '#155724';
                    const modeText = data.mode ? ` [${data.mode}]` : '';
                    statusDiv.textContent = `✓ Loaded: ${data.resultLabel || 'N/A'}${modeText}`;
                }catch(err){ 
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = 'Error: ' + (err.message || 'Failed to process');
                    console.error(err);
                }
            } 
        }, ['Process & Auto-fill']);
        
        const btnSave = el('button', { 
            style: { 
                padding: '12px 24px', 
                fontSize: '16px', 
                fontWeight: '600', 
                background: '#28a745', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '10px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(40,167,69,0.25)',
                flex: '1'
            },
            onmouseenter: function(){ this.style.background = '#34ce57'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 4px 12px rgba(40,167,69,0.35)'; },
            onmouseleave: function(){ this.style.background = '#28a745'; this.style.transform = 'translateY(0)'; this.style.boxShadow = '0 2px 8px rgba(40,167,69,0.25)'; }, 
            onclick: async ()=>{
                try{
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#fff3cd';
                    statusDiv.style.color = '#856404';
                    statusDiv.textContent = 'Saving...';
                    
                    // Use selected user URL if available, otherwise use manual input
                    const finalPlayerUrl = selectedUserUrl || playerUrl.value || '';
                    const finalPlayer = player.value || '';
                    
                    await saveEdit(ref, { 
                        rank: rank.value || '', 
                        player: finalPlayer, 
                        playerUrl: finalPlayerUrl, 
                        resultLabel: resultLabel.value || '', 
                        resultUrl: resultUrl.value || '' 
                    });
                    
                    statusDiv.style.background = '#d4edda';
                    statusDiv.style.color = '#155724';
                    statusDiv.textContent = '✓ Saved successfully!';
                    
                    setTimeout(() => {
                        removeRoot();
                        try{ window.dispatchEvent(new Event('gg-refresh-data')); }catch(_){ location.reload(); }
                    }, 1000);
                }catch(err){
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = 'Error saving: ' + (err.message || 'Failed');
                    console.error(err);
                }
            } 
        }, ['Save']);
        
        const btnClose = el('button', { 
            style: { 
                padding: '12px 24px', 
                fontSize: '16px', 
                fontWeight: '500',
                background: '#6c757d', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '10px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(108,117,125,0.25)',
                flex: '1'
            },
            onmouseenter: function(){ this.style.background = '#5a6268'; this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 4px 12px rgba(108,117,125,0.35)'; },
            onmouseleave: function(){ this.style.background = '#6c757d'; this.style.transform = 'translateY(0)'; this.style.boxShadow = '0 2px 8px rgba(108,117,125,0.25)'; }, 
            onclick: ()=> removeRoot() 
        }, ['Cancel']);

        const adminCard = el('div', { 
            style: { 
                maxWidth: '800px', 
                margin: '0 auto', 
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)', 
                color: '#111', 
                borderRadius: '20px', 
                padding: '32px', 
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid rgba(11,61,145,0.1)'
            } 
        });
        
        const cardHeader = el('div', { 
            style: { 
                marginBottom: '24px', 
                paddingBottom: '20px', 
                borderBottom: '2px solid rgba(11,61,145,0.1)' 
            } 
        });
        cardHeader.appendChild(title);
        cardHeader.appendChild(info);
        adminCard.appendChild(cardHeader);
        
        adminCard.appendChild(statusDiv);
        
        const formSection = el('div', { style: { marginBottom: '20px' } });
        formSection.appendChild(el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '10px', 
                fontWeight: '600', 
                fontSize: '15px',
                color: '#333'
            } 
        }, ['Game URL + Info:']));
        formSection.appendChild(mainInput);
        adminCard.appendChild(formSection);
        
        const userSection = el('div', { style: { marginBottom: '20px' } });
        userSection.appendChild(el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '10px', 
                marginTop: '20px', 
                fontWeight: '600', 
                fontSize: '15px',
                color: '#333'
            } 
        }, ['Select User:']));
        userSection.appendChild(userDropdownWrapper);
        adminCard.appendChild(userSection);
        
        adminCard.appendChild(addUserSection);
        adminCard.appendChild(advancedToggle);
        adminCard.appendChild(advancedSection);
        
        const buttonGroup = el('div', { 
            style: { 
                marginTop: '24px', 
                display: 'flex', 
                gap: '12px', 
                flexWrap: 'wrap',
                paddingTop: '20px',
                borderTop: '1px solid rgba(0,0,0,0.1)'
            } 
        });
        buttonGroup.appendChild(btnProcess);
        buttonGroup.appendChild(btnSave);
        buttonGroup.appendChild(btnClose);
        adminCard.appendChild(buttonGroup);
        
        root.appendChild(adminCard);
    }

    async function fetchNextData(url){
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
        const html = await res.text();
        const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if(!m) {
            console.warn('No __NEXT_DATA__ found in HTML for:', url);
            return null;
        }
        const data = JSON.parse(m[1]);
        
        // Also try to extract player info from HTML as additional source
        // Sometimes player name is in page title or meta tags
        const htmlPlayerMatch = html.match(/<title>([^<]+)\s*-\s*GeoGuessr/i) ||
                              html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
        if(htmlPlayerMatch && htmlPlayerMatch[1]) {
            const htmlPlayer = htmlPlayerMatch[1].trim();
            // Store in a custom property for later use
            if(!data._htmlPlayer) data._htmlPlayer = htmlPlayer;
        }
        
        return data;
    }

    function detectGameModeFromAPI(data){
        // Try to detect game mode from API data
        const jsonStr = JSON.stringify(data);
        
        // Check for game mode settings in the API response
        // NMPZ = No Move, No Pan, No Zoom
        // NM = No Move (but can pan/zoom)
        // Moving = Can move
        
        // Look for forbidMoving, forbidRotating, forbidZooming flags
        const forbidMoving = jsonStr.match(/"forbidMoving":\s*(true|false)/);
        const forbidRotating = jsonStr.match(/"forbidRotating":\s*(true|false)/);
        const forbidZooming = jsonStr.match(/"forbidZooming":\s*(true|false)/);
        
        // Check game mode string directly
        const modeMatch = jsonStr.match(/"mode":"([^"]+)"/);
        const gameMode = modeMatch ? modeMatch[1].toUpperCase() : null;
        
        // Check for "noMove" or "nmpz" in various fields
        const noMoveMatch = jsonStr.match(/"noMove":\s*(true|false)/);
        const noPanMatch = jsonStr.match(/"noPan":\s*(true|false)/);
        const noZoomMatch = jsonStr.match(/"noZoom":\s*(true|false)/);
        
        // Determine mode based on flags
        if(forbidMoving && forbidMoving[1] === 'true'){
            if((forbidRotating && forbidRotating[1] === 'true') || (forbidZooming && forbidZooming[1] === 'true')){
                return 'NMPZ'; // No move + no pan/zoom = NMPZ
            }
            return 'NM'; // No move but can pan/zoom = NM
        }
        
        // Check alternative flag names
        if(noMoveMatch && noMoveMatch[1] === 'true'){
            if((noPanMatch && noPanMatch[1] === 'true') || (noZoomMatch && noZoomMatch[1] === 'true')){
                return 'NMPZ';
            }
            return 'NM';
        }
        
        // Check game mode string
        if(gameMode){
            if(gameMode.includes('NMPZ') || gameMode.includes('NO_MOVE_NO_PAN_NO_ZOOM')){
                return 'NMPZ';
            }
            if(gameMode.includes('NM') || gameMode.includes('NO_MOVE') || gameMode.includes('NO_MOVE_PAN_ZOOM')){
                return 'NM';
            }
            if(gameMode.includes('MOVING') || gameMode.includes('CLASSIC')){
                return 'MOVING';
            }
        }
        
        return null;
    }
    
    function detectGameModeFromText(text){
        if(!text) return null;
        
        const upperText = text.toUpperCase();
        
        // More comprehensive pattern matching
        // Check for NMPZ first (most specific)
        if(/\bNMPZ\b/.test(upperText) || /\bNO\s*MOVE\s*NO\s*PAN\s*NO\s*ZOOM\b/.test(upperText)){
            return 'NMPZ';
        }
        
        // Check for NM (but not NMPZ)
        if(/\bNM\b/.test(upperText) && !/\bNMPZ\b/.test(upperText)){
            // Make sure it's not part of a word
            const nmMatch = upperText.match(/\bNM\b/);
            if(nmMatch){
                // Check if it's followed by PZ (would be NMPZ)
                const afterNM = upperText.substring(upperText.indexOf(nmMatch[0]) + 2).trim();
                if(!afterNM.startsWith('PZ')){
                    return 'NM';
                }
            }
        }
        
        // Check for "No Move" but not "No Move No Pan No Zoom"
        if(/\bNO\s*MOVE\b/.test(upperText) && !/\bNO\s*MOVE\s*NO\s*PAN\s*NO\s*ZOOM\b/.test(upperText)){
            return 'NM';
        }
        
        // Check for Moving or 25K
        if(/\bMOVING\b/.test(upperText) || /\b25K\b/.test(upperText) || /\b25\s*K\b/.test(upperText)){
            return 'MOVING';
        }
        
        return null;
    }

    async function parseAndFetchGameData(inputText){
        try{
            // Parse input: extract URL and optional text
            const urlMatch = inputText.match(/https?:\/\/[^\s]+/);
            if(!urlMatch) return { error: 'No valid URL found' };
            
            let gameUrl = urlMatch[0];
            const restText = inputText.replace(urlMatch[0], '').trim();
            
            // Check if it's already a result URL
            let isResultUrl = gameUrl.includes('/results/');
            let resultUrl = isResultUrl ? gameUrl : null;
            
            // Extract game ID from URL
            const gameIdMatch = gameUrl.match(/\/(game|results)\/([a-zA-Z0-9]+)/);
            if(!gameIdMatch) return { error: 'Invalid game URL format' };
            const gameId = gameIdMatch[2];
            
            let data = null;
            let jsonStr = '';
            
            // Try result URL first if not already one
            if(!isResultUrl) {
                const possibleResultUrl = `https://www.geoguessr.com/results/${gameId}`;
                try {
                    const resultData = await fetchNextData(possibleResultUrl);
                    if(resultData && resultData.props?.pageProps && 
                       !resultData.props.pageProps.errorMessage && 
                       !resultData.props.pageProps.statusCode) {
                        data = resultData;
                        jsonStr = JSON.stringify(data);
                        resultUrl = possibleResultUrl;
                    }
                } catch(e) {
                    // Fallback to game URL
                }
            }
            
            // Fallback to game URL if result URL didn't work
            if(!data) {
                data = await fetchNextData(gameUrl);
                if(data) {
                    jsonStr = JSON.stringify(data);
                }
            }
            
            if(!data) {
                return { error: 'Failed to fetch game data' };
            }
            
            // Extract score/time
            let resultLabel = null;
            const totalPointsMatch = jsonStr.match(/"totalPoints":\s*(\d{3,6})/);
            if(totalPointsMatch) {
                resultLabel = totalPointsMatch[1];
            } else {
                const timeMatch = jsonStr.match(/"time":\s*"(\d{2}:\d{2}:\d{2})"/);
                if(timeMatch) resultLabel = timeMatch[1];
            }
            
            // Extract map info
            let mapName = null, mapSlug = null, mapUrl = null;
            const mapMatch = jsonStr.match(/"mapName":"([^"]+)"/);
            if(mapMatch) mapName = mapMatch[1];
            const mapSlugMatch = jsonStr.match(/"mapSlug":"([^"]+)"/);
            if(mapSlugMatch) {
                mapSlug = mapSlugMatch[1];
                mapUrl = `https://www.geoguessr.com/maps/${mapSlug}`;
            }
            
            // Detect game mode from API data
            let detectedMode = detectGameModeFromAPI(data);
            
            // Parse optional text for map name, mode, score override
            let parsedMapName = mapName;
            let parsedMode = detectedMode;
            let parsedScore = resultLabel;
            
            if(restText){
                // Detect mode from text (override API if found)
                const textMode = detectGameModeFromText(restText);
                if(textMode) parsedMode = textMode;
                
                // Try to extract map name and score from text
                const parts = restText.split(/\s+/);
                
                // Find mode position in text
                let modeIndex = -1;
                for(let i = 0; i < parts.length; i++){
                    const partUpper = parts[i].toUpperCase();
                    if(partUpper === 'NMPZ' || partUpper === 'NM' || partUpper === 'MOVING' || partUpper === '25K'){
                        modeIndex = i;
                        break;
                    }
                }
                
                if(modeIndex >= 0){
                    // Score might be before or after mode
                    if(modeIndex > 0 && /^\d+$/.test(parts[modeIndex - 1])) parsedScore = parts[modeIndex - 1];
                    if(modeIndex < parts.length - 1 && /^\d+$/.test(parts[modeIndex + 1])) parsedScore = parts[modeIndex + 1];
                    // Map name is everything before mode
                    parsedMapName = parts.slice(0, modeIndex).join(' ') || mapName;
                } else {
                    // If no mode found, check if last part is a number (score)
                    if(parts.length > 0 && /^\d+$/.test(parts[parts.length - 1])){
                        parsedScore = parts[parts.length - 1];
                        parsedMapName = parts.slice(0, -1).join(' ') || mapName;
                    } else {
                        parsedMapName = restText;
                    }
                }
            }
            
            // Use resultUrl if we found it, otherwise use gameUrl
            const finalResultUrl = resultUrl || gameUrl;
            
            return {
                rank: '', // Will be auto-assigned
                player: '', // User will select from dropdown
                playerUrl: '', // User will select from dropdown
                resultLabel: parsedScore || resultLabel || '',
                resultUrl: finalResultUrl,
                mapName: parsedMapName || mapName,
                mapUrl: mapUrl,
                mode: parsedMode
            };
        }catch(err){
            console.error('parseAndFetchGameData error:', err);
            return { error: err.message || 'Failed to parse game data' };
        }
    }

    async function saveEdit(ref, payload){
        // 1) Fetch current JSON
        const owner = 'filipjarolim';
        const repo = 'Geoguessr-cesko-Rekordy';
        const branch = 'main';
        
        function getGitHubTokenLocal(){
            return localStorage.getItem('gg_pat') || 
                   (typeof window !== 'undefined' && window.GITHUB_TOKEN) ||
                   '';
        }
        
        const token = getGitHubTokenLocal();
        if(!token){ alert('Missing GitHub token. Provide it via URL (#admin&token=YOUR_TOKEN) or set window.GITHUB_TOKEN in console'); throw new Error('No token'); }
        
        // Verify token has basic format (GitHub tokens are usually 40+ chars for classic tokens, or start with ghp_/gho_/ghu_/ghs_/ghr_ for fine-grained)
        if(token.length < 20) {
            throw new Error('Token seems too short. GitHub tokens are usually 40+ characters for classic tokens, or start with ghp_/gho_/ghu_/ghs_/ghr_ for fine-grained tokens. Please check your token.');
        }
        
        // Test token permissions before proceeding
        async function testTokenPermissions(){
            try {
                const testUrl = `https://api.github.com/repos/${owner}/${repo}`;
                const testRes = await fetch(testUrl, { 
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github.v3+json'
                    } 
                });
                
                if(testRes.status === 401) {
                    throw new Error('Token is invalid or expired. Please generate a new token.');
                }
                
                if(testRes.status === 403) {
                    throw new Error('Token lacks required permissions. Token needs "repo" scope (includes contents:write). Go to https://github.com/settings/tokens to update permissions.');
                }
                
                if(!testRes.ok) {
                    const errorText = await testRes.text();
                    throw new Error(`Cannot access repository: ${testRes.status} ${errorText.substring(0, 100)}`);
                }
                
                const repoData = await testRes.json();
                console.log('✅ Token verified, repository access confirmed:', repoData.full_name);
                return true;
            } catch(e) {
                console.error('Token verification failed:', e.message);
                throw e;
            }
        }

        async function ghGet(path){
            // URL encode the path properly
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
            console.log('GitHub API GET:', url);
            console.log('Repository:', `${owner}/${repo}`, 'Branch:', branch);
            console.log('Token present:', !!token, 'Token length:', token ? token.length : 0);
            
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
            if(!r.ok) {
                const errorText = await r.text();
                console.error('GitHub API error:', r.status, errorText);
                let errorMsg = `GET failed: ${r.status} ${r.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    if(errorJson.message) errorMsg += `. ${errorJson.message}`;
                    // Provide helpful suggestions
                    if(r.status === 404) {
                        errorMsg += `\n\nPossible issues:\n`;
                        errorMsg += `- File doesn't exist at path: ${path}\n`;
                        errorMsg += `- File not committed to GitHub\n`;
                        errorMsg += `- Wrong branch (current: ${branch})\n`;
                        errorMsg += `- Token doesn't have access to repository\n`;
                        errorMsg += `\nTry: git add ${path} && git commit -m "Add file" && git push`;
                    }
                } catch(e) {
                    errorMsg += `. ${errorText.substring(0, 200)}`;
                }
                throw new Error(errorMsg);
            }
            return await r.json();
        }
        async function ghPut(path, content, sha, message){
            // URL encode the path properly
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
            console.log('GitHub API PUT:', url, 'SHA:', sha || '(new file)');
            
            const body = { 
                message, 
                content: btoa(unescape(encodeURIComponent(content))), 
                branch 
            };
            
            // Only include SHA if file exists (for update), omit for new file creation
            if(sha) {
                body.sha = sha;
            }
            
            const r = await fetch(url, { 
                method: 'PUT', 
                headers: { 
                    'Content-Type': 'application/json', 
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github.v3+json'
                }, 
                body: JSON.stringify(body) 
            });
            
            if(!r.ok) {
                const errorText = await r.text();
                console.error('GitHub API PUT error:', r.status, errorText);
                let errorMsg = `PUT failed: ${r.status} ${r.statusText}`;
                try {
                    const errorJson = JSON.parse(errorText);
                    if(errorJson.message) errorMsg += `. ${errorJson.message}`;
                    
                    // Provide helpful suggestions for 403 errors
                    if(r.status === 403) {
                        errorMsg += `\n\n🔒 Permission Error (403):\n`;
                        errorMsg += `Your GitHub token doesn't have the required permissions.\n\n`;
                        errorMsg += `Required permissions:\n`;
                        errorMsg += `- ✅ repo (Full control of private repositories)\n`;
                        errorMsg += `- ✅ contents:write (Write access to repository contents)\n\n`;
                        errorMsg += `How to fix:\n`;
                        errorMsg += `1. Go to: https://github.com/settings/tokens\n`;
                        errorMsg += `2. Create a new token or edit existing one\n`;
                        errorMsg += `3. Select scope: "repo" (includes contents:write)\n`;
                        errorMsg += `4. Copy the new token\n`;
                        errorMsg += `5. Update token in admin panel or set window.GITHUB_TOKEN\n\n`;
                        errorMsg += `Current token: ${token.substring(0, 10)}... (length: ${token.length})`;
                    }
                } catch(e) {
                    errorMsg += `. ${errorText.substring(0, 200)}`;
                }
                throw new Error(errorMsg);
            }
            return await r.json();
        }
        async function fetchNextDataLocal(url){
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
            const html = await res.text();
            const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            if(!m) return null;
            return JSON.parse(m[1]);
        }

        // Test token permissions first
        try {
            await testTokenPermissions();
        } catch(e) {
            alert(`🔒 Token Error: ${e.message}\n\nPlease check your GitHub token:\n1. Go to https://github.com/settings/tokens\n2. Ensure token has "repo" scope\n3. Update token in admin panel`);
            throw e;
        }

        // Try to get the file - handle both encoded and direct paths
        let base;
        let filePath = 'data/leaderboards.json';
        let fileExists = false;
        let json = null;
        
        try {
            base = await ghGet(filePath);
            fileExists = true;
            if(base && base.content) {
                json = JSON.parse(decodeURIComponent(escape(atob(base.content))));
            }
        } catch(e) {
            // If 404, try alternative paths or fallback to local file
            console.warn('Failed to get data/leaderboards.json from GitHub:', e.message);
            if(e.message.includes('404')) {
                // File doesn't exist, try alternative path
                try {
                    base = await ghGet('leaderboards.json');
                    filePath = 'leaderboards.json';
                    fileExists = true;
                    if(base && base.content) {
                        json = JSON.parse(decodeURIComponent(escape(atob(base.content))));
                    }
                } catch(e2) {
                    // File doesn't exist in GitHub - try to load from local file as fallback
                    console.warn('File not found in GitHub, trying local fallback...');
                    try {
                        const localResponse = await fetch('data/leaderboards.json');
                        if(localResponse.ok) {
                            json = await localResponse.json();
                            console.log('Loaded from local file as fallback');
                            // Create base object for saving (will create new file in GitHub)
                            base = {
                                content: null,
                                sha: null
                            };
                            fileExists = false;
                        } else {
                            throw new Error('Local file also not found');
                        }
                    } catch(localError) {
                        // File doesn't exist at all - create empty structure
                        console.log('No file found anywhere, creating new empty structure...');
                        json = { groups: [] };
                        base = {
                            content: null,
                            sha: null
                        };
                        fileExists = false;
                    }
                }
            } else {
                // Not a 404 error - try local fallback
                console.warn('GitHub API error (not 404), trying local fallback...');
                try {
                    const localResponse = await fetch('data/leaderboards.json');
                    if(localResponse.ok) {
                        json = await localResponse.json();
                        console.log('Loaded from local file as fallback');
                        base = {
                            content: null,
                            sha: null
                        };
                        fileExists = false;
                    } else {
                        throw e; // Re-throw original error
                    }
                } catch(localError) {
                    throw e; // Re-throw original error
                }
            }
        }
        
        // Ensure we have valid JSON
        if(!json || typeof json !== 'object') {
            console.warn('Invalid JSON, creating empty structure');
            json = { groups: [] };
        }
        
        // Ensure groups array exists
        if(!json.groups || !Array.isArray(json.groups)) {
            json.groups = [];
        }
        
        // Try to find group, create if not found
        let group = json.groups.find(g => g.id === ref.groupId);
        if(!group) {
            console.warn(`Group "${ref.groupId}" not found, creating it...`);
            group = { id: ref.groupId, header: ref.groupId, cards: [] };
            json.groups.push(group);
        }
        
        // Ensure cards array exists
        if(!group.cards || !Array.isArray(group.cards)) {
            group.cards = [];
        }
        
        // Try to find card, create if not found
        let card = group.cards[ref.cardIndex];
        if(!card) {
            console.warn(`Card at index ${ref.cardIndex} not found, creating it...`);
            // Fill up to the required index
            while(group.cards.length <= ref.cardIndex) {
                group.cards.push({ title: 'New Card', entries: [] });
            }
            card = group.cards[ref.cardIndex];
        }
        
        // Ensure entries array exists
        if(!card.entries || !Array.isArray(card.entries)) {
            card.entries = [];
        }
        
        // Update card mapUrl if resultUrl contains map info (extract from game URL)
        if(payload.resultUrl){
            try{
                const gameUrl = payload.resultUrl;
                const data = await fetchNextDataLocal(gameUrl);
                if(data){
                    const jsonStr = JSON.stringify(data);
                    const mapSlugMatch = jsonStr.match(/"mapSlug":"([^"]+)"/);
                    if(mapSlugMatch && !card.mapUrl){
                        card.mapUrl = `https://www.geoguessr.com/maps/${mapSlugMatch[1]}`;
                    }
                }
            }catch(_){ /* ignore map URL update errors */ }
        }
        
        if(ref.entryIndex != null){
            card.entries[ref.entryIndex] = Object.assign({}, card.entries[ref.entryIndex], payload);
        } else {
            card.entries = card.entries || [];
            // Auto-assign rank if not provided
            if(!payload.rank && card.entries.length > 0){
                const lastRank = card.entries[card.entries.length - 1].rank;
                const rankNum = parseInt(lastRank) || card.entries.length;
                payload.rank = `${rankNum + 1}.`;
            } else if(!payload.rank){
                payload.rank = '1.';
            }
            card.entries.push(payload);
        }

        // Save leaderboards - use the same path that worked for GET
        const savePath = base.path || filePath || 'data/leaderboards.json';
        const updatedLeaderboards = JSON.stringify(json, null, 2);
        console.log('Saving to:', savePath, 'SHA:', base.sha || '(new file)');
        
        // If file doesn't exist (no SHA), create it; otherwise update it
        const res1 = await ghPut(savePath, updatedLeaderboards, base.sha, 'chore(admin): edit entry');

        // Update enrichedLeaderboards.json to sync with changes
        try {
            let enrichedBase = null;
            let enrichedSha = null;
            try {
                enrichedBase = await ghGet('data/enrichedLeaderboards.json');
                enrichedSha = enrichedBase.sha;
            } catch(e) {
                console.warn('enrichedLeaderboards.json not found, will create new');
            }
            
            const enriched = await (async ()=>{
                if(enrichedBase && enrichedBase.content) {
                    const ej = JSON.parse(decodeURIComponent(escape(atob(enrichedBase.content))));
                    ej.groups = json.groups; // replace groups; enrichment will occur on next build or client.
                    ej.generatedAt = new Date().toISOString();
                    return JSON.stringify(ej, null, 2);
                } else {
                    // Create new enriched structure
                    return JSON.stringify({
                        generatedAt: new Date().toISOString(),
                        source: 'https://www.geoguessr.com',
                        groups: json.groups
                    }, null, 2);
                }
            })();
            await ghPut('data/enrichedLeaderboards.json', enriched, enrichedSha, 'chore(admin): sync enriched');
        } catch(e){ 
            console.warn('Failed to update enrichedLeaderboards.json:', e.message);
        }
        
        // Clear cache and reload page data
        try {
            localStorage.removeItem('gg_cache');
            localStorage.removeItem('gg_cache_time');
            console.log('✅ Cache cleared, page will reload fresh data');
        } catch(_){}
        
        // Try to update local file using File System Access API
        try {
            if('showOpenFilePicker' in window){
                // Ask user to select the file to update
                try {
                    const [fileHandle] = await window.showOpenFilePicker({
                        types: [{
                            description: 'JSON files',
                            accept: { 'application/json': ['.json'] }
                        }],
                        multiple: false,
                        excludeAcceptAllOption: false
                    });
                    
                    // Write to file
                    const writable = await fileHandle.createWritable();
                    await writable.write(updatedLeaderboards);
                    await writable.close();
                    
                    console.log('✅ Lokální soubor aktualizován!');
                    showSuccessNotification('✅ Lokální soubor aktualizován!');
                }catch(pickerError){
                    if(pickerError.name === 'AbortError'){
                        console.log('Uživatel zrušil výběr souboru - soubor nebyl lokálně aktualizován');
                    }else{
                        console.warn('Chyba při aktualizaci lokálního souboru:', pickerError);
                    }
                }
            }else if('showSaveFilePicker' in window){
                // Fallback: save file picker (for older browsers)
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: 'leaderboards.json',
                        types: [{
                            description: 'JSON files',
                            accept: { 'application/json': ['.json'] }
                        }]
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(updatedLeaderboards);
                    await writable.close();
                    
                    console.log('✅ Lokální soubor uložen!');
                    showSuccessNotification('✅ Lokální soubor uložen!');
                }catch(pickerError){
                    if(pickerError.name !== 'AbortError'){
                        console.warn('Chyba při ukládání lokálního souboru:', pickerError);
                    }
                }
            }else{
                console.log('File System Access API není dostupné v tomto prohlížeči');
            }
        }catch(fileError){
            // File save failed - that's okay, GitHub is updated
            console.warn('Nepodařilo se aktualizovat lokální soubor:', fileError);
        }
        
        // Show success notification
        showSuccessNotification('✅ Changes saved successfully! Page will refresh...');
        
        // Reload page after short delay to show new data
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    }
    function activateAdminMode(){
        if(isAdminAuthenticated()){
            bindContextMenu();
            showAdminIndicator();
            console.log('✅ Admin mode activated automatically');
        }
    }

    function showAdminIndicator(){
        // Remove existing indicator if present
        const existing = document.getElementById('admin-mode-indicator');
        if(existing) existing.remove();
        
        // Create admin indicator
        const indicator = document.createElement('div');
        indicator.id = 'admin-mode-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        indicator.innerHTML = `
            <span>🔧 Admin Mode Active</span>
            <button style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" onclick="document.getElementById('admin-mode-indicator').remove(); localStorage.removeItem('gg_admin_data'); localStorage.removeItem('gg_admin_ok'); location.reload();">Logout</button>
        `;
        document.body.appendChild(indicator);
        
        // Auto-hide after 5 seconds, but show on hover
        let hideTimeout;
        indicator.addEventListener('mouseenter', () => {
            clearTimeout(hideTimeout);
            indicator.style.opacity = '1';
        });
        indicator.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                indicator.style.opacity = '0.7';
            }, 2000);
        });
    }

    function boot(){
        if(location.hash === '#admin'){
            if(isAdminAuthenticated()) uiApp();
            else uiLogin(uiApp);
        } else {
            removeRoot();
            // Auto-activate admin mode if authenticated (even without #admin hash)
            activateAdminMode();
        }
    }

    document.addEventListener('DOMContentLoaded', boot);
    window.addEventListener('hashchange', boot);
    
    // Intercept Admin button click - now just opens admin UI or login
    document.addEventListener('click', (e)=>{
        const link = e.target.closest('.admin-button a');
        if(!link) return;
        e.preventDefault();
        if(isAdminAuthenticated()){ 
            // Already authenticated, just show admin UI
            location.hash = '#admin';
        } else {
            // Not authenticated, show login
            uiLogin(()=>{ 
                bindContextMenu(); 
                showAdminIndicator();
                removeRoot(); 
                location.hash = '#admin';
            });
        }
    });
})();
