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

    // Detect variant from card title (same logic as ui.js)
    function detectVariant(card){
        const t = (card.title || '').toLowerCase();
        if (t.includes('nmpz')) return 'NMPZ';
        if (t.includes('nm') || t.includes('no move')) return 'NM';
        if (t.includes('moving') || t.includes('25k')) return 'MOVING';
        return 'OTHER';
    }

    function getRoot(){
        let root = document.getElementById('admin-root');
        if(!root){
            root = document.createElement('div');
            root.id = 'admin-root';
            Object.assign(root.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', zIndex: '100000', overflow: 'auto', padding: '40px 20px' });
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
        // Show maintenance overlay after logout
        showMaintenanceOverlay();
    }

    function uiLogin(onSuccess){
        const root = getRoot();
        root.innerHTML = '';
        // Make sure login form is visible over maintenance overlay and hides content behind
        root.style.zIndex = '100001'; // Higher than maintenance overlay (99999)
        root.style.background = 'rgba(0,0,0,0.95)'; // Very dark background to completely hide content
        
        const pwd = el('input', { type: 'password', placeholder: 'Admin password', style: { padding: '10px', width: '100%', marginBottom: '10px' }});
        const info = el('div', { style: { fontSize: '12px', color: '#666', marginBottom: '10px', padding: '8px', background: '#f5f5f5', borderRadius: '6px' } }, [
            '💡 Tip: Heslo je uloženo jako SHA-256 hash. Pokud jste ho zapomněli, kontaktujte správce nebo změňte hash v kódu.'
        ]);
        const btn = el('button', { class: 'gg-btn', style: { padding: '10px 16px' }, onclick: async ()=>{
            const ok = await sha256Hex(pwd.value || '') === ADMIN_HASH_SHA256;
            if(!ok){ alert('Wrong password'); return; }
            saveAdminSession();
            // Hide maintenance overlay AFTER successful login
            hideMaintenanceOverlay();
            onSuccess();
        }}, ['Enter']);
        const close = el('button', { style: { padding: '8px 12px', float: 'right' }, onclick: ()=>{ 
            removeRoot(); 
            // Don't hide maintenance overlay when closing login - keep it secure
            history.replaceState(null, '', location.pathname + location.search); 
        } }, ['Close']);
        
        // Allow Enter key to submit
        pwd.addEventListener('keypress', async (e)=>{
            if(e.key === 'Enter'){
                const ok = await sha256Hex(pwd.value || '') === ADMIN_HASH_SHA256;
                if(!ok){ alert('Wrong password'); return; }
                saveAdminSession();
                // Hide maintenance overlay AFTER successful login
                hideMaintenanceOverlay();
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

    function openAddRecordEditor(){
        const root = getRoot();
        root.innerHTML = '';
        root.style.zIndex = '100001';
        root.style.background = 'rgba(0,0,0,0.95)';
        
        const card = el('div', { 
            style: { 
                maxWidth: '600px', 
                margin: '60px auto', 
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)', 
                borderRadius: '20px', 
                padding: '32px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                fontFamily: 'Quicksand, sans-serif',
                position: 'relative'
            } 
        });
        
        const header = el('div', { style: { marginBottom: '24px', textAlign: 'center' } });
        const title = el('h2', { 
            style: { 
                fontSize: '28px', 
                fontWeight: '700', 
                color: '#0b3d91', 
                margin: '0 0 8px 0',
                fontFamily: 'Quicksand, sans-serif'
            } 
        }, ['➕ Přidat nový záznam']);
        header.appendChild(title);
        card.appendChild(header);
        
        const statusDiv = el('div', { 
            style: { 
                marginBottom: '16px', 
                padding: '12px 16px', 
                borderRadius: '10px', 
                fontSize: '14px', 
                display: 'none', 
                transition: 'all 0.3s ease', 
                fontWeight: '500', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)' 
            } 
        });
        card.appendChild(statusDiv);
        
        // Main input: game URL or text
        const mainInputLabel = el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#333',
                fontSize: '14px'
            } 
        }, ['📋 Vložte odkaz na hru nebo text záznamu']);
        const mainInput = el('textarea', {
            style: {
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid #e0e0e0',
                fontSize: '14px',
                fontFamily: 'monospace',
                resize: 'vertical',
                minHeight: '80px',
                marginBottom: '16px',
                transition: 'border-color 0.3s ease'
            },
            placeholder: 'Vložte odkaz na GeoGuessr hru nebo zkopírujte text záznamu...',
            oninput: function(){
                this.style.borderColor = '#0b3d91';
                autoProcessInputForAddRecord();
            }
        });
        card.appendChild(mainInputLabel);
        card.appendChild(mainInput);
        
        // Group selection (score-time or streaks)
        const groupLabel = el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#333',
                fontSize: '14px'
            } 
        }, ['📂 Kategorie']);
        const groupSelect = el('select', {
            style: {
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid #e0e0e0',
                fontSize: '14px',
                marginBottom: '16px',
                background: 'white',
                cursor: 'pointer'
            },
            id: 'add-record-group-select'
        });
        groupSelect.appendChild(el('option', { value: 'score-time' }, ['Skóre/Čas']));
        groupSelect.appendChild(el('option', { value: 'streaks' }, ['Streaks']));
        card.appendChild(groupLabel);
        card.appendChild(groupSelect);
        
        // Map selection (if not auto-detected)
        const mapLabel = el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#333',
                fontSize: '14px'
            } 
        }, ['🗺️ Mapa (pokud není auto-detekováno)']);
        const mapInput = el('input', {
            type: 'text',
            style: {
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid #e0e0e0',
                fontSize: '14px',
                marginBottom: '16px',
                display: 'none'
            },
            id: 'add-record-map-input',
            placeholder: 'URL mapy nebo název mapy'
        });
        card.appendChild(mapLabel);
        card.appendChild(mapInput);
        
        // Mode selection (if not auto-detected)
        const modeLabel = el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#333',
                fontSize: '14px'
            } 
        }, ['🎮 Mód (pokud není auto-detekováno)']);
        const modeSelect = el('select', {
            style: {
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid #e0e0e0',
                fontSize: '14px',
                marginBottom: '16px',
                background: 'white',
                cursor: 'pointer',
                display: 'none'
            },
            id: 'add-record-mode-select'
        });
        modeSelect.appendChild(el('option', { value: 'MOVING' }, ['Moving']));
        modeSelect.appendChild(el('option', { value: 'NM' }, ['No Move']));
        modeSelect.appendChild(el('option', { value: 'NMPZ' }, ['NMPZ']));
        card.appendChild(modeLabel);
        card.appendChild(modeSelect);
        
        // User selection (reuse same logic as openEditor)
        const userLabel = el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#333',
                fontSize: '14px'
            } 
        }, ['👤 Hráč']);
        
        const userDropdownWrapper = el('div', { 
            style: { 
                position: 'relative', 
                marginBottom: '16px' 
            } 
        });
        
        let selectedUserUrl = '';
        const userSelectButton = el('button', {
            type: 'button',
            style: {
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '2px solid #e0e0e0',
                fontSize: '14px',
                background: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'space-between'
            },
            id: 'add-record-user-select',
            onclick: function(e){
                e.stopPropagation();
                const isOpen = userDropdownList.style.display === 'block';
                userDropdownList.style.display = isOpen ? 'none' : 'block';
                if(!isOpen) userSearchInput?.focus();
            }
        });
        
        userSelectButton.appendChild(el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
            el('span', {}, ['Vyberte hráče...'])
        ]));
        userSelectButton.appendChild(el('span', { style: { fontSize: '12px', color: '#999' } }, ['▼']));
        
        const userDropdownList = el('div', {
            style: {
                display: 'none',
                position: 'absolute',
                top: '100%',
                left: '0',
                right: '0',
                background: 'white',
                border: '2px solid #e0e0e0',
                borderRadius: '10px',
                marginTop: '4px',
                maxHeight: '300px',
                overflowY: 'auto',
                zIndex: '1000',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }
        });
        
        // Search input for users
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
                updateUserDropdownForAddRecord();
            },
            onclick: function(e){
                e.stopPropagation();
            }
        });
        userDropdownList.appendChild(userSearchInput);
        
        let searchDebounceTimeout = null;
        let isRefreshing = false;
        let selectedIndex = -1;
        let userItems = [];
        
        // Get recent users from localStorage
        function getRecentUsers(){
            try{
                const recent = localStorage.getItem('gg_recent_users');
                return recent ? JSON.parse(recent) : [];
            }catch(e){
                return [];
            }
        }
        
        // Save user to recent users
        function saveRecentUser(userUrl){
            try{
                const recent = getRecentUsers();
                const index = recent.indexOf(userUrl);
                if(index > -1) recent.splice(index, 1);
                recent.unshift(userUrl);
                // Keep only last 10
                if(recent.length > 10) recent.pop();
                localStorage.setItem('gg_recent_users', JSON.stringify(recent));
            }catch(e){}
        }
        
        function updateUserDropdownForAddRecord(){
            const searchTerm = userSearchInput.value.toLowerCase().trim();
            selectedIndex = -1;
            userItems = [];
            
            // Get recent users
            const recentUrls = getRecentUsers();
            const recentUsers = recentUrls.map(url => usersList.find(u => u.url === url)).filter(Boolean);
            
            // Sort users: with names first, then by name alphabetically
            const sortedUsers = [...usersList].sort((a, b) => {
                const aHasName = !!(a.name && a.name.trim());
                const bHasName = !!(b.name && b.name.trim());
                if(aHasName && !bHasName) return -1;
                if(!aHasName && bHasName) return 1;
                if(aHasName && bHasName) {
                    return (a.name || '').localeCompare(b.name || '', 'cs');
                }
                return 0;
            });
            
            const filteredUsers = searchTerm 
                ? sortedUsers.filter(u => {
                    const name = (u.name || '').toLowerCase();
                    const urlId = (u.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || '').toLowerCase();
                    const urlLower = u.url.toLowerCase();
                    return name.includes(searchTerm) || urlId.includes(searchTerm) || urlLower.includes(searchTerm);
                })
                : sortedUsers;
            
            // Separate recent users from filtered (only if not searching)
            const displayRecentUsers = !searchTerm && recentUsers.length > 0 ? recentUsers : [];
            const displayRegularUsers = searchTerm ? filteredUsers : filteredUsers.filter(u => !recentUrls.includes(u.url));
            
            // Clear and rebuild list (keep search input)
            const searchInput = userDropdownList.querySelector('input');
            userDropdownList.innerHTML = '';
            if(searchInput) userDropdownList.appendChild(searchInput);
            
            // Add refresh button at top
            const refreshBtn = el('button', {
                tabindex: '-1',
                style: {
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: isRefreshing ? '#e0e0e0' : '#f8f9fa',
                    color: isRefreshing ? '#999' : '#0b3d91',
                    border: 'none',
                    borderBottom: '1px solid #e0e0e0',
                    cursor: isRefreshing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                },
                disabled: isRefreshing,
                onclick: async function(e){
                    e.stopPropagation();
                    if(isRefreshing) return;
                    isRefreshing = true;
                    this.textContent = '🔄 Obnovuji...';
                    this.style.background = '#e0e0e0';
                    this.style.color = '#999';
                    
                    try{
                        await loadUsers();
                        updateUserDropdownForAddRecord();
                        this.textContent = '✅ Obnoveno';
                        setTimeout(() => {
                            this.textContent = '🔄 Obnovit seznam';
                            this.style.background = '#f8f9fa';
                            this.style.color = '#0b3d91';
                            isRefreshing = false;
                        }, 1000);
                    }catch(e){
                        this.textContent = '❌ Chyba';
                        setTimeout(() => {
                            this.textContent = '🔄 Obnovit seznam';
                            this.style.background = '#f8f9fa';
                            this.style.color = '#0b3d91';
                            isRefreshing = false;
                        }, 2000);
                    }
                }
            }, ['🔄 Obnovit seznam']);
            userDropdownList.appendChild(refreshBtn);
            
            // Show recent users section
            if(displayRecentUsers.length > 0){
                const recentHeader = el('div', {
                    style: {
                        padding: '8px 12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#0b3d91',
                        background: '#e3f2fd',
                        borderBottom: '1px solid #bbdefb',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }
                }, ['🕒 Nedávní uživatelé']);
                userDropdownList.appendChild(recentHeader);
                
                displayRecentUsers.forEach(user => {
                    const userItem = createUserItem(user, true);
                    userDropdownList.appendChild(userItem);
                });
                
                // Separator
                const separator = el('div', {
                    style: {
                        padding: '8px 12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#666',
                        background: '#f8f9fa',
                        borderBottom: '1px solid #e0e0e0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }
                }, ['Všichni uživatelé']);
                userDropdownList.appendChild(separator);
            }
            
            // Show count
            if(filteredUsers.length !== sortedUsers.length){
                const countInfo = el('div', {
                    style: {
                        padding: '6px 12px',
                        fontSize: '11px',
                        color: '#666',
                        background: '#f8f9fa',
                        borderBottom: '1px solid #e0e0e0',
                        textAlign: 'center'
                    }
                }, [`Zobrazeno ${filteredUsers.length} z ${sortedUsers.length} uživatelů`]);
                userDropdownList.appendChild(countInfo);
            }
            
            if(displayRegularUsers.length === 0 && displayRecentUsers.length === 0){
                const noResults = el('div', {
                    style: {
                        padding: '20px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '14px'
                    }
                }, ['Žádní uživatelé nenalezeni']);
                userDropdownList.appendChild(noResults);
                return;
            }
            
            // Create user item function
            function createUserItem(user, isRecent = false){
                const itemIndex = userItems.length;
                const userItem = el('div', {
                    'data-user-index': itemIndex,
                    'data-user-url': user.url,
                    role: 'option',
                    tabindex: '-1',
                    style: {
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        outline: 'none'
                    },
                    onmouseenter: function(){ 
                        selectedIndex = itemIndex;
                        updateSelectedItem();
                        if(this.querySelector('.user-refresh-btn')){
                            this.querySelector('.user-refresh-btn').style.opacity = '1';
                        }
                        if(this.querySelector('.user-copy-btn')){
                            this.querySelector('.user-copy-btn').style.opacity = '1';
                        }
                    },
                    onmouseleave: function(){ 
                        if(this.querySelector('.user-refresh-btn')){
                            this.querySelector('.user-refresh-btn').style.opacity = '0';
                        }
                        if(this.querySelector('.user-copy-btn')){
                            this.querySelector('.user-copy-btn').style.opacity = '0';
                        }
                    },
                    onclick: function(e){
                        if(e.target.closest('.user-refresh-btn') || e.target.closest('.user-copy-btn')) return;
                        selectUser(user);
                    },
                    onkeydown: function(e){
                        if(e.key === 'Enter' || e.key === ' '){
                            e.preventDefault();
                            selectUser(user);
                        }
                    }
                });
                
                function selectUser(user){
                    saveRecentUser(user.url);
                    selectedUserUrl = user.url;
                    userSelectButton.innerHTML = '';
                    if(user.avatarUrl){
                        userSelectButton.appendChild(el('img', { 
                            src: user.avatarUrl, 
                            style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                            alt: ''
                        }));
                    }
                    userSelectButton.appendChild(el('span', {}, [user.name || user.url]));
                    userDropdownList.style.display = 'none';
                    if(autoRefreshInterval){
                        clearInterval(autoRefreshInterval);
                        autoRefreshInterval = null;
                    }
                }
                
                // Avatar with fallback
                if(user.avatarUrl){
                    const avatarImg = el('img', { 
                        src: user.avatarUrl, 
                        style: { width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 },
                        alt: '',
                        onerror: function(){
                            this.src = '';
                            this.style.display = 'none';
                            const placeholder = this.nextSibling;
                            if(placeholder) placeholder.style.display = 'flex';
                        }
                    });
                    userItem.appendChild(avatarImg);
                }
                
                const avatarPlaceholder = el('div', { 
                    style: { 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '4px', 
                        background: user.avatarUrl ? 'transparent' : '#e0e0e0', 
                        flexShrink: 0,
                        display: user.avatarUrl ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: '#999',
                        fontWeight: '600'
                    } 
                }, [user.name ? user.name.charAt(0).toUpperCase() : '?']);
                userItem.appendChild(avatarPlaceholder);
                
                // User info
                const userInfo = el('div', { style: { flex: '1', minWidth: 0 } });
                const userName = el('div', { 
                    style: { 
                        fontWeight: '600', 
                        fontSize: '14px',
                        color: user.name ? '#333' : '#999',
                        fontStyle: user.name ? 'normal' : 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    } 
                }, [user.name || (user.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || 'Unknown')]);
                const userUrl = el('div', { 
                    style: { 
                        fontSize: '12px', 
                        color: '#999',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    } 
                }, [user.url]);
                userInfo.appendChild(userName);
                userInfo.appendChild(userUrl);
                userItem.appendChild(userInfo);
                
                // Action buttons container
                const actionButtons = el('div', {
                    style: {
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                        flexShrink: 0
                    }
                });
                
                // Copy URL button
                const copyBtn = el('button', {
                    class: 'user-copy-btn',
                    'aria-label': 'Kopírovat URL uživatele',
                    title: 'Kopírovat URL',
                    style: {
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: '0',
                        transition: 'opacity 0.2s ease',
                        flexShrink: 0
                    },
                    onclick: async function(e){
                        e.stopPropagation();
                        try{
                            await navigator.clipboard.writeText(user.url);
                            const originalText = this.textContent;
                            this.textContent = '✓';
                            this.style.background = '#2e7d32';
                            setTimeout(() => {
                                this.textContent = originalText;
                                this.style.background = '#4caf50';
                            }, 1000);
                        }catch(err){
                            console.warn('Failed to copy:', err);
                        }
                    }
                }, ['📋']);
                actionButtons.appendChild(copyBtn);
                
                // Refresh button for individual user (appears on hover)
                if(!user.name || !user.avatarUrl){
                    const refreshUserBtn = el('button', {
                        class: 'user-refresh-btn',
                        'aria-label': 'Obnovit profil uživatele',
                        title: 'Obnovit profil',
                        style: {
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: '#0b3d91',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            opacity: '0',
                            transition: 'opacity 0.2s ease',
                            flexShrink: 0
                        },
                        onclick: async function(e){
                            e.stopPropagation();
                            this.disabled = true;
                            this.textContent = '...';
                            try{
                                const profile = await fetchUserProfile(user.url);
                                if(profile){
                                    user.name = profile.name;
                                    user.avatarUrl = profile.avatarUrl;
                                    updateUserDropdownForAddRecord();
                                }
                            }catch(err){
                                console.warn('Failed to refresh user:', err);
                            }
                            this.disabled = false;
                            this.textContent = '🔄';
                        }
                    }, ['🔄']);
                    actionButtons.appendChild(refreshUserBtn);
                }
                
                userItem.appendChild(actionButtons);
                userItems.push(userItem);
                return userItem;
            }
            
            // Render regular users
            displayRegularUsers.forEach(user => {
                const userItem = createUserItem(user, false);
                userDropdownList.appendChild(userItem);
            });
        }
        
        // Helper functions for keyboard navigation (must be outside createUserItem)
        function updateSelectedItem(){
            userItems.forEach((item, idx) => {
                if(idx === selectedIndex){
                    item.style.background = '#e3f2fd';
                    item.style.borderLeft = '3px solid #0b3d91';
                    item.setAttribute('aria-selected', 'true');
                    item.focus();
                }else{
                    item.style.background = idx % 2 === 0 ? '#fff' : '#fafafa';
                    item.style.borderLeft = 'none';
                    item.setAttribute('aria-selected', 'false');
                }
            });
        }
        
        function scrollToSelected(){
            if(selectedIndex >= 0 && selectedIndex < userItems.length){
                const selectedItem = userItems[selectedIndex];
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        
        // Debounced search
        userSearchInput.oninput = function(){
            clearTimeout(searchDebounceTimeout);
            searchDebounceTimeout = setTimeout(() => {
                selectedIndex = -1;
                updateUserDropdownForAddRecord();
            }, 200);
        };
        
        // Keyboard navigation
        userSearchInput.addEventListener('keydown', function(e){
            if(userDropdownList.style.display !== 'block') return;
            
            if(e.key === 'ArrowDown'){
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, userItems.length - 1);
                updateSelectedItem();
                scrollToSelected();
            }else if(e.key === 'ArrowUp'){
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                if(selectedIndex === -1){
                    userSearchInput.focus();
                    userItems.forEach(item => {
                        item.style.background = '';
                        item.style.borderLeft = 'none';
                    });
                }else{
                    updateSelectedItem();
                    scrollToSelected();
                }
            }else if(e.key === 'Enter' && selectedIndex >= 0){
                e.preventDefault();
                const selectedItem = userItems[selectedIndex];
                if(selectedItem){
                    const userUrl = selectedItem.getAttribute('data-user-url');
                    const user = usersList.find(u => u.url === userUrl);
                    if(user){
                        selectedItem.click();
                    }
                }
            }else if(e.key === 'Escape'){
                e.preventDefault();
                userDropdownList.style.display = 'none';
                if(autoRefreshInterval){
                    clearInterval(autoRefreshInterval);
                    autoRefreshInterval = null;
                }
            }
        });
        
        // Initial load
        updateUserDropdownForAddRecord();
        
        // Auto-refresh dropdown every 30 seconds if open
        let autoRefreshInterval = null;
        userSelectButton.addEventListener('click', function(){
            const isOpen = userDropdownList.style.display === 'block';
            if(isOpen){
                // Start auto-refresh
                autoRefreshInterval = setInterval(async () => {
                    if(userDropdownList.style.display === 'block' && !isRefreshing){
                        try{
                            await loadUsers();
                            updateUserDropdownForAddRecord();
                        }catch(e){
                            console.warn('Auto-refresh failed:', e);
                        }
                    }
                }, 30000); // Refresh every 30 seconds
            } else {
                // Stop auto-refresh when closed
                if(autoRefreshInterval){
                    clearInterval(autoRefreshInterval);
                    autoRefreshInterval = null;
                }
            }
        });
        
        // Close dropdown when clicking outside
        const closeDropdownHandler = function(e){
            if(!userDropdownWrapper.contains(e.target)){
                userDropdownList.style.display = 'none';
                selectedIndex = -1;
                if(autoRefreshInterval){
                    clearInterval(autoRefreshInterval);
                    autoRefreshInterval = null;
                }
            }
        };
        document.addEventListener('click', closeDropdownHandler);
        
        userDropdownWrapper.appendChild(userSelectButton);
        userDropdownWrapper.appendChild(userDropdownList);
        card.appendChild(userLabel);
        card.appendChild(userDropdownWrapper);
        
        // Other fields (rank, resultLabel, resultUrl) - will be auto-filled
        const rankInput = el('input', { type: 'text', style: { display: 'none' }, id: 'add-record-rank' });
        const resultLabelInput = el('input', { type: 'text', style: { display: 'none' }, id: 'add-record-result-label' });
        const resultUrlInput = el('input', { type: 'text', style: { display: 'none' }, id: 'add-record-result-url' });
        card.appendChild(rankInput);
        card.appendChild(resultLabelInput);
        card.appendChild(resultUrlInput);
        
        // Buttons
        const buttonGroup = el('div', { style: { display: 'flex', gap: '12px', marginTop: '24px' } });
        
        const saveBtn = el('button', {
            style: {
                flex: '1',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #0b3d91 0%, #1e5bb8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            },
            onclick: async () => {
                await saveAddRecord();
            }
        }, ['💾 Uložit záznam']);
        
        const cancelBtn = el('button', {
            style: {
                flex: '1',
                padding: '14px 20px',
                background: '#e0e0e0',
                color: '#333',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease'
            },
            onclick: () => {
                removeRoot();
            }
        }, ['❌ Zrušit']);
        
        buttonGroup.appendChild(saveBtn);
        buttonGroup.appendChild(cancelBtn);
        card.appendChild(buttonGroup);
        
        root.appendChild(card);
        
        // Auto-process input
        let autoProcessTimeout = null;
        async function autoProcessInputForAddRecord(){
            const inputText = mainInput.value.trim();
            if(!inputText) return;
            
            clearTimeout(autoProcessTimeout);
            autoProcessTimeout = setTimeout(async () => {
                try{
                    statusDiv.style.display = 'block';
                    statusDiv.style.background = '#e3f2fd';
                    statusDiv.style.color = '#1565c0';
                    statusDiv.textContent = '🔄 Automatické zpracování...';
                    
                    const data = await parseAndFetchGameData(inputText);
                    
                    if(data.error){
                        statusDiv.style.background = '#fff3cd';
                        statusDiv.style.color = '#856404';
                        statusDiv.textContent = '⚠️ ' + data.error;
                        return;
                    }
                    
                    // Auto-detect group (score-time or streaks)
                    if(data.resultUrl && data.resultUrl.includes('geoguessr.com/game/')){
                        // It's a game URL, so it's score-time
                        groupSelect.value = 'score-time';
                    } else if(inputText.toLowerCase().includes('streak') || inputText.toLowerCase().includes('streaks')){
                        groupSelect.value = 'streaks';
                    }
                    
                    // Auto-detect mode
                    const textLower = inputText.toLowerCase();
                    if(textLower.includes('nmpz')){
                        modeSelect.value = 'NMPZ';
                        modeSelect.style.display = 'block';
                    } else if(textLower.includes('nm') || textLower.includes('no move')){
                        modeSelect.value = 'NM';
                        modeSelect.style.display = 'block';
                    } else if(textLower.includes('moving') || textLower.includes('25k')){
                        modeSelect.value = 'MOVING';
                        modeSelect.style.display = 'block';
                    }
                    
                    // Auto-fill fields
                    if(data.resultLabel) resultLabelInput.value = data.resultLabel;
                    if(data.resultUrl) resultUrlInput.value = data.resultUrl;
                    
                    // Auto-match user
                    if(data.playerUrl){
                        let matchedUser = usersList.find(u => u.url === data.playerUrl);
                        if(!matchedUser){
                            statusDiv.textContent = '👤 Přidávám nového uživatele...';
                            try{
                                const newUser = await addUser(data.playerUrl);
                                if(newUser){
                                    await loadUsers();
                                    matchedUser = usersList.find(u => u.url === data.playerUrl);
                                }
                            }catch(e){
                                console.warn('Failed to auto-add user:', e);
                            }
                        }
                        
                        if(matchedUser){
                            selectedUserUrl = matchedUser.url;
                            userSelectButton.innerHTML = '';
                            if(matchedUser.avatarUrl){
                                userSelectButton.appendChild(el('img', { 
                                    src: matchedUser.avatarUrl, 
                                    style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                                    alt: ''
                                }));
                            }
                            userSelectButton.appendChild(el('span', {}, [matchedUser.name || matchedUser.url]));
                        }
                    }
                    
                    statusDiv.style.background = '#d4edda';
                    statusDiv.style.color = '#155724';
                    statusDiv.textContent = `✅ Načteno: ${data.resultLabel || 'N/A'}`;
                }catch(err){
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = '❌ Chyba: ' + (err.message || 'Selhalo zpracování');
                }
            }, 1000);
        }
        
        async function saveAddRecord(){
            const groupId = groupSelect.value;
            const mapUrl = mapInput.value.trim() || null;
            const mode = modeSelect.value || null;
            const userUrl = selectedUserUrl;
            
            if(!userUrl){
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.textContent = '❌ Prosím vyberte hráče';
                return;
            }
            
            if(!resultUrlInput.value.trim()){
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.textContent = '❌ Prosím vložte odkaz na hru';
                return;
            }
            
            statusDiv.style.display = 'block';
            statusDiv.style.background = '#e3f2fd';
            statusDiv.style.color = '#1565c0';
            statusDiv.textContent = '💾 Ukládám...';
            
            try{
                // Find or create card - use mapUrl + variant to find existing card
                const ref = {
                    groupId: groupId,
                    cardIndex: null, // Will be found or created
                    entryIndex: null, // New entry
                    mapUrl: mapUrl,
                    variant: mode
                };
                
                const payload = {
                    player: usersList.find(u => u.url === userUrl)?.name || '',
                    playerUrl: userUrl,
                    resultLabel: resultLabelInput.value.trim(),
                    resultUrl: resultUrlInput.value.trim(),
                    rank: rankInput.value.trim() || null // Will be auto-assigned if null
                };
                
                await saveEdit(ref, payload);
                
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.textContent = '✅ Záznam úspěšně přidán!';
                
                setTimeout(() => {
                    removeRoot();
                    window.location.reload();
                }, 1500);
            }catch(err){
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.textContent = '❌ Chyba: ' + (err.message || 'Selhalo ukládání');
                console.error('Save error:', err);
            }
        }
        
        // Load users when opening add record editor
        (async () => {
            try {
                await loadUsers();
                updateUserDropdownForAddRecord();
            } catch(e) {
                console.warn('Failed to load users:', e);
            }
        })();
    }

    function uiApp(){
        const root = getRoot();
        root.innerHTML = '';
        root.style.zIndex = '100001';
        root.style.background = 'rgba(0,0,0,0.95)';

        // Modern, clean admin panel
        const card = el('div', { 
            style: { 
                maxWidth: '500px', 
                margin: '60px auto', 
                background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)', 
                borderRadius: '20px', 
                padding: '32px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                fontFamily: 'Quicksand, sans-serif',
                position: 'relative'
            } 
        });

        // Header
        const header = el('div', { style: { marginBottom: '24px', textAlign: 'center' } });
        const title = el('h2', { 
            style: { 
                fontSize: '28px', 
                fontWeight: '700', 
                color: '#0b3d91', 
                margin: '0 0 8px 0',
                fontFamily: 'Quicksand, sans-serif'
            } 
        }, ['🔧 Admin Panel']);
        header.appendChild(title);

        // Admin status - simplified
        const adminStatus = el('div', { 
            style: { 
                padding: '12px 16px', 
                background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)', 
                borderRadius: '12px', 
                fontSize: '14px', 
                color: '#155724',
                marginBottom: '24px',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            } 
        });
        
        // Add force enrichment button
        const forceEnrichButton = el('button', {
            style: {
                width: '100%',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '12px',
                transition: 'all 0.3s ease',
                fontFamily: 'Quicksand, sans-serif'
            },
            onmouseenter: function(){
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(255, 107, 53, 0.4)';
            },
            onmouseleave: function(){
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'none';
            },
            onclick: async function(){
                this.disabled = true;
                this.textContent = '🔄 Enriching all data...';
                try{
                    await forceFullEnrichment();
                    this.textContent = '✅ Enrichment complete!';
                    this.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                    setTimeout(() => {
                        this.textContent = '🚀 Force Full Enrichment';
                        this.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
                        this.disabled = false;
                        window.location.reload();
                    }, 3000);
                }catch(e){
                    this.textContent = '❌ Failed: ' + e.message.substring(0, 30);
                    this.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
                    setTimeout(() => {
                        this.textContent = '🚀 Force Full Enrichment';
                        this.style.background = 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)';
                        this.disabled = false;
                    }, 5000);
                }
            }
        }, ['🚀 Force Full Enrichment']);
        
        // Add server-side script button
        const serverScriptButton = el('button', {
            style: {
                width: '100%',
                padding: '14px 20px',
                background: 'linear-gradient(135deg, #0b3d91 0%, #1e5bb8 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                marginBottom: '12px',
                transition: 'all 0.3s ease',
                fontFamily: 'Quicksand, sans-serif'
            },
            onmouseenter: function(){
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 20px rgba(11, 61, 145, 0.4)';
            },
            onmouseleave: function(){
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'none';
            },
            onclick: function(){
                const command = 'npm run fetch-images';
                // Copy to clipboard
                navigator.clipboard.writeText(command).then(() => {
                    const originalText = this.textContent;
                    this.textContent = '✅ Zkopírováno do schránky!';
                    this.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)';
                    setTimeout(() => {
                        this.textContent = originalText;
                        this.style.background = 'linear-gradient(135deg, #0b3d91 0%, #1e5bb8 100%)';
                    }, 2000);
                }).catch(() => {
                    // Fallback: show alert
                    alert(`Spusť tento příkaz v terminálu:\n\n${command}\n\nTento script načte všechny chybějící map a player data a převede obrázky na base64.`);
                });
            }
        }, ['🖼️ Server-side: Načti obrázky (npm run fetch-images)']);
        
        function updateAdminStatus(){
            const adminData = localStorage.getItem('gg_admin_data');
            const hasToken = !!(localStorage.getItem('gg_pat') || (typeof window !== 'undefined' && window.GITHUB_TOKEN));
            
            if(adminData){
                try{
                    const data = JSON.parse(adminData);
                    const loginDate = new Date(data.loginTime);
                    const hoursLeft = Math.max(0, Math.floor((24 * 60 * 60 * 1000 - (Date.now() - data.loginTime)) / (60 * 60 * 1000)));
                    adminStatus.innerHTML = `
                        <span style="font-size: 18px;">✅</span>
                        <span style="flex: 1;">Přihlášen jako Admin</span>
                        <span style="font-size: 12px; opacity: 0.8;">${hoursLeft}h</span>
                        ${hasToken ? '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px;">🔑 Token OK</span>' : '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px; color: #dc3545;">⚠️ No Token</span>'}
                    `;
                }catch(e){
                    adminStatus.innerHTML = `<span style="font-size: 18px;">✅</span><span>Admin session active</span>${hasToken ? '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px;">🔑 Token OK</span>' : '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px; color: #dc3545;">⚠️ No Token</span>'}`;
                }
            } else {
                adminStatus.innerHTML = `<span style="font-size: 18px;">⚠️</span><span>Not logged in</span>${hasToken ? '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px;">🔑 Token OK</span>' : '<span style="font-size: 12px; opacity: 0.6; margin-left: 8px; color: #dc3545;">⚠️ No Token</span>'}`;
            }
        }
        updateAdminStatus();
        
        // Check token availability and show warning if missing
        const hasToken = !!(localStorage.getItem('gg_pat') || (typeof window !== 'undefined' && window.GITHUB_TOKEN));
        if(!hasToken){
            const tokenWarning = el('div', {
                style: {
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%)',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: '#856404',
                    marginBottom: '16px',
                    fontWeight: '500',
                    border: '1px solid #ffc107'
                }
            });
            tokenWarning.innerHTML = `
                ⚠️ <strong>GitHub token not found!</strong><br>
                Run: <code style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px;">npm run inject-token</code> to load from .env<br>
                Or set <code style="background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px;">window.GITHUB_TOKEN</code> in console
            `;
            card.insertBefore(tokenWarning, forceEnrichButton);
        }

        // Info text - improved with better instructions
        const infoText = el('div', {
            style: {
                fontSize: '14px',
                color: '#666',
                marginBottom: '20px',
                lineHeight: '1.6',
                padding: '16px',
                background: 'linear-gradient(135deg, #f0f7ff 0%, #e3f2fd 100%)',
                borderRadius: '12px',
                border: '1px solid rgba(11,61,145,0.15)'
            }
        });
        infoText.innerHTML = `
            <div style="font-weight: 600; color: #0b3d91; margin-bottom: 8px;">💡 Jak používat editor:</div>
            <div style="font-size: 13px;">
                • <strong>Pravým kliknutím</strong> na libovolný rekord můžete ho upravit nebo přidat nový<br>
                • <strong>Vložte URL hry</strong> - automaticky se zpracuje a vyplní všechna pole<br>
                • <strong>Uživatel se automaticky najde</strong> nebo přidá z URL<br>
                • <strong>Klikněte "Uložit"</strong> pro finální uložení
            </div>
        `;
        
        // Quick actions section
        const quickActionsSection = el('div', {
            style: {
                marginTop: '24px',
                padding: '20px',
                background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                borderRadius: '12px',
                border: '1px solid rgba(11,61,145,0.1)'
            }
        });
        
        const quickActionsTitle = el('div', {
            style: {
                fontSize: '15px',
                fontWeight: '700',
                color: '#0b3d91',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }
        }, ['⚡ Rychlé akce']);
        quickActionsSection.appendChild(quickActionsTitle);
        
        const quickActionsGrid = el('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '10px'
            }
        });
        
        // Refresh data button
        const refreshDataBtn = el('button', {
            style: {
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '600',
                background: '#fff',
                color: '#0b3d91',
                border: '2px solid #0b3d91',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            },
            onmouseenter: function(){
                this.style.background = '#0b3d91';
                this.style.color = '#fff';
            },
            onmouseleave: function(){
                this.style.background = '#fff';
                this.style.color = '#0b3d91';
            },
            onclick: () => {
                window.dispatchEvent(new Event('gg-refresh-data'));
                showSuccessNotification('🔄 Data se obnovují...');
            }
        }, ['🔄 Obnovit data na stránce']);
        
        quickActionsGrid.appendChild(refreshDataBtn);
        quickActionsSection.appendChild(quickActionsGrid);

        // Logout button
        const logoutBtn = el('button', { 
            onclick: ()=>{ 
                clearAdminSession(); 
                removeRoot(); 
                history.replaceState(null, '', location.pathname + location.search);
                hideMaintenanceOverlay();
            }, 
            style: { 
                width: '100%',
                padding: '14px 24px', 
                fontSize: '16px',
                fontWeight: '600',
                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '12px', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(220, 53, 69, 0.3)',
                fontFamily: 'Quicksand, sans-serif'
            },
            onmouseenter: function(){
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = '0 6px 16px rgba(220, 53, 69, 0.4)';
            },
            onmouseleave: function(){
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
            }
        }, ['🚪 Odhlásit se']);

        // Close button
        const closeBtn = el('button', {
            onclick: ()=>{ 
                removeRoot(); 
                history.replaceState(null, '', location.pathname + location.search);
            },
            style: {
                position: 'absolute',
                top: '16px',
                right: '16px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(0,0,0,0.1)',
                color: '#666',
                cursor: 'pointer',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                fontFamily: 'Quicksand, sans-serif'
            },
            onmouseenter: function(){
                this.style.background = 'rgba(0,0,0,0.15)';
                this.style.transform = 'rotate(90deg)';
            },
            onmouseleave: function(){
                this.style.background = 'rgba(0,0,0,0.1)';
                this.style.transform = 'rotate(0deg)';
            }
        }, ['×']);

        card.appendChild(closeBtn);
        card.appendChild(header);
        card.appendChild(adminStatus);
        
        // Quick actions section
        card.appendChild(quickActionsSection);
        
        // Main actions
        const mainActionsSection = el('div', {
            style: {
                marginTop: '20px',
                paddingTop: '20px',
                borderTop: '2px solid rgba(11,61,145,0.1)'
            }
        });
        
        const mainActionsTitle = el('div', {
            style: {
                fontSize: '15px',
                fontWeight: '700',
                color: '#0b3d91',
                marginBottom: '16px'
            }
        }, ['🔧 Hlavní akce']);
        mainActionsSection.appendChild(mainActionsTitle);
        
        mainActionsSection.appendChild(forceEnrichButton);
        mainActionsSection.appendChild(serverScriptButton);
        mainActionsSection.appendChild(infoText);
        mainActionsSection.appendChild(logoutBtn);
        
        card.appendChild(mainActionsSection);
        
        root.appendChild(card);
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
            
            // CRITICAL: Use originalCardIndex directly - it's the most reliable way
            let cardIndex = null;
            const mapUrl = entry?.dataset.mapUrl || hostCard.dataset.mapUrl || '';
            const variant = entry?.dataset.variant || '';
            const cardId = entry?.dataset.cardId || '';
            const cardTitle = entry?.dataset.cardTitle || '';
            
            // PRIORITY 1: Use originalCardIndex from entry (set during rendering)
            if(entry && entry.dataset.originalCardIndex) {
                cardIndex = Number(entry.dataset.originalCardIndex);
                console.log(`✅ Using originalCardIndex ${cardIndex} from entry dataset`);
            } 
            // PRIORITY 2: Fallback to cardIndex from hostCard
            else if(hostCard.dataset.cardIndex) {
                cardIndex = Number(hostCard.dataset.cardIndex);
                console.log(`⚠️ Using cardIndex ${cardIndex} from hostCard (fallback)`);
            }
            
            const entryIndex = entry ? Number(entry.dataset.entryIndex) : null;

            console.log(`🔍 Opening editor with FULL context:`, {
                groupId,
                cardIndex,
                entryIndex,
                mapUrl: mapUrl || '(none)',
                variant: variant || '(none)',
                cardId: cardId || '(none)',
                cardTitle: cardTitle || '(none)',
                hasOriginalCardIndex: !!(entry?.dataset.originalCardIndex),
                originalCardIndexValue: entry?.dataset.originalCardIndex || '(none)'
            });
            
            // Pass ALL information for maximum reliability
            openEditor({ 
                groupId, 
                cardIndex, 
                entryIndex,
                mapUrl: mapUrl || undefined,
                variant: variant || undefined,
                cardId: cardId || undefined,
                cardTitle: cardTitle || undefined
            });
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
    
    // Cache keys
    const CACHE_KEYS = {
        USERS: 'gg_admin_users_cache',
        USERS_TIMESTAMP: 'gg_admin_users_timestamp',
        USER_PROFILES: 'gg_admin_user_profiles_cache',
        CACHE_DURATION: 5 * 60 * 1000 // 5 minutes
    };
    
    // Load users from cache or fetch
    function getCachedUsers(){
        try{
            const cached = localStorage.getItem(CACHE_KEYS.USERS);
            const timestamp = localStorage.getItem(CACHE_KEYS.USERS_TIMESTAMP);
            if(cached && timestamp){
                const age = Date.now() - parseInt(timestamp);
                if(age < CACHE_KEYS.CACHE_DURATION){
                    return JSON.parse(cached);
                }
            }
        }catch(e){
            console.warn('Failed to load cached users:', e);
        }
        return null;
    }
    
    function saveUsersToCache(users){
        try{
            localStorage.setItem(CACHE_KEYS.USERS, JSON.stringify(users));
            localStorage.setItem(CACHE_KEYS.USERS_TIMESTAMP, String(Date.now()));
        }catch(e){
            console.warn('Failed to cache users:', e);
        }
    }
    
    function getCachedUserProfile(url){
        try{
            const cached = localStorage.getItem(CACHE_KEYS.USER_PROFILES);
            if(cached){
                const profiles = JSON.parse(cached);
                return profiles[url] || null;
            }
        }catch(e){
            console.warn('Failed to load cached profile:', e);
        }
        return null;
    }
    
    function saveUserProfileToCache(url, profile){
        try{
            const cached = localStorage.getItem(CACHE_KEYS.USER_PROFILES);
            const profiles = cached ? JSON.parse(cached) : {};
            profiles[url] = {
                ...profile,
                cachedAt: Date.now()
            };
            localStorage.setItem(CACHE_KEYS.USER_PROFILES, JSON.stringify(profiles));
        }catch(e){
            console.warn('Failed to cache profile:', e);
        }
    }
    
    async function loadUsers(forceRefresh = false){
        // Prevent multiple simultaneous loads
        if(usersLoadingPromise && !forceRefresh) return usersLoadingPromise;
        
        // Try cache first
        if(!forceRefresh){
            const cached = getCachedUsers();
            if(cached){
                usersList = cached;
                console.log(`✅ Loaded ${usersList.length} users from cache`);
                return Promise.resolve(usersList);
            }
        }
        
        usersLoadingPromise = (async () => {
            try{
                // Try to fetch with cache-busting, but also try without if that fails
                let res;
                try{
                    res = await fetch('data/users.json?cb=' + Date.now(), {
                        cache: 'no-store',
                        headers: {
                            'Cache-Control': 'no-cache'
                        }
                    });
                }catch(e){
                    // If cache-busting fails, try without
                    res = await fetch('data/users.json');
                }
                
                if(!res.ok){
                    throw new Error(`Failed to fetch users.json: ${res.status} ${res.statusText}`);
                }
                const data = await res.json();
                usersList = Array.isArray(data.users) ? data.users : [];
                
                // Save to cache
                saveUsersToCache(usersList);
                
                usersLoadingPromise = null;
                console.log(`✅ Loaded ${usersList.length} users from server`);
                return usersList;
            }catch(e){
                console.warn('Failed to load users.json:', e);
                // Try to use cache even if expired
                const cached = getCachedUsers();
                if(cached){
                    usersList = cached;
                    console.log(`⚠️ Using expired cache (${usersList.length} users)`);
                    usersLoadingPromise = null;
                    return usersList;
                }
                usersList = [];
                usersLoadingPromise = null;
                return [];
            }
        })();
        
        return usersLoadingPromise;
    }
    
    // Multiple CORS proxy services for rotation to bypass rate limits
    // Comprehensive list of proxy services with fallbacks
    // Note: Many free proxies are unreliable. We use multiple strategies.
    const PROXY_SERVICES = [
        // Primary proxies (most reliable)
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        // Alternative proxies
        (url) => `https://api.corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://proxy.cors.sh/${encodeURIComponent(url)}`,
        (url) => `https://cors.bridged.cc/${encodeURIComponent(url)}`,
        // Additional fallbacks (may be less reliable)
        (url) => `https://yacdn.org/proxy/${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&callback=`,
        // Try different allorigins endpoints
        (url) => `https://allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ];
    let currentProxyIndex = 0;
    let workingProxyIndex = 0; // Track which proxy works, prefer it
    const failedProxies = new Set(); // Track permanently failed proxies
    
    async function fetchWithProxy(url, retries = 5){
        let lastError;
        const triedProxies = new Set();
        
        // Start with the last working proxy if available
        let startIndex = workingProxyIndex % PROXY_SERVICES.length;
        
        // Try each proxy service multiple times before giving up
        const maxAttempts = Math.max((retries + 1) * 2, PROXY_SERVICES.length * 3);
        
        for(let attempt = 0; attempt < maxAttempts; attempt++){
            // Prefer working proxy, then rotate
            let proxyIndex;
            if(attempt === 0 && workingProxyIndex < PROXY_SERVICES.length && !failedProxies.has(workingProxyIndex)){
                // Start with known working proxy
                proxyIndex = workingProxyIndex;
            } else {
                // Rotate through all proxies, skipping failed ones
                let attempts = 0;
                do {
                    proxyIndex = (startIndex + attempt + attempts) % PROXY_SERVICES.length;
                    attempts++;
                    if(attempts > PROXY_SERVICES.length) break; // Prevent infinite loop
                } while(failedProxies.has(proxyIndex) && attempts <= PROXY_SERVICES.length);
            }
            
            const proxyFn = PROXY_SERVICES[proxyIndex];
            
            // Skip permanently failed proxies
            if(failedProxies.has(proxyIndex)) {
                continue;
            }
            
            try{
                const proxyUrl = proxyFn(url);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for images
                
                // Try fetch with retry on network errors
                let res;
                let fetchAttempts = 0;
                const maxFetchAttempts = 3;
                let currentTimeoutId = timeoutId;
                
                while(fetchAttempts < maxFetchAttempts){
                    try{
                        res = await fetch(proxyUrl, {
                            signal: controller.signal,
                            headers: {
                                'Accept': 'image/*, application/json, text/html, */*',
                                // Don't include User-Agent - some proxies don't allow custom headers
                            },
                            mode: 'cors',
                            credentials: 'omit'
                        });
                        clearTimeout(currentTimeoutId);
                        break; // Success, exit retry loop
                    }catch(fetchError){
                        fetchAttempts++;
                        clearTimeout(currentTimeoutId);
                        if(fetchAttempts >= maxFetchAttempts){
                            throw fetchError; // Re-throw if all attempts failed
                        }
                        // Wait before retry (exponential backoff)
                        await new Promise(resolve => setTimeout(resolve, 1000 * fetchAttempts));
                        // Create new timeout for retry
                        currentTimeoutId = setTimeout(() => controller.abort(), 20000);
                    }
                }
                
                if(res.status === 429){
                    // Rate limited - wait longer and try next proxy
                    const retryAfter = res.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : Math.min((attempt + 1) * 8000, 30000);
                    console.warn(`Proxy ${proxyIndex} rate limited, waiting ${waitTime/1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                
                if(!res.ok){
                    // Mark as failed if 403, 500, or other permanent errors
                    if(res.status === 403 || res.status === 500){
                        failedProxies.add(proxyIndex);
                        console.warn(`Proxy ${proxyIndex} permanently failed (${res.status}), marking as failed`);
                    }
                    throw new Error(`HTTP ${res.status}`);
                }
                
                // Success! Remember this working proxy for next time
                workingProxyIndex = proxyIndex;
                // Remove from failed list if it was there
                failedProxies.delete(proxyIndex);
                return res;
            }catch(e){
                lastError = e;
                triedProxies.add(proxyIndex);
                
                if(e.name === 'AbortError'){
                    console.warn(`Proxy ${proxyIndex} timeout (attempt ${attempt + 1}/${maxAttempts})`);
                }else if(e.message && (e.message.includes('429') || e.message.includes('rate limit'))){
                    console.warn(`Proxy ${proxyIndex} rate limited (attempt ${attempt + 1}/${maxAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, Math.min((attempt + 1) * 8000, 30000)));
                }else if(e.message && (e.message.includes('hostname') || e.message.includes('403') || e.message.includes('Load failed') || e.message.includes('network connection') || e.message.includes('Failed to fetch') || e.name === 'TypeError')){
                    // Mark as failed for permanent errors
                    const isPermanentError = e.message.includes('hostname') || 
                                           e.message.includes('Load failed') || 
                                           e.message.includes('network connection') ||
                                           e.message.includes('Failed to fetch') ||
                                           (e.name === 'TypeError' && e.message.includes('fetch'));
                    
                    if(isPermanentError){
                        failedProxies.add(proxyIndex);
                        console.warn(`Proxy ${proxyIndex} permanently failed (${e.message || e.name}), marking as failed`);
                    } else {
                        console.warn(`Proxy ${proxyIndex} failed (${e.message}), trying next...`);
                    }
                    // Don't wait for DNS/network errors, try next immediately
                }else{
                    console.warn(`Proxy ${proxyIndex} failed (attempt ${attempt + 1}/${maxAttempts}):`, e.message || e.name);
                }
                
                // Exponential backoff, but shorter for DNS/network errors
                const isNetworkError = e.message?.includes('hostname') || 
                                      e.message?.includes('Load failed') || 
                                      e.message?.includes('network connection') ||
                                      e.message?.includes('Failed to fetch') ||
                                      (e.name === 'TypeError' && e.message?.includes('fetch'));
                
                if(attempt < maxAttempts - 1 && !isNetworkError){
                    const backoffTime = Math.min(3000 * Math.pow(1.5, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, backoffTime));
                } else if(isNetworkError && attempt < maxAttempts - 1){
                    // For network errors, wait a bit before trying next proxy
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        
        throw new Error(`All proxies failed after ${maxAttempts} attempts. Last error: ${lastError?.message || 'Unknown'}`);
    }
    
    async function fetchUserProfile(url, retries = 1, useCache = true){
        try{
            // Check cache first
            if(useCache){
                const cached = getCachedUserProfile(url);
                if(cached){
                    const cacheAge = Date.now() - (cached.cachedAt || 0);
                    // Use cache if less than 24 hours old
                    if(cacheAge < 24 * 60 * 60 * 1000){
                        console.log(`✅ Using cached profile for ${url}`);
                        return { name: cached.name, avatarUrl: cached.avatarUrl };
                    }
                }
            }
            
            // Extract user ID from URL
            const userIdMatch = url.match(/\/user\/([a-z0-9]+)/i);
            if(!userIdMatch) return null;
            const userId = userIdMatch[1];
            
            // Try direct API endpoint first (more reliable)
            for(let attempt = 0; attempt <= retries; attempt++){
                try{
                    const apiUrl = `https://www.geoguessr.com/api/v3/users/${userId}`;
                    const res = await fetchWithProxy(apiUrl, 2);
                    
                    if(res.ok){
                        const userData = await res.json();
                        if(userData && userData.nick){
                            const avatarPath = userData.fullBodyPin || userData.pin?.url || null;
                            const profile = { 
                                name: userData.nick, 
                                avatarUrl: avatarPath ? `https://www.geoguessr.com/images/resize:auto:200:200/gravity:ce/plain/${avatarPath}` : null 
                            };
                            
                            // Save to cache
                            saveUserProfileToCache(url, profile);
                            
                            return profile;
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
            
            // Fallback to HTML parsing (only if API failed, not if rate limited)
            try{
                const data = await fetchNextData(url);
                const user = data?.props?.pageProps?.user;
                if(user && user.nick){
                    const avatarPath = user.avatar?.fullBodyPath || user.pin?.path || user.fullBodyPin || null;
                    const profile = { 
                        name: user.nick, 
                        avatarUrl: avatarPath ? `https://www.geoguessr.com/images/resize:auto:200:200/gravity:ce/plain/${avatarPath}` : null 
                    };
                    
                    // Save to cache
                    saveUserProfileToCache(url, profile);
                    
                    return profile;
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
            
            // Load in parallel batches with smart rate limiting
            const batchSize = 5; // Increased batch size for better performance
            let hasUpdates = false;
            
            // Pre-check cache to skip already cached users
            const usersNeedingFetch = usersToEnrich.filter(user => {
                const cached = getCachedUserProfile(user.url);
                if(cached){
                    const cacheAge = Date.now() - (cached.cachedAt || 0);
                    if(cacheAge < 24 * 60 * 60 * 1000){
                        // Use cached data
                        user.name = cached.name;
                        user.avatarUrl = cached.avatarUrl;
                        enrichmentProgress.loaded++;
                        if(onProgress) onProgress(enrichmentProgress);
                        return false; // Skip fetching
                    }
                }
                return true; // Need to fetch
            });
            
            console.log(`📊 ${usersNeedingFetch.length} users need fetching, ${usersToEnrich.length - usersNeedingFetch.length} loaded from cache`);
            
            for(let i = 0; i < usersNeedingFetch.length; i += batchSize){
                const batch = usersNeedingFetch.slice(i, i + batchSize);
                const results = await Promise.allSettled(batch.map(async (user) => {
                    try{
                        const profile = await fetchUserProfile(user.url, 1, false); // Don't use cache (already checked)
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
                
                // Shorter delay between batches (cache reduces load)
                if(i + batchSize < usersNeedingFetch.length){
                    await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced to 1.5 seconds
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
                        async function ghGet(path, retries = 3){
                            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
                            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
                            let lastError;
                            for(let attempt = 0; attempt <= retries; attempt++){
                                try{
                                    if(attempt > 0){
                                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                    }
                                    const r = await fetch(url, { 
                                        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
                                        cache: attempt === 0 ? 'default' : 'no-store'
                                    });
                                    if(r.status === 429){
                                        const waitTime = 60000;
                                        await new Promise(resolve => setTimeout(resolve, waitTime));
                                        continue;
                                    }
                                    if(!r.ok){
                                        lastError = new Error(`GET ${path} ${r.status}`);
                                        if(r.status === 404 || r.status === 401 || attempt >= retries) throw lastError;
                                        continue;
                                    }
                            return await r.json();
                                }catch(e){
                                    lastError = e;
                                    if(attempt < retries && e.message && !e.message.includes('404') && !e.message.includes('401')) continue;
                                    throw e;
                                }
                            }
                            throw lastError || new Error('GitHub GET failed');
                        }
                        
                        async function ghPut(path, content, sha, message, retries = 3){
                            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
                            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
                            const body = { message, content: base64Encode(content), branch, ...(sha ? { sha } : {}) };
                            let lastError;
                            for(let attempt = 0; attempt <= retries; attempt++){
                                try{
                                    if(attempt > 0){
                                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                        if(sha && attempt > 0){
                                            try{
                                                const current = await ghGet(path, 1);
                                                body.sha = current.sha;
                                            }catch(_){}
                                        }
                                    }
                                    const r = await fetch(url, { 
                                        method: 'PUT', 
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
                                        body: JSON.stringify(body)
                                    });
                                    if(r.status === 429){
                                        const waitTime = 60000;
                                        await new Promise(resolve => setTimeout(resolve, waitTime));
                                        continue;
                                    }
                                    if(!r.ok){
                                        lastError = new Error(`PUT ${path} ${r.status}`);
                                        if(r.status === 401 || r.status === 404 || (r.status === 409 && attempt >= retries) || attempt >= retries) throw lastError;
                                        if(r.status === 409) continue; // Retry on conflict
                                        continue;
                                    }
                            return await r.json();
                                }catch(e){
                                    lastError = e;
                                    if(attempt < retries && e.message && !e.message.includes('401') && !e.message.includes('404')) continue;
                                    throw e;
                                }
                            }
                            throw lastError || new Error('GitHub PUT failed');
                        }
                        
                        let base;
                        try{
                            base = await ghGet('data/users.json');
                        }catch(e){
                            base = { sha: null };
                        }
                        
                        await ghPut('data/users.json', JSON.stringify({ users: usersList }, null, 2), base.sha, 'chore(admin): enrich user profiles', 3);
                        // Invalidate cache after saving
                        saveUsersToCache(usersList);
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
            
            async function ghGet(path, retries = 3){
                const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
                let lastError;
                for(let attempt = 0; attempt <= retries; attempt++){
                    try{
                        if(attempt > 0){
                            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                        const r = await fetch(url, { 
                            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
                            cache: attempt === 0 ? 'default' : 'no-store'
                        });
                        if(r.status === 429){
                            const waitTime = 60000;
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }
                        if(!r.ok){
                            lastError = new Error(`GET ${path} ${r.status}`);
                            if(r.status === 404 || r.status === 401 || attempt >= retries) throw lastError;
                            continue;
                        }
                return await r.json();
                    }catch(e){
                        lastError = e;
                        if(attempt < retries && e.message && !e.message.includes('404') && !e.message.includes('401')) continue;
                        throw e;
                    }
                }
                throw lastError || new Error('GitHub GET failed');
            }
            
            async function ghPut(path, content, sha, message, retries = 3){
                const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
                const body = { message, content: base64Encode(content), branch, ...(sha ? { sha } : {}) };
                let lastError;
                for(let attempt = 0; attempt <= retries; attempt++){
                    try{
                        if(attempt > 0){
                            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                            await new Promise(resolve => setTimeout(resolve, delay));
                            if(sha && attempt > 0){
                                try{
                                    const current = await ghGet(path, 1);
                                    body.sha = current.sha;
                                }catch(_){}
                            }
                        }
                        const r = await fetch(url, { 
                            method: 'PUT', 
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
                            body: JSON.stringify(body)
                        });
                        if(r.status === 429){
                            const waitTime = 60000;
                            await new Promise(resolve => setTimeout(resolve, waitTime));
                            continue;
                        }
                        if(!r.ok){
                            lastError = new Error(`PUT ${path} ${r.status}`);
                            if(r.status === 401 || r.status === 404 || (r.status === 409 && attempt >= retries) || attempt >= retries) throw lastError;
                            if(r.status === 409) continue; // Retry on conflict
                            continue;
                        }
                return await r.json();
                    }catch(e){
                        lastError = e;
                        if(attempt < retries && e.message && !e.message.includes('401') && !e.message.includes('404')) continue;
                        throw e;
                    }
                }
                throw lastError || new Error('GitHub PUT failed');
            }
            
            let base;
            try{
                base = await ghGet('data/users.json');
            }catch(e){
                base = { sha: null };
            }
            
            await ghPut('data/users.json', JSON.stringify({ users: usersList }, null, 2), base.sha, 'chore(admin): add user', 3);
            // Invalidate cache after saving
            saveUsersToCache(usersList);
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
        
        // Main input: game URL + optional text with auto-processing
        let autoProcessTimeout = null;
        const mainInput = el('textarea', { 
            placeholder: 'Vložte URL hry (automaticky se zpracuje)\nPříklad: https://www.geoguessr.com/game/TGxYAZhOGxOvuHgb AI Generated World NMPZ 23907', 
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
            onblur: function(){ this.style.borderColor = '#e0e0e0'; },
            oninput: function(){
                // Auto-process after user stops typing (debounce)
                clearTimeout(autoProcessTimeout);
                const inputValue = this.value.trim();
                if(inputValue && inputValue.includes('geoguessr.com/game/')){
                    autoProcessTimeout = setTimeout(async () => {
                        await autoProcessInput();
                    }, 1000); // Wait 1 second after user stops typing
                }
            }
        });
        
        // Auto-process function
        async function autoProcessInput(){
            const inputText = mainInput.value.trim();
            if(!inputText || !inputText.includes('geoguessr.com/game/')) return;
            
            try{
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#e3f2fd';
                statusDiv.style.color = '#1565c0';
                statusDiv.textContent = '🔄 Automatické zpracování...';
                
                const data = await parseAndFetchGameData(inputText);
                
                if(data.error){
                    statusDiv.style.background = '#fff3cd';
                    statusDiv.style.color = '#856404';
                    statusDiv.textContent = '⚠️ ' + data.error;
                    return;
                }
                
                // Auto-fill all fields
                if(data.rank) rank.value = data.rank;
                if(data.resultLabel) resultLabel.value = data.resultLabel;
                if(data.resultUrl) resultUrl.value = data.resultUrl;
                
                // Auto-match or auto-add user
                if(data.playerUrl){
                    let matchedUser = usersList.find(u => u.url === data.playerUrl);
                    
                    if(!matchedUser){
                        // User not in list - try to add automatically
                        statusDiv.textContent = '👤 Přidávám nového uživatele...';
                        try{
                            const newUser = await addUser(data.playerUrl);
                            if(newUser){
                                await loadUsers();
                                matchedUser = usersList.find(u => u.url === data.playerUrl);
                            }
                        }catch(e){
                            console.warn('Failed to auto-add user:', e);
                        }
                    }
                    
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
                        }else{
                            userSelectButton.appendChild(el('div', { 
                                style: { width: '28px', height: '28px', borderRadius: '4px', background: '#e0e0e0', flexShrink: 0 }
                            }));
                        }
                        userSelectButton.appendChild(el('span', {}, [matchedUser.name || matchedUser.url]));
                        
                        // Auto-enrich user if needed
                        if(!matchedUser.name || !matchedUser.avatarUrl){
                            statusDiv.textContent = '📥 Načítám profil uživatele...';
                            const userInfo = await fetchUserProfile(matchedUser.url);
                            if(userInfo){
                                matchedUser.name = userInfo.name;
                                matchedUser.avatarUrl = userInfo.avatarUrl;
                                updateUserDropdown();
                                // Update button again
                                userSelectButton.innerHTML = '';
                                if(matchedUser.avatarUrl){
                                    userSelectButton.appendChild(el('img', { 
                                        src: matchedUser.avatarUrl, 
                                        style: { width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' },
                                        alt: ''
                                    }));
                                }
                                userSelectButton.appendChild(el('span', {}, [matchedUser.name || matchedUser.url]));
                            }
                        }
                        
                        player.value = matchedUser.name || '';
                        playerUrl.value = matchedUser.url;
                    }else{
                        // User not found, fill manually
                        player.value = data.player || '';
                        playerUrl.value = data.playerUrl;
                    }
                }
                
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                const modeText = data.mode ? ` [${data.mode}]` : '';
                statusDiv.textContent = `✅ Načteno: ${data.resultLabel || 'N/A'}${modeText}`;
                
                // Update preview
                updatePreview(data);
                
                // Show user section if user needs to be selected manually
                if(!selectedUserUrl && !playerUrl.value){
                    const userSectionEl = document.getElementById('user-section');
                    if(userSectionEl) userSectionEl.style.display = 'block';
                }
                
                // Auto-save if all required fields are filled (optional - can be disabled)
                // Uncomment to enable auto-save:
                // if(data.resultUrl && (selectedUserUrl || playerUrl.value) && data.resultLabel){
                //     setTimeout(() => {
                //         statusDiv.textContent = '💾 Automatické uložení za 2 sekundy...';
                //         setTimeout(async () => {
                //             await autoSave();
                //         }, 2000);
                //     }, 1000);
                // }
            }catch(err){ 
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                statusDiv.textContent = '❌ Chyba: ' + (err.message || 'Selhalo zpracování');
                console.error(err);
            }
        }
        
        // Auto-save function
        async function autoSave(){
            try{
                statusDiv.style.background = '#fff3cd';
                statusDiv.style.color = '#856404';
                statusDiv.textContent = '💾 Ukládám...';
                
                const finalPlayerUrl = selectedUserUrl || playerUrl.value || '';
                const finalPlayer = player.value || '';
                
                if(!finalPlayerUrl && !finalPlayer){
                    statusDiv.style.background = '#f8d7da';
                    statusDiv.style.color = '#721c24';
                    statusDiv.textContent = '❌ Chybí URL nebo jméno hráče';
                    return;
                }
                
                // Add timeout to prevent hanging
                const savePromise = saveEdit(ref, { 
                    rank: rank.value || '', 
                    player: finalPlayer, 
                    playerUrl: finalPlayerUrl, 
                    resultLabel: resultLabel.value || '', 
                    resultUrl: resultUrl.value || '' 
                });
                
                // Set a timeout for the save operation (30 seconds)
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Ukládání trvá příliš dlouho. Zkuste to prosím znovu.')), 30000)
                );
                
                await Promise.race([savePromise, timeoutPromise]);
                
                statusDiv.style.background = '#d4edda';
                statusDiv.style.color = '#155724';
                statusDiv.textContent = '✅ Úspěšně uloženo!';
                
                // Clear cache and force refresh
                try {
                    localStorage.removeItem('gg_enriched_cache_v1');
                    localStorage.removeItem('gg_enriched_cache_time_v1');
                } catch(_) {}
                
                setTimeout(() => {
                    removeRoot();
                    // Force page reload to ensure fresh data is loaded
                    window.location.reload();
                }, 1500);
            }catch(err){
                statusDiv.style.background = '#f8d7da';
                statusDiv.style.color = '#721c24';
                const errorMsg = err.message || 'Neznámá chyba';
                statusDiv.textContent = '❌ Chyba při ukládání: ' + errorMsg;
                console.error('Save error:', err);
                
                // Show more helpful error message
                if(errorMsg.includes('timeout') || errorMsg.includes('trvá příliš dlouho')){
                    statusDiv.innerHTML = `
                        <div style="margin-bottom: 8px;">❌ ${errorMsg}</div>
                        <div style="font-size: 12px; opacity: 0.8;">Zkuste to prosím znovu. Pokud problém přetrvá, zkontrolujte konzoli pro více informací.</div>
                    `;
                }
            }
        }
        
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
                clearTimeout(searchDebounceTimeoutMain);
                searchDebounceTimeoutMain = setTimeout(() => {
                    selectedIndexMain = -1;
                updateUserDropdown();
                }, 200);
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
        
        let searchDebounceTimeoutMain = null;
        let isRefreshingMain = false;
        let autoRefreshIntervalMain = null;
        let selectedIndexMain = -1;
        let userItemsMain = [];
        
        // Get recent users from localStorage (shared with Add Record)
        function getRecentUsersMain(){
            try{
                const recent = localStorage.getItem('gg_recent_users');
                return recent ? JSON.parse(recent) : [];
            }catch(e){
                return [];
            }
        }
        
        // Save user to recent users (shared with Add Record)
        function saveRecentUserMain(userUrl){
            try{
                const recent = getRecentUsersMain();
                const index = recent.indexOf(userUrl);
                if(index > -1) recent.splice(index, 1);
                recent.unshift(userUrl);
                // Keep only last 10
                if(recent.length > 10) recent.pop();
                localStorage.setItem('gg_recent_users', JSON.stringify(recent));
            }catch(e){}
        }
        
        function updateUserDropdown(){
            selectedIndexMain = -1;
            userItemsMain = [];
            
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
            
            // Get recent users
            const recentUrls = getRecentUsersMain();
            const recentUsers = recentUrls.map(url => usersList.find(u => u.url === url)).filter(Boolean);
            
            // Add refresh button at top
            const refreshBtn = el('button', {
                tabindex: '-1',
                style: {
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: isRefreshingMain ? '#e0e0e0' : '#f8f9fa',
                    color: isRefreshingMain ? '#999' : '#0b3d91',
                    border: 'none',
                    borderBottom: '1px solid #e0e0e0',
                    cursor: isRefreshingMain ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                },
                disabled: isRefreshingMain,
                onclick: async function(e){
                    e.stopPropagation();
                    if(isRefreshingMain) return;
                    isRefreshingMain = true;
                    this.textContent = '🔄 Obnovuji...';
                    this.style.background = '#e0e0e0';
                    this.style.color = '#999';
                    
                    try{
                        await loadUsers();
                        updateUserDropdown();
                        this.textContent = '✅ Obnoveno';
                        setTimeout(() => {
                            this.textContent = '🔄 Obnovit seznam';
                            this.style.background = '#f8f9fa';
                            this.style.color = '#0b3d91';
                            isRefreshingMain = false;
                        }, 1000);
                    }catch(e){
                        this.textContent = '❌ Chyba';
                        setTimeout(() => {
                            this.textContent = '🔄 Obnovit seznam';
                            this.style.background = '#f8f9fa';
                            this.style.color = '#0b3d91';
                            isRefreshingMain = false;
                        }, 2000);
                    }
                }
            }, ['🔄 Obnovit seznam']);
            userDropdownList.appendChild(refreshBtn);
            
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
            
            // Sort users: with names first, then by name alphabetically
            const sortedUsers = [...usersList].sort((a, b) => {
                const aHasName = !!(a.name && a.name.trim());
                const bHasName = !!(b.name && b.name.trim());
                if(aHasName && !bHasName) return -1;
                if(!aHasName && bHasName) return 1;
                if(aHasName && bHasName) {
                    return (a.name || '').localeCompare(b.name || '', 'cs');
                }
                return 0;
            });
            
            // Filter users - show only those that match search or all if no search
            const searchTerm = userSearchInput && userSearchInput.value ? userSearchInput.value.toLowerCase().trim() : '';
            const filteredUsers = searchTerm 
                ? sortedUsers.filter(u => {
                    const name = (u.name || '').toLowerCase();
                    const urlId = (u.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || '').toLowerCase();
                    const urlLower = u.url.toLowerCase();
                    return name.includes(searchTerm) || urlId.includes(searchTerm) || urlLower.includes(searchTerm);
                })
                : sortedUsers;
            
            // Separate recent users from filtered (only if not searching)
            const displayRecentUsers = !searchTerm && recentUsers.length > 0 ? recentUsers : [];
            const displayRegularUsers = searchTerm ? filteredUsers : filteredUsers.filter(u => !recentUrls.includes(u.url));
            
            // Show recent users section
            if(displayRecentUsers.length > 0){
                const recentHeader = el('div', {
                    style: {
                        padding: '8px 12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#0b3d91',
                        background: '#e3f2fd',
                        borderBottom: '1px solid #bbdefb',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }
                }, ['🕒 Nedávní uživatelé']);
                userDropdownList.appendChild(recentHeader);
                
                displayRecentUsers.forEach(user => {
                    const userItem = createUserItemMain(user, true);
                    userDropdownList.appendChild(userItem);
                });
                
                // Separator
                const separator = el('div', {
                    style: {
                        padding: '8px 12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#666',
                        background: '#f8f9fa',
                        borderBottom: '1px solid #e0e0e0',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }
                }, ['Všichni uživatelé']);
                userDropdownList.appendChild(separator);
            }
            
            // Show count if filtered
            if(filteredUsers.length !== sortedUsers.length){
                const countInfo = el('div', {
                    style: {
                        padding: '6px 12px',
                        fontSize: '11px',
                        color: '#666',
                        background: '#f8f9fa',
                        borderBottom: '1px solid #e0e0e0',
                        textAlign: 'center'
                    }
                }, [`Zobrazeno ${filteredUsers.length} z ${sortedUsers.length} uživatelů`]);
                userDropdownList.appendChild(countInfo);
            }
            
            if(displayRegularUsers.length === 0 && displayRecentUsers.length === 0){
                const noResults = el('div', {
                    style: {
                        padding: '20px',
                        textAlign: 'center',
                        color: '#999',
                        fontSize: '14px'
                    }
                }, [searchTerm ? 'Žádní uživatelé nenalezeni' : 'Žádní uživatelé']);
                userDropdownList.appendChild(noResults);
                return; // Don't render users if no results
            }
            
            // Create user item function
            function createUserItemMain(user, isRecent = false){
                const itemIndex = userItemsMain.length;
                const item = el('div', {
                    'data-user-index': itemIndex,
                    'data-user-url': user.url,
                    role: 'option',
                    tabindex: '-1',
                    className: 'user-item',
                    style: {
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'all 0.2s ease',
                        position: 'relative',
                        outline: 'none'
                    },
                    onmouseenter: function(){
                        selectedIndexMain = itemIndex;
                        updateSelectedItemMain();
                        if(this.querySelector('.user-refresh-btn')){
                            this.querySelector('.user-refresh-btn').style.opacity = '1';
                        }
                        if(this.querySelector('.user-copy-btn')){
                            this.querySelector('.user-copy-btn').style.opacity = '1';
                        }
                    },
                    onmouseleave: function(){
                        if(this.querySelector('.user-refresh-btn')){
                            this.querySelector('.user-refresh-btn').style.opacity = '0';
                        }
                        if(this.querySelector('.user-copy-btn')){
                            this.querySelector('.user-copy-btn').style.opacity = '0';
                        }
                    },
                    onclick: async function(e){
                        if(e.target.closest('.user-refresh-btn') || e.target.closest('.user-copy-btn')) return;
                        selectUserMain(user);
                    },
                    onkeydown: function(e){
                        if(e.key === 'Enter' || e.key === ' '){
                            e.preventDefault();
                            selectUserMain(user);
                        }
                    }
                });
                
                function selectUserMain(user){
                    saveRecentUserMain(user.url);
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
                    userSelectButton.appendChild(el('span', {}, [user.name || user.url]));
                    
                    // Fill form fields
                    player.value = user.name || '';
                    playerUrl.value = user.url;
                    
                    // Auto-enrich user if needed (in background, don't block)
                    if(!user.name || !user.avatarUrl){
                        (async () => {
                            try{
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
                                    // Update form fields
                                    player.value = user.name || '';
                                }
                            }catch(e){
                                console.warn('Failed to enrich user:', e);
                            }
                        })();
                    }
                    
                    if(autoRefreshIntervalMain){
                        clearInterval(autoRefreshIntervalMain);
                        autoRefreshIntervalMain = null;
                    }
                }
                
                // Avatar with fallback
                if(user.avatarUrl){
                    const avatarImg = el('img', { 
                        src: user.avatarUrl, 
                        style: { width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 },
                        alt: '',
                        onerror: function(){
                            this.src = '';
                            this.style.display = 'none';
                            const placeholder = this.nextSibling;
                            if(placeholder) placeholder.style.display = 'flex';
                        }
                    });
                    item.appendChild(avatarImg);
                }
                
                const avatarPlaceholder = el('div', { 
                    style: { 
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '4px', 
                        background: user.avatarUrl ? 'transparent' : '#e0e0e0', 
                        flexShrink: 0,
                        display: user.avatarUrl ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: '#999',
                        fontWeight: '600'
                    } 
                }, [user.name ? user.name.charAt(0).toUpperCase() : '?']);
                item.appendChild(avatarPlaceholder);
                
                // User info
                const userInfo = el('div', { style: { flex: '1', minWidth: 0 } });
                const displayName = user.name || (user.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || 'Unknown');
                const userName = el('div', { 
                    style: { 
                        fontWeight: '600', 
                        fontSize: '14px',
                        color: user.name ? '#333' : '#999',
                        fontStyle: user.name ? 'normal' : 'italic',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    } 
                }, [displayName]);
                const userUrl = el('div', { 
                    style: { 
                        fontSize: '12px', 
                        color: '#999',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                    } 
                }, [user.url]);
                userInfo.appendChild(userName);
                userInfo.appendChild(userUrl);
                item.appendChild(userInfo);
                
                // Action buttons container
                const actionButtons = el('div', {
                    style: {
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                        flexShrink: 0
                    }
                });
                
                // Copy URL button
                const copyBtn = el('button', {
                    class: 'user-copy-btn',
                    'aria-label': 'Kopírovat URL uživatele',
                    title: 'Kopírovat URL',
                    style: {
                        padding: '4px 8px',
                        fontSize: '10px',
                        background: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        opacity: '0',
                        transition: 'opacity 0.2s ease',
                        flexShrink: 0
                    },
                    onclick: async function(e){
                        e.stopPropagation();
                        try{
                            await navigator.clipboard.writeText(user.url);
                            const originalText = this.textContent;
                            this.textContent = '✓';
                            this.style.background = '#2e7d32';
                            setTimeout(() => {
                                this.textContent = originalText;
                                this.style.background = '#4caf50';
                            }, 1000);
                        }catch(err){
                            console.warn('Failed to copy:', err);
                        }
                    }
                }, ['📋']);
                actionButtons.appendChild(copyBtn);
                
                // Refresh button for individual user (appears on hover)
                if(!user.name || !user.avatarUrl){
                    const refreshUserBtn = el('button', {
                        class: 'user-refresh-btn',
                        'aria-label': 'Obnovit profil uživatele',
                        title: 'Obnovit profil',
                        style: {
                            padding: '4px 8px',
                            fontSize: '10px',
                            background: '#0b3d91',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            opacity: '0',
                            transition: 'opacity 0.2s ease',
                            flexShrink: 0
                        },
                        onclick: async function(e){
                            e.stopPropagation();
                            this.disabled = true;
                            this.textContent = '...';
                            try{
                                const profile = await fetchUserProfile(user.url);
                                if(profile){
                                    user.name = profile.name;
                                    user.avatarUrl = profile.avatarUrl;
                                    updateUserDropdown();
                                }
                            }catch(err){
                                console.warn('Failed to refresh user:', err);
                            }
                            this.disabled = false;
                            this.textContent = '🔄';
                        }
                    }, ['🔄']);
                    actionButtons.appendChild(refreshUserBtn);
                }
                
                item.appendChild(actionButtons);
                userItemsMain.push(item);
                return item;
            }
            
            // Render regular users
            displayRegularUsers.forEach(user => {
                const userItem = createUserItemMain(user, false);
                userDropdownList.appendChild(userItem);
            });
        }
        
        // Helper functions for keyboard navigation (must be outside createUserItemMain)
        function updateSelectedItemMain(){
            userItemsMain.forEach((item, idx) => {
                if(idx === selectedIndexMain){
                    item.style.background = '#e3f2fd';
                    item.style.borderLeft = '3px solid #0b3d91';
                    item.setAttribute('aria-selected', 'true');
                    item.focus();
                }else{
                    item.style.background = idx % 2 === 0 ? '#fff' : '#fafafa';
                    item.style.borderLeft = 'none';
                    item.setAttribute('aria-selected', 'false');
                }
            });
        }
        
        function scrollToSelectedMain(){
            if(selectedIndexMain >= 0 && selectedIndexMain < userItemsMain.length){
                const selectedItem = userItemsMain[selectedIndexMain];
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
        
        // Auto-refresh dropdown every 30 seconds if open
        userSelectButton.addEventListener('click', function(){
            const isOpen = userDropdownList.style.display === 'block';
            if(isOpen){
                // Start auto-refresh
                autoRefreshIntervalMain = setInterval(async () => {
                    if(userDropdownList.style.display === 'block' && !isRefreshingMain){
                        try{
                            await loadUsers();
                            updateUserDropdown();
                        }catch(e){
                            console.warn('Auto-refresh failed:', e);
                        }
                    }
                }, 30000); // Refresh every 30 seconds
            } else {
                // Stop auto-refresh when closed
                if(autoRefreshIntervalMain){
                    clearInterval(autoRefreshIntervalMain);
                    autoRefreshIntervalMain = null;
                }
            }
        });
        
        // Keyboard navigation for main dropdown
        userSearchInput.addEventListener('keydown', function(e){
            if(userDropdownList.style.display !== 'block') return;
            
            if(e.key === 'ArrowDown'){
                e.preventDefault();
                selectedIndexMain = Math.min(selectedIndexMain + 1, userItemsMain.length - 1);
                updateSelectedItemMain();
                scrollToSelectedMain();
            }else if(e.key === 'ArrowUp'){
                e.preventDefault();
                selectedIndexMain = Math.max(selectedIndexMain - 1, -1);
                if(selectedIndexMain === -1){
                    userSearchInput.focus();
                    userItemsMain.forEach(item => {
                        item.style.background = '';
                        item.style.borderLeft = 'none';
                    });
                }else{
                    updateSelectedItemMain();
                    scrollToSelectedMain();
                }
            }else if(e.key === 'Enter' && selectedIndexMain >= 0){
                e.preventDefault();
                const selectedItem = userItemsMain[selectedIndexMain];
                if(selectedItem){
                    const userUrl = selectedItem.getAttribute('data-user-url');
                    const user = usersList.find(u => u.url === userUrl);
                    if(user){
                        selectedItem.click();
                    }
                }
            }else if(e.key === 'Escape'){
                e.preventDefault();
                userDropdownList.style.display = 'none';
                if(autoRefreshIntervalMain){
                    clearInterval(autoRefreshIntervalMain);
                    autoRefreshIntervalMain = null;
                }
            }
        });
        
        // Close dropdown when clicking outside
        const closeDropdownHandlerMain = function(e){
            if(!userDropdownWrapper.contains(e.target)){
                userDropdownList.style.display = 'none';
                selectedIndexMain = -1;
                if(autoRefreshIntervalMain){
                    clearInterval(autoRefreshIntervalMain);
                    autoRefreshIntervalMain = null;
            }
            }
        };
        document.addEventListener('click', closeDropdownHandlerMain);
        
        // Load users on open - DON'T auto-enrich to avoid rate limits
        loadUsers().then(() => {
            updateUserDropdown();
            // Only show message if some users are missing data
            const usersNeedingEnrichment = usersList.filter(u => !u.name || !u.avatarUrl);
            if(usersNeedingEnrichment.length > 0){
                statusDiv.style.display = 'block';
                statusDiv.style.background = '#fff3cd';
                statusDiv.style.color = '#856404';
                statusDiv.textContent = `ℹ️ ${usersNeedingEnrichment.length} users need profile data. Click "Reload Users" to fetch.`;
            }
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
        
        // Preview section showing parsed data
        const previewSection = el('div', {
            style: { 
                display: 'none',
                marginBottom: '16px',
                padding: '16px',
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                borderRadius: '12px',
                border: '1px solid rgba(11,61,145,0.2)'
            },
            id: 'preview-section'
        });
        
        function updatePreview(data){
            if(!data || data.error){
                previewSection.style.display = 'none';
                        return; 
                    }
                    
            // Clear and rebuild preview
            previewSection.innerHTML = '';
            previewSection.style.display = 'block';
            
            const previewTitle = el('div', {
                style: {
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#0b3d91',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }
            }, ['👁️ Náhled dat']);
            previewSection.appendChild(previewTitle);
            
            const previewGrid = el('div', {
                style: {
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px',
                    fontSize: '13px'
                }
            });
            
            if(data.resultLabel){
                previewGrid.appendChild(el('div', { style: { fontWeight: '600', color: '#666' } }, ['Skóre:']));
                previewGrid.appendChild(el('div', { style: { color: '#0b3d91', fontWeight: '600' } }, [String(data.resultLabel)]));
            }
            
            const playerName = selectedUserUrl ? (usersList.find(u => u.url === selectedUserUrl)?.name || player.value) : (data.player || player.value || '');
            const playerUrlDisplay = selectedUserUrl || data.playerUrl || playerUrl.value || '';
            
            if(playerName || playerUrlDisplay){
                previewGrid.appendChild(el('div', { style: { fontWeight: '600', color: '#666' } }, ['Hráč:']));
                previewGrid.appendChild(el('div', { style: { color: '#0b3d91' } }, [playerName || playerUrlDisplay || '-']));
            }
            
            if(data.mode){
                previewGrid.appendChild(el('div', { style: { fontWeight: '600', color: '#666' } }, ['Mód:']));
                previewGrid.appendChild(el('div', { style: { color: '#0b3d91' } }, [String(data.mode)]));
            }
            
            const rankValue = rank.value || data.rank || '';
            if(rankValue){
                previewGrid.appendChild(el('div', { style: { fontWeight: '600', color: '#666' } }, ['Pořadí:']));
                previewGrid.appendChild(el('div', { style: { color: '#0b3d91' } }, [String(rankValue)]));
            }
            
            previewSection.appendChild(previewGrid);
        }
        
        // Update preview when fields change
        const updatePreviewDebounced = (() => {
            let timeout;
            return () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    const data = {
                        resultLabel: resultLabel.value,
                        resultUrl: resultUrl.value,
                        rank: rank.value,
                        mode: mainInput.value.match(/NMPZ|NM|MOVING/i)?.[0] || ''
                    };
                    updatePreview(data);
                }, 300);
            };
        })();
        
        // Add listeners to update preview
        if(resultLabel) resultLabel.addEventListener('input', updatePreviewDebounced);
        if(rank) rank.addEventListener('input', updatePreviewDebounced);
        
        // Manual process button (backup if auto-process fails)
        const btnProcess = el('button', { 
            style: { 
                padding: '10px 20px', 
                fontSize: '14px', 
                fontWeight: '600', 
                background: '#6c757d', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '12px',
                width: '100%'
            },
            onmouseenter: function(){ this.style.background = '#5a6268'; },
            onmouseleave: function(){ this.style.background = '#6c757d'; }, 
            onclick: async ()=>{
                await autoProcessInput();
            } 
        }, ['🔄 Zpracovat ručně']);
        
        // Button container with better layout
        const buttonContainer = el('div', {
            style: {
                display: 'flex',
                gap: '12px',
                marginTop: '16px'
            }
        });
        
        const btnSave = el('button', { 
            style: { 
                padding: '14px 28px', 
                fontSize: '16px', 
                fontWeight: '700', 
                background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)', 
                color: '#fff', 
                border: 'none', 
                borderRadius: '10px', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(40,167,69,0.3)',
                flex: '2'
            },
            onmouseenter: function(){ 
                this.style.background = 'linear-gradient(135deg, #34ce57 0%, #28d9a8 100%)'; 
                this.style.transform = 'translateY(-2px)'; 
                this.style.boxShadow = '0 6px 16px rgba(40,167,69,0.4)'; 
            },
            onmouseleave: function(){ 
                this.style.background = 'linear-gradient(135deg, #28a745 0%, #20c997 100%)'; 
                this.style.transform = 'translateY(0)'; 
                this.style.boxShadow = '0 4px 12px rgba(40,167,69,0.3)'; 
            }, 
            onclick: async ()=>{
                await autoSave();
            } 
        }, ['💾 Uložit']);
        
        const btnCancel = el('button', { 
            style: { 
                padding: '14px 28px', 
                fontSize: '16px', 
                fontWeight: '600', 
                background: '#fff', 
                color: '#666', 
                border: '2px solid #ddd', 
                borderRadius: '10px', 
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                flex: '1'
            },
            onmouseenter: function(){ 
                this.style.borderColor = '#999'; 
                this.style.background = '#f8f9fa'; 
            },
            onmouseleave: function(){ 
                this.style.borderColor = '#ddd'; 
                this.style.background = '#fff'; 
            },
            onclick: ()=>{
                removeRoot();
            } 
        }, ['Zrušit']);
        
        buttonContainer.appendChild(btnSave);
        buttonContainer.appendChild(btnCancel);

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
        
        // Add preview section after input
        adminCard.appendChild(previewSection);
        
        // Simplified user section - only show if needed
        const userSection = el('div', { 
            style: { 
                marginBottom: '20px',
                display: 'none' // Hidden by default, shown when user needs to be selected
            },
            id: 'user-section'
        });
        userSection.appendChild(el('label', { 
            style: { 
                display: 'block', 
                marginBottom: '10px', 
                marginTop: '20px', 
                fontWeight: '600', 
                fontSize: '15px',
                color: '#333'
            } 
        }, ['Vyberte uživatele:']));
        userSection.appendChild(userDropdownWrapper);
        adminCard.appendChild(userSection);
        
        // Collapsible sections
        adminCard.appendChild(addUserSection);
        adminCard.appendChild(advancedToggle);
        adminCard.appendChild(advancedSection);
        
        // Manual process button (only shown if auto-process fails)
        const manualProcessSection = el('div', {
            style: {
                display: 'none',
                marginBottom: '12px'
            },
            id: 'manual-process-section'
        });
        manualProcessSection.appendChild(btnProcess);
        adminCard.appendChild(manualProcessSection);
        
        // Button group with improved layout
        const buttonGroup = el('div', { 
            style: { 
                marginTop: '24px', 
                paddingTop: '20px',
                borderTop: '1px solid rgba(0,0,0,0.1)'
            } 
        });
        buttonGroup.appendChild(buttonContainer);
        adminCard.appendChild(buttonGroup);
        
        root.appendChild(adminCard);
    }

    async function fetchNextData(url){
        const res = await fetchWithProxy(url, 2);
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

    // Enrichment function for saveEdit - enriches groups with map and player data
    async function enrichGroupsData(groups){
        return enrichGroupsDataWithCache(groups, new Map(), new Map());
    }
    
    // Force full enrichment - fetches all data from scratch and converts to base64
    async function forceFullEnrichment(){
        const owner = 'filipjarolim';
        const repo = 'Geoguessr-cesko-Rekordy';
        const branch = 'main';
        
        function getGitHubTokenLocal(){
            // Check multiple sources in order of priority
            const token = localStorage.getItem('gg_pat') || 
                         (typeof window !== 'undefined' && window.GITHUB_TOKEN) ||
                         '';
            
            if(!token){
                const errorMsg = 'Missing GitHub token. ' +
                    'Make sure you ran: npm run inject-token (or npm run dev) ' +
                    'to load token from .env file. ' +
                    'Or set window.GITHUB_TOKEN in browser console.';
                console.error('❌', errorMsg);
                throw new Error(errorMsg);
            }
            
            return token;
        }
        
        const token = getGitHubTokenLocal();
        
        async function ghGet(path){
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
            const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } });
            if(!r.ok) throw new Error(`GET failed: ${r.status}`);
            return await r.json();
        }
        
        async function ghPut(path, content, sha, message){
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
            const body = { message, content: btoa(unescape(encodeURIComponent(content))), branch };
            if(sha) body.sha = sha;
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
                throw new Error(`PUT failed: ${r.status} - ${errorText.substring(0, 100)}`);
            }
            return await r.json();
        }
        
        console.log('🚀 Starting FORCE FULL ENRICHMENT...');
        showSuccessNotification('🚀 Starting full enrichment. This will take several minutes...');
        
        // Load leaderboards.json
        let leaderboardsBase, leaderboardsData;
        try {
            leaderboardsBase = await ghGet('data/leaderboards.json');
            if(leaderboardsBase && leaderboardsBase.content) {
                leaderboardsData = JSON.parse(decodeURIComponent(escape(atob(leaderboardsBase.content))));
            }
        } catch(e) {
            throw new Error('Failed to load leaderboards.json: ' + e.message);
        }
        
        if(!leaderboardsData || !leaderboardsData.groups) {
            throw new Error('No leaderboard data found.');
        }
        
        console.log(`📊 Found ${leaderboardsData.groups.length} groups to enrich`);
        
        // Run enrichment with base64 conversion - NO CACHE, force fresh fetch
        const groupsCopy = JSON.parse(JSON.stringify(leaderboardsData.groups));
        const enrichedData = await enrichGroupsDataWithCache(groupsCopy, new Map(), new Map());
        
        // Verify we got data
        let hasData = false;
        let mapCount = 0;
        let playerCount = 0;
        let imageCount = 0;
        
        for(const group of enrichedData.groups){
            for(const card of group.cards || []){
                if(card.map){
                    hasData = true;
                    mapCount++;
                    if(card.map.heroImage) imageCount++;
                    if(card.map.coverAvatar) imageCount++;
                    if(card.map.creator?.avatarImage) imageCount++;
                    if(card.map.creator?.pinImage) imageCount++;
                }
                for(const entry of card.entries || []){
                    if(entry.playerInfo){
                        hasData = true;
                        playerCount++;
                        if(entry.playerInfo.avatarImage) imageCount++;
                        if(entry.playerInfo.pinImage) imageCount++;
                    }
                }
            }
        }
        
        if(!hasData){
            throw new Error('Enrichment completed but no data was fetched. Check console for errors.');
        }
        
        console.log(`✅ Enrichment complete: ${mapCount} maps, ${playerCount} players, ${imageCount} images`);
        
        const enrichedPayload = {
            generatedAt: new Date().toISOString(),
            source: 'https://www.geoguessr.com',
            groups: enrichedData.groups,
            lookupCounts: enrichedData.stats
        };
        
        // Get existing SHA if file exists
        let enrichedSha = null;
        try {
            const existing = await ghGet('data/enrichedLeaderboards.json');
            enrichedSha = existing.sha;
        } catch(e) {
            // File doesn't exist, that's okay
        }
        
        await ghPut('data/enrichedLeaderboards.json', JSON.stringify(enrichedPayload, null, 2), enrichedSha, 'chore(admin): force full enrichment with base64 images', 3);
        
        console.log(`✅ Saved enriched data: ${mapCount} maps, ${playerCount} players`);
        showSuccessNotification(`✅ Enrichment complete! ${mapCount} maps, ${playerCount} players, ${imageCount} images saved.`);
        
        // Clear cache
        localStorage.removeItem('gg_enriched_cache_v1');
        localStorage.removeItem('gg_enriched_cache_time_v1');
    }
    
    // REMOVED: migrateAllImagesToBase64 - replaced by server-side script (scripts/fetchImagesToBase64.js)
    // Use npm run fetch-images instead - it runs on Node.js server and bypasses CORS restrictions
    
    async function enrichGroupsDataWithCache(groups, existingMapCache = new Map(), existingPlayerCache = new Map()){
        const mapCache = new Map(existingMapCache);
        const playerCache = new Map(existingPlayerCache);
        
        // Load user avatars from users.json as fallback
        try{
            const usersResponse = await fetch('data/users.json?cb=' + Date.now());
            if(usersResponse.ok){
                const usersData = await usersResponse.json();
                if(usersData && usersData.users && Array.isArray(usersData.users)){
                    for(const user of usersData.users){
                        if(user.url && user.avatarUrl && !playerCache.has(user.url)){
                            // Add to cache as fallback
                            playerCache.set(user.url, {
                                nick: user.name || null,
                                userId: user.url.match(/\/user\/([a-z0-9]+)/i)?.[1] || null,
                                url: user.url,
                                avatarImage: user.avatarUrl,
                                pinImage: null
                            });
                        }
                    }
                    console.log(`📦 Loaded ${usersData.users.length} user avatars from users.json as fallback`);
                }
            }
        }catch(e){
            console.warn('Failed to load users.json for fallback:', e.message);
        }
        
        async function fetchNextData(url, retries = 2){
            try{
                const res = await fetchWithProxy(url, retries);
                const html = await res.text();
                const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                if(!m) throw new Error('Missing __NEXT_DATA__');
                return JSON.parse(m[1]);
            }catch(e){
                console.warn(`Failed to fetch ${url}:`, e.message);
                return null;
            }
        }
        
        function buildImageUrl(path, width = 256, height = 256){
            return path ? `https://www.geoguessr.com/images/resize:auto:${width}:${height}/gravity:ce/plain/${path}` : null;
        }
        
        // Fetch image and convert to base64 data URL
        // Uses comprehensive strategies with multiple fallbacks
        // NOTE: For better reliability, use server-side script: npm run fetch-images
        async function fetchImageAsBase64(imageUrl){
            if(!imageUrl) return null;
            
            // If already a data URL, return as-is
            if(imageUrl.startsWith('data:')) return imageUrl;
            
            // Strategy 1: Try direct fetch first (images often don't need CORS proxy)
            try{
                console.log(`  🖼️ [1/4] Direct fetch: ${imageUrl.substring(0, 50)}...`);
                const directRes = await fetch(imageUrl, {
                    mode: 'cors',
                    credentials: 'omit',
                    headers: {
                        'Accept': 'image/*',
                    }
                });
                
                if(directRes.ok){
                    const blob = await directRes.blob();
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    console.log(`  ✅ Direct fetch successful`);
                    return base64;
                }
            }catch(directError){
                // Direct fetch failed, continue to next strategy
            }
            
            // Strategy 2: Use img element + canvas (bypasses CORS for images)
            try{
                console.log(`  🖼️ [2/4] Img+canvas: ${imageUrl.substring(0, 50)}...`);
                const base64 = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    const timeout = setTimeout(() => {
                        reject(new Error('Image load timeout'));
                    }, 20000); // 20s timeout
                    
                    img.onload = function(){
                        clearTimeout(timeout);
                        try{
                            const canvas = document.createElement('canvas');
                            canvas.width = img.naturalWidth;
                            canvas.height = img.naturalHeight;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0);
                            const dataUrl = canvas.toDataURL('image/png');
                            console.log(`  ✅ Img+canvas successful`);
                            resolve(dataUrl);
                        }catch(canvasError){
                            reject(canvasError);
                        }
                    };
                    
                    img.onerror = function(){
                        clearTimeout(timeout);
                        reject(new Error('Image load failed'));
                    };
                    
                    img.src = imageUrl;
                });
                return base64;
            }catch(imgError){
                // Img+canvas failed, continue to proxy
            }
            
            // Strategy 3: Try proxy with comprehensive retry logic
            try{
                console.log(`  🖼️ [3/4] Proxy fetch: ${imageUrl.substring(0, 50)}...`);
                const res = await fetchWithProxy(imageUrl, 5); // More retries
                if(!res.ok) {
                    console.warn(`  ⚠️ Proxy returned ${res.status}`);
                    throw new Error(`HTTP ${res.status}`);
                }
                const blob = await res.blob();
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                console.log(`  ✅ Proxy fetch successful`);
                return base64;
            }catch(proxyError){
                console.log(`  ⚠️ Proxy failed: ${proxyError.message}`);
            }
            
            // Strategy 4: Last resort - try no-cors fetch and create blob URL
            // Note: This won't work for base64 conversion, but we can try
            try{
                console.log(`  🖼️ [4/4] No-cors fallback: ${imageUrl.substring(0, 50)}...`);
                const noCorsRes = await fetch(imageUrl, {
                    mode: 'no-cors',
                    credentials: 'omit'
                });
                
                if(noCorsRes.type === 'opaque'){
                    // Can't read opaque response, but image might load in browser
                    console.warn(`  ⚠️ No-cors returned opaque response, cannot convert to base64`);
                    // Return original URL as fallback
                    return imageUrl;
                }
            }catch(noCorsError){
                // No-cors also failed
            }
            
            // All strategies failed
            console.warn(`  ❌ All methods failed for ${imageUrl.substring(0, 50)}...`);
            // Return original URL so at least something is stored
            return imageUrl;
        }
        
        async function hydrateMap(mapUrl){
            if(!mapUrl) return null;
            if(mapCache.has(mapUrl)) {
                const cached = mapCache.get(mapUrl);
                if(cached !== null) return cached; // Return cached data (null means failed before)
            }
            
            try{
                const slug = new URL(mapUrl).pathname.split('/').filter(Boolean).at(-1);
                if(!slug) {
                    mapCache.set(mapUrl, null);
                    return null;
                }
                
                console.log(`  📍 Fetching map: ${slug}`);
                const data = await fetchNextData(`https://www.geoguessr.com/maps/${slug}`);
                const map = data?.props?.pageProps?.map;
                if(!map) {
                    console.warn(`  ⚠️ Map data not found for ${slug}`);
                    mapCache.set(mapUrl, null);
                    return null;
                }
                
                const creator = map.creator || {};
                
                // Fetch images and convert to base64
                const heroImageUrl = buildImageUrl(creator.pin?.path, 512, 512);
                const coverAvatarUrl = buildImageUrl(creator.avatar?.fullBodyPath, 320, 320);
                const creatorAvatarUrl = buildImageUrl(creator.avatar?.fullBodyPath);
                const creatorPinUrl = buildImageUrl(creator.pin?.path);
                
                // Only fetch if not already base64 (from cache)
                const heroImage = heroImageUrl && !heroImageUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(heroImageUrl) 
                    : heroImageUrl;
                await new Promise(r => setTimeout(r, 2000)); // 2s delay between image fetches to avoid rate limits
                const coverAvatar = coverAvatarUrl && !coverAvatarUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(coverAvatarUrl) 
                    : coverAvatarUrl;
                await new Promise(r => setTimeout(r, 2000));
                const creatorAvatar = creatorAvatarUrl && !creatorAvatarUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(creatorAvatarUrl) 
                    : creatorAvatarUrl;
                await new Promise(r => setTimeout(r, 2000));
                const creatorPin = creatorPinUrl && !creatorPinUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(creatorPinUrl) 
                    : creatorPinUrl;
                
                const enriched = {
                    id: map.id,
                    slug,
                    name: map.name,
                    description: map.description || null,
                    playUrl: map.playUrl ? `https://www.geoguessr.com${map.playUrl}` : null,
                    likes: map.likes ?? null,
                    plays: map.numFinishedGames ?? null,
                    averageScore: map.averageScore ?? null,
                    coordinateCount: map.coordinateCount ?? null,
                    difficulty: map.difficulty || null,
                    difficultyLevel: map.difficultyLevel || null,
                    tags: map.tags || [],
                    createdAt: map.createdAt || null,
                    updatedAt: map.updatedAt || null,
                    heroImage: heroImage,
                    coverAvatar: coverAvatar,
                    creator: {
                        nick: creator.nick || null,
                        userId: creator.userId || null,
                        profileUrl: creator.url ? `https://www.geoguessr.com${creator.url}` : null,
                        countryCode: creator.countryCode || null,
                        isVerified: !!creator.isVerified,
                        isProUser: !!creator.isProUser,
                        avatarImage: creatorAvatar,
                        pinImage: creatorPin
                    }
                };
                
                mapCache.set(mapUrl, enriched);
                return enriched;
            }catch(e){
                console.warn(`Failed to hydrate map ${mapUrl}:`, e.message);
                mapCache.set(mapUrl, null);
                return null;
            }
        }
        
        async function hydratePlayer(playerUrl){
            if(!playerUrl) return null;
            if(playerCache.has(playerUrl)) {
                const cached = playerCache.get(playerUrl);
                if(cached !== null) return cached; // Return cached data (null means failed before)
            }
            
            try{
                const slug = new URL(playerUrl).pathname.split('/').filter(Boolean).at(-1);
                if(!slug) {
                    playerCache.set(playerUrl, null);
                    return null;
                }
                
                console.log(`  👤 Fetching player: ${slug}`);
                const data = await fetchNextData(`https://www.geoguessr.com/user/${slug}`);
                const user = data?.props?.pageProps?.user;
                if(!user) {
                    console.warn(`  ⚠️ User data not found for ${slug}`);
                    playerCache.set(playerUrl, null);
                    return null;
                }
                
                const stats = data?.props?.pageProps?.userBasicStats || {};
                const progress = user.progress || {};
                
                // Fetch images and convert to base64
                const avatarImageUrl = buildImageUrl(user.avatar?.fullBodyPath, 200, 200);
                const pinImageUrl = buildImageUrl(user.pin?.path, 200, 200);
                
                // Only fetch if not already base64 (from cache)
                const avatarImage = avatarImageUrl && !avatarImageUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(avatarImageUrl) 
                    : avatarImageUrl;
                await new Promise(r => setTimeout(r, 2000)); // 2s delay between image fetches to avoid rate limits
                const pinImage = pinImageUrl && !pinImageUrl.startsWith('data:') 
                    ? await fetchImageAsBase64(pinImageUrl) 
                    : pinImageUrl;
                
                const enriched = {
                    nick: user.nick || null,
                    userId: user.userId || slug,
                    url: `https://www.geoguessr.com/user/${slug}`,
                    countryCode: user.countryCode || null,
                    isVerified: !!user.isVerified,
                    isProUser: !!user.isProUser,
                    level: progress.level ?? null,
                    xp: progress.xp ?? null,
                    title: progress.title ?? null,
                    gamesPlayed: stats.gamesPlayed ?? null,
                    averageGameScore: stats.averageGameScore ?? null,
                    maxGameScore: stats.maxGameScore ?? null,
                    streakHighlights: (stats.streakRecords || []).slice(0, 5),
                    avatarImage: avatarImage,
                    pinImage: pinImage
                };
                
                playerCache.set(playerUrl, enriched);
                return enriched;
            }catch(e){
                console.warn(`Failed to hydrate player ${playerUrl}:`, e.message);
                playerCache.set(playerUrl, null);
                return null;
            }
        }
        
        // Collect all unique URLs first
        const mapUrls = new Set();
        const playerUrls = new Set();
        
        for(const group of groups){
            for(const card of group.cards){
                if(card.mapUrl) mapUrls.add(card.mapUrl);
                for(const entry of card.entries){
                    if(entry.playerUrl) playerUrls.add(entry.playerUrl);
                }
            }
        }
        
        // Pre-fetch all maps and players in parallel batches
        const mapArray = Array.from(mapUrls);
        const playerArray = Array.from(playerUrls);
        
        console.log(`Enriching ${mapArray.length} maps and ${playerArray.length} players...`);
        
        // Fetch maps in batches - slower to avoid rate limits
        // Skip fetching if cache already has all maps (to avoid rate limits)
        const mapsToFetch = mapArray.filter(url => !mapCache.has(url) || mapCache.get(url) === null);
        if(mapsToFetch.length > 0){
            console.log(`Fetching ${mapsToFetch.length} new maps (${mapArray.length - mapsToFetch.length} already cached)...`);
            for(let i = 0; i < mapsToFetch.length; i += 1){ // Reduced to 1 at a time
                try{
                    await hydrateMap(mapsToFetch[i]);
                    if(i + 1 < mapsToFetch.length) await new Promise(r => setTimeout(r, 5000)); // 5s delay between requests
                }catch(e){
                    console.warn(`Failed to fetch map ${mapsToFetch[i]}:`, e.message);
                    // Continue with next map even if this one fails
                }
            }
        }else{
            console.log(`All ${mapArray.length} maps already cached, skipping fetch`);
        }
        
        // Fetch players in batches - slower to avoid rate limits
        // Skip fetching if cache already has all players (to avoid rate limits)
        const playersToFetch = playerArray.filter(url => !playerCache.has(url) || playerCache.get(url) === null);
        if(playersToFetch.length > 0){
            console.log(`Fetching ${playersToFetch.length} new players (${playerArray.length - playersToFetch.length} already cached)...`);
            for(let i = 0; i < playersToFetch.length; i += 1){ // Reduced to 1 at a time
                try{
                    await hydratePlayer(playersToFetch[i]);
                    if(i + 1 < playersToFetch.length) await new Promise(r => setTimeout(r, 5000)); // 5s delay between requests
                }catch(e){
                    console.warn(`Failed to fetch player ${playersToFetch[i]}:`, e.message);
                    // Continue with next player even if this one fails
                }
            }
        }else{
            console.log(`All ${playerArray.length} players already cached, skipping fetch`);
        }
        
        // Attach enriched data to groups
        for(const group of groups){
            for(const card of group.cards){
                card.map = mapCache.get(card.mapUrl) || null;
                
                // Fallback: if map fetch failed but we have mapUrl, try to extract map ID and use placeholder
                if(!card.map && card.mapUrl){
                    try{
                        const mapId = card.mapUrl.split('/').filter(Boolean).pop();
                        if(mapId && mapId.match(/^[a-z0-9]+$/i)){
                            // Use a placeholder or try direct CDN URL structure
                            // Note: This won't work without proper path, but at least preserves structure
                            card.map = {
                                id: mapId,
                                slug: mapId,
                                name: card.title || 'Unknown Map',
                                heroImage: null, // Can't generate without path
                                coverAvatar: null
                            };
                        }
                    }catch(_){}
                }
                
                for(const entry of card.entries){
                    entry.playerInfo = playerCache.get(entry.playerUrl) || null;
                    
                    // Fallback: if player fetch failed but we have playerUrl, try to extract user ID
                    if(!entry.playerInfo && entry.playerUrl){
                        try{
                            const userId = entry.playerUrl.match(/\/user\/([a-z0-9]+)/i)?.[1];
                            if(userId){
                                // Use a placeholder structure
                                entry.playerInfo = {
                                    nick: entry.player || 'Unknown',
                                    userId: userId,
                                    url: entry.playerUrl,
                                    avatarImage: null, // Can't generate without path
                                    pinImage: null
                                };
                            }
                        }catch(_){}
                    }
                }
            }
        }
        
        return {
            groups,
            stats: {
                maps: mapCache.size,
                players: playerCache.size
            }
        };
    }

    async function saveEdit(ref, payload){
        // 1) Fetch current JSON
        const owner = 'filipjarolim';
        const repo = 'Geoguessr-cesko-Rekordy';
        const branch = 'main';
        
        function getGitHubTokenLocal(){
            // Check multiple sources in order of priority
            const token = localStorage.getItem('gg_pat') || 
                         (typeof window !== 'undefined' && window.GITHUB_TOKEN) ||
                         '';
            
            if(!token){
                const errorMsg = 'Missing GitHub token. ' +
                    'Make sure you ran: npm run inject-token (or npm run dev) ' +
                    'to load token from .env file. ' +
                    'Or set window.GITHUB_TOKEN in browser console.';
                alert(errorMsg);
                throw new Error('No token');
            }
            
            return token;
        }
        
        const token = getGitHubTokenLocal();
        
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

        async function ghGet(path, retries = 3){
            // URL encode the path properly
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${branch}`;
            
            let lastError;
            for(let attempt = 0; attempt <= retries; attempt++){
                try{
                    if(attempt > 0){
                        // Exponential backoff for retries
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                        console.log(`Retrying GitHub GET (attempt ${attempt + 1}/${retries + 1}) after ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                    
                    const r = await fetch(url, { 
                        headers: { 
                            Authorization: `Bearer ${token}`, 
                            Accept: 'application/vnd.github.v3+json',
                            'If-None-Match': attempt > 0 ? '' : undefined // Remove cache header on retry
                        },
                        cache: attempt === 0 ? 'default' : 'no-store' // Use cache on first attempt
                    });
                    
                    // Handle rate limiting
                    if(r.status === 429){
                        const retryAfter = r.headers.get('Retry-After') || r.headers.get('X-RateLimit-Reset');
                        const waitTime = retryAfter ? (parseInt(retryAfter) * 1000 - Date.now()) : 60000;
                        console.warn(`Rate limited, waiting ${waitTime/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, Math.max(waitTime, 60000)));
                        continue; // Retry after waiting
                    }
                    
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
                        lastError = new Error(errorMsg);
                        // Don't retry on 404 or 401
                        if(r.status === 404 || r.status === 401){
                            throw lastError;
                        }
                        // Retry on other errors
                        if(attempt < retries){
                            continue;
                        }
                        throw lastError;
                    }
                    
                    const data = await r.json();
                    console.log(`✅ GitHub GET successful (attempt ${attempt + 1})`);
                    return data;
                }catch(e){
                    lastError = e;
                    if(attempt < retries && e.message && !e.message.includes('404') && !e.message.includes('401')){
                        continue; // Retry
                    }
                    throw e;
                }
            }
            
            throw lastError || new Error('GitHub GET failed after retries');
        }
        async function ghPut(path, content, sha, message, retries = 3){
            // URL encode the path properly
            const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
            
            const body = { 
                message, 
                content: btoa(unescape(encodeURIComponent(content))), 
                branch 
            };
            
            // Only include SHA if file exists (for update), omit for new file creation
            if(sha) {
                body.sha = sha;
            }
            
            let lastError;
            for(let attempt = 0; attempt <= retries; attempt++){
                try{
                    if(attempt > 0){
                        // Exponential backoff for retries
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                        console.log(`Retrying GitHub PUT (attempt ${attempt + 1}/${retries + 1}) after ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        
                        // Re-fetch SHA if updating (might have changed)
                        if(sha && attempt > 0){
                            try{
                                const current = await ghGet(path, 1);
                                body.sha = current.sha;
                                console.log(`Updated SHA for retry: ${body.sha.substring(0, 7)}...`);
                            }catch(e){
                                console.warn('Failed to refresh SHA:', e);
                            }
                        }
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
                    
                    // Handle rate limiting
                    if(r.status === 429){
                        const retryAfter = r.headers.get('Retry-After') || r.headers.get('X-RateLimit-Reset');
                        const waitTime = retryAfter ? (parseInt(retryAfter) * 1000 - Date.now()) : 60000;
                        console.warn(`Rate limited, waiting ${waitTime/1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, Math.max(waitTime, 60000)));
                        continue; // Retry after waiting
                    }
            
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
                            
                            // Handle 409 conflict (file changed)
                            if(r.status === 409 && sha && attempt < retries){
                                console.warn('File conflict detected, refreshing SHA...');
                                // Will retry with new SHA
                                continue;
                    }
                } catch(e) {
                    errorMsg += `. ${errorText.substring(0, 200)}`;
                }
                        lastError = new Error(errorMsg);
                        // Don't retry on 401 or 404
                        if(r.status === 401 || r.status === 404){
                            throw lastError;
                        }
                        // Retry on other errors
                        if(attempt < retries){
                            continue;
                        }
                        throw lastError;
                    }
                    
                    const data = await r.json();
                    console.log(`✅ GitHub PUT successful (attempt ${attempt + 1})`);
                    return data;
                }catch(e){
                    lastError = e;
                    if(attempt < retries && e.message && !e.message.includes('401') && !e.message.includes('404') && !e.message.includes('403')){
                        continue; // Retry
                    }
                    throw e;
                }
            }
            
            throw lastError || new Error('GitHub PUT failed after retries');
        }
        async function fetchNextDataLocal(url){
            try{
                const res = await fetchWithProxy(url, 2);
                const html = await res.text();
                const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                if(!m) return null;
                return JSON.parse(m[1]);
            }catch(e){
                console.warn(`Failed to fetch ${url}:`, e.message);
                return null;
            }
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
        
        // REVOLUTIONARY APPROACH: Use cardIndex DIRECTLY - it's set during rendering and is 100% accurate
        console.log(`🔍 Looking for card in group "${ref.groupId}"`);
        console.log(`📊 Group has ${group.cards.length} cards`);
        console.log(`🔎 Search criteria:`, {
            cardIndex: ref.cardIndex,
            mapUrl: ref.mapUrl || '(none)',
            variant: ref.variant || '(none)',
            cardId: ref.cardId || '(none)',
            cardTitle: ref.cardTitle || '(none)'
        });
        
        // Log all cards for debugging
        console.log(`📋 All cards in group:`, group.cards.map((c, idx) => ({
            index: idx,
            title: c.title,
            mapUrl: c.mapUrl,
            variant: detectVariant(c),
            entriesCount: c.entries?.length || 0
        })));
        
        let card = null;
        
        // STRATEGY 1: Use cardIndex DIRECTLY (set during rendering, most reliable)
        if(ref.cardIndex != null && ref.cardIndex >= 0 && ref.cardIndex < group.cards.length) {
            card = group.cards[ref.cardIndex];
            if(card) {
                const cardVariant = detectVariant(card);
                console.log(`✅ Found card at index ${ref.cardIndex}: "${card.title || 'Untitled'}"`, {
                    mapUrl: card.mapUrl || '(none)',
                    variant: cardVariant,
                    entriesCount: card.entries?.length || 0,
                    expectedVariant: ref.variant || '(any)',
                    expectedMapUrl: ref.mapUrl || '(any)'
                });
                
                // VERIFY: Check if this is the correct card
                if(ref.mapUrl && card.mapUrl !== ref.mapUrl) {
                    console.warn(`⚠️ WARNING: Card at index ${ref.cardIndex} has different mapUrl!`, {
                        expected: ref.mapUrl,
                        actual: card.mapUrl
                    });
                }
                if(ref.variant && cardVariant !== ref.variant) {
                    console.warn(`⚠️ WARNING: Card at index ${ref.cardIndex} has different variant!`, {
                        expected: ref.variant,
                        actual: cardVariant
                    });
                }
            }
        }
        
        // STRATEGY 2: If cardIndex is out of bounds or card not found, try finding by mapUrl+variant
        if(!card && ref.mapUrl && ref.variant) {
            console.log(`⚠️ CardIndex ${ref.cardIndex} failed, trying mapUrl+variant lookup...`);
            card = group.cards.find(c => {
                const cardVariant = detectVariant(c);
                const mapUrlMatch = c.mapUrl === ref.mapUrl || (!c.mapUrl && !ref.mapUrl);
                const variantMatch = cardVariant === ref.variant;
                return mapUrlMatch && variantMatch;
            });
            if(card) {
                const foundIndex = group.cards.indexOf(card);
                console.log(`✅ Found card by mapUrl+variant at index ${foundIndex}: "${card.title || 'Untitled'}"`);
            }
        }
        
        // STRATEGY 3: Find by mapUrl only
        if(!card && ref.mapUrl) {
            console.log(`⚠️ Trying mapUrl-only lookup...`);
            card = group.cards.find(c => c.mapUrl === ref.mapUrl);
            if(card) {
                const foundIndex = group.cards.indexOf(card);
                console.log(`✅ Found card by mapUrl at index ${foundIndex}: "${card.title || 'Untitled'}"`);
            }
        }
        
        // STRATEGY 4: Create new card if not found
        if(!card) {
            console.warn(`⚠️ Card not found by any method, creating new one...`);
            if(ref.cardIndex != null && ref.cardIndex >= 0) {
            // Fill up to the required index
            while(group.cards.length <= ref.cardIndex) {
                group.cards.push({ title: 'New Card', entries: [] });
            }
            card = group.cards[ref.cardIndex];
                if(ref.mapUrl) card.mapUrl = ref.mapUrl;
                console.log(`✅ Created card at index ${ref.cardIndex}`);
            } else {
                // Append new card
                card = { title: ref.cardTitle || 'New Card', entries: [] };
                if(ref.mapUrl) card.mapUrl = ref.mapUrl;
                group.cards.push(card);
                console.log(`✅ Created new card at end of array (index ${group.cards.length - 1})`);
            }
        }
        
        // FINAL VERIFICATION
        if(card) {
            const finalIndex = group.cards.indexOf(card);
            console.log(`🎯 FINAL RESULT: Using card at index ${finalIndex}:`, {
                title: card.title,
                mapUrl: card.mapUrl,
                variant: detectVariant(card),
                entriesCount: card.entries?.length || 0
            });
        }
        
        // Ensure entries array exists
        if(!card.entries || !Array.isArray(card.entries)) {
            card.entries = [];
        }
        
        // Validate entryIndex if provided
        if(ref.entryIndex != null) {
            if(ref.entryIndex < 0 || ref.entryIndex >= card.entries.length) {
                console.warn(`⚠️ Entry index ${ref.entryIndex} is out of bounds (card has ${card.entries.length} entries). Will create new entry.`);
            } else {
                console.log(`✅ Entry at index ${ref.entryIndex} exists:`, {
                    player: card.entries[ref.entryIndex]?.player,
                    playerUrl: card.entries[ref.entryIndex]?.playerUrl,
                    rank: card.entries[ref.entryIndex]?.rank
                });
            }
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
            // Update existing entry - completely replace with new data
            const oldEntry = card.entries[ref.entryIndex];
            const oldPlayerUrl = oldEntry?.playerUrl;
            const newPlayerUrl = payload.playerUrl || oldPlayerUrl;
            
            // Create clean payload - remove empty/undefined values but keep all provided values
            const cleanPayload = {};
            Object.keys(payload).forEach(key => {
                // Keep all non-empty values, including empty strings if explicitly provided
                if(payload[key] !== undefined && payload[key] !== null) {
                    cleanPayload[key] = payload[key];
                }
            });
            
            // If playerUrl changed, clear old playerInfo (will be fetched during enrichment)
            // Otherwise preserve existing playerInfo if available
            const playerUrlChanged = oldPlayerUrl && newPlayerUrl && oldPlayerUrl !== newPlayerUrl;
            const preservedPlayerInfo = (!playerUrlChanged && oldEntry?.playerInfo) ? oldEntry.playerInfo : null;
            
            // Create updated entry - new data takes precedence, but preserve playerInfo if URL didn't change
            const updatedEntry = {
                ...oldEntry, // Start with old entry
                ...cleanPayload, // Overwrite with new data
                // Handle playerInfo: clear if URL changed, preserve if same, use new if provided
                playerInfo: playerUrlChanged ? null : (cleanPayload.playerInfo || preservedPlayerInfo || null)
            };
            
            // Ensure playerUrl is set if provided
            if(cleanPayload.playerUrl) {
                updatedEntry.playerUrl = cleanPayload.playerUrl;
            }
            // Ensure player name is set if provided
            if(cleanPayload.player) {
                updatedEntry.player = cleanPayload.player;
            }
            
            card.entries[ref.entryIndex] = updatedEntry;
            console.log(`✅ Updated entry at index ${ref.entryIndex}:`, {
                old: { 
                    player: oldEntry?.player, 
                    playerUrl: oldEntry?.playerUrl,
                    resultLabel: oldEntry?.resultLabel,
                    rank: oldEntry?.rank
                },
                new: { 
                    player: updatedEntry.player, 
                    playerUrl: updatedEntry.playerUrl,
                    resultLabel: updatedEntry.resultLabel,
                    rank: updatedEntry.rank
                },
                playerUrlChanged: playerUrlChanged
            });
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
        const res1 = await ghPut(savePath, updatedLeaderboards, base.sha, 'chore(admin): edit entry', 3);
        
        console.log('✅ Leaderboards.json saved successfully');

        // Enrich and update enrichedLeaderboards.json - run in background (non-blocking)
        // Don't await this - let it run in background while user sees success message
        (async () => {
            try {
                console.log('🔄 Starting background enrichment process...');
            showSuccessNotification('🔄 Enriching data with images and player info...');
            
            // Try to load existing enriched data first to preserve existing enrichment
            let existingEnriched = null;
            let enrichedSha = null;
            try {
                const enrichedBase = await ghGet('data/enrichedLeaderboards.json');
                enrichedSha = enrichedBase.sha;
                if(enrichedBase && enrichedBase.content) {
                    existingEnriched = JSON.parse(decodeURIComponent(escape(atob(enrichedBase.content))));
                    console.log('✅ Loaded existing enriched data, will merge with new changes');
                }
            } catch(e) {
                console.log('enrichedLeaderboards.json not found, will create new');
            }
            
            // Deep clone groups to avoid mutating original data
            const groupsCopy = JSON.parse(JSON.stringify(json.groups));
            
            // Create a map of existing enriched data for quick lookup
            const existingMapCache = new Map();
            const existingPlayerCache = new Map();
            
            if(existingEnriched && existingEnriched.groups) {
                for(const group of existingEnriched.groups) {
                    for(const card of group.cards || []) {
                        if(card.mapUrl && card.map) {
                            existingMapCache.set(card.mapUrl, card.map);
                        }
                        for(const entry of card.entries || []) {
                            if(entry.playerUrl && entry.playerInfo) {
                                existingPlayerCache.set(entry.playerUrl, entry.playerInfo);
                            }
                        }
                    }
                }
                console.log(`📦 Loaded ${existingMapCache.size} existing maps and ${existingPlayerCache.size} existing players from cache`);
            }
            
            // Smart entry matching function - matches by multiple criteria
            function findMatchingEntry(newEntry, existingEntries) {
                if(!existingEntries || existingEntries.length === 0) return null;
                
                // Try multiple matching strategies
                // 1. Exact playerUrl match (most reliable)
                if(newEntry.playerUrl) {
                    const urlMatch = existingEntries.find(e => e.playerUrl === newEntry.playerUrl);
                    if(urlMatch) return urlMatch;
                }
                
                // 2. Match by rank + resultUrl (if both exist)
                if(newEntry.rank && newEntry.resultUrl) {
                    const rankUrlMatch = existingEntries.find(e => 
                        e.rank === newEntry.rank && 
                        e.resultUrl === newEntry.resultUrl
                    );
                    if(rankUrlMatch) return rankUrlMatch;
                }
                
                // 3. Match by rank + resultLabel (if both exist)
                if(newEntry.rank && newEntry.resultLabel) {
                    const rankLabelMatch = existingEntries.find(e => 
                        e.rank === newEntry.rank && 
                        e.resultLabel === newEntry.resultLabel
                    );
                    if(rankLabelMatch) return rankLabelMatch;
                }
                
                // 4. Match by resultUrl only (if unique)
                if(newEntry.resultUrl) {
                    const urlOnlyMatch = existingEntries.find(e => e.resultUrl === newEntry.resultUrl);
                    if(urlOnlyMatch) return urlOnlyMatch;
                }
                
                return null;
            }
            
            // Check if we need to fetch new playerInfo for updated entries
            const entriesNeedingPlayerInfo = [];
            for(const group of groupsCopy) {
                for(const card of group.cards || []) {
                    for(const entry of card.entries || []) {
                        // If entry has playerUrl but no playerInfo, or playerUrl changed, we need to fetch
                        if(entry.playerUrl && !entry.playerInfo) {
                            entriesNeedingPlayerInfo.push(entry);
                        }
                    }
                }
            }
            
            if(entriesNeedingPlayerInfo.length > 0) {
                console.log(`📥 Found ${entriesNeedingPlayerInfo.length} entries needing playerInfo, will fetch during enrichment`);
            }
            
            // Enrich the data - use existing cache to speed up
            let enrichedData;
            try {
                // Only enrich if we have new data to fetch, otherwise use existing cache
                // enrichGroupsDataWithCache will automatically fetch missing playerInfo
                enrichedData = await enrichGroupsDataWithCache(groupsCopy, existingMapCache, existingPlayerCache);
                console.log(`✅ Enrichment complete: ${enrichedData.stats.maps} maps, ${enrichedData.stats.players} players`);
            } catch(enrichError) {
                console.warn('⚠️ Enrichment failed, using existing enriched data:', enrichError.message);
                // If enrichment fails (e.g., rate limit), merge existing enriched data with new groups
                // This ensures we keep existing images even if new ones can't be fetched
                enrichedData = {
                    groups: groupsCopy.map(group => {
                        // Try to find matching group in existing enriched data
                        const existingGroup = existingEnriched?.groups?.find(g => g.id === group.id);
                        if(existingGroup) {
                            // Merge cards - use existing enriched cards where possible
                            const mergedCards = group.cards.map(card => {
                                const existingCard = existingGroup.cards?.find(c => 
                                    (c.mapUrl && card.mapUrl && c.mapUrl === card.mapUrl) || 
                                    (!c.mapUrl && !card.mapUrl && c.title === card.title)
                                );
                                if(existingCard) {
                                    // Merge: use existing map/playerInfo, but keep new entries with smart matching
                                    // CRITICAL: New data from leaderboards.json takes precedence - it's the source of truth
                                    return {
                                        ...card, // Use new card structure
                                        map: existingCard.map || card.map || null, // Preserve map images
                                        entries: card.entries.map(entry => {
                                            // Use smart matching to find existing entry
                                            const existingEntry = findMatchingEntry(entry, existingCard.entries);
                                            if(existingEntry) {
                                                // IMPORTANT: New entry data is the source of truth
                                                // Only preserve playerInfo if:
                                                // 1. New entry doesn't have playerInfo yet (will be fetched)
                                                // 2. PlayerUrl matches (same user, just preserving image)
                                                const shouldPreservePlayerInfo = 
                                                    !entry.playerInfo && 
                                                    entry.playerUrl === existingEntry.playerUrl && 
                                                    existingEntry.playerInfo;
                                                
                                                const mergedEntry = {
                                                    ...entry, // NEW DATA TAKES PRECEDENCE - this is the updated entry
                                                    // Only preserve playerInfo if URL matches and new entry doesn't have it
                                                    playerInfo: shouldPreservePlayerInfo ? existingEntry.playerInfo : entry.playerInfo || null
                                                };
                                                
                                                console.log(`🔄 Merged entry:`, {
                                                    new: { player: entry.player, playerUrl: entry.playerUrl, rank: entry.rank },
                                                    existing: { playerUrl: existingEntry.playerUrl, hasPlayerInfo: !!existingEntry.playerInfo },
                                                    preservedPlayerInfo: shouldPreservePlayerInfo
                                                });
                                                
                                                return mergedEntry;
                                            }
                                            // New entry, no existing match - use as-is
                                            return entry;
                                        })
                                    };
                                }
                                return card;
                            });
                            return { ...group, cards: mergedCards };
                        }
                        return group;
                    }),
                    stats: {
                        maps: existingMapCache.size,
                        players: existingPlayerCache.size,
                        enrichedMaps: 0,
                        enrichedPlayers: 0
                    }
                };
                showErrorNotification('⚠️ Rate limited - using cached images. Some new images may be missing.');
            }
            
            // Smart entry matching function (reuse from above)
            function findMatchingEntry(newEntry, existingEntries) {
                if(!existingEntries || existingEntries.length === 0) return null;
                if(newEntry.playerUrl) {
                    const urlMatch = existingEntries.find(e => e.playerUrl === newEntry.playerUrl);
                    if(urlMatch) return urlMatch;
                }
                if(newEntry.rank && newEntry.resultUrl) {
                    const rankUrlMatch = existingEntries.find(e => 
                        e.rank === newEntry.rank && e.resultUrl === newEntry.resultUrl
                    );
                    if(rankUrlMatch) return rankUrlMatch;
                }
                if(newEntry.resultUrl) {
                    const urlOnlyMatch = existingEntries.find(e => e.resultUrl === newEntry.resultUrl);
                    if(urlOnlyMatch) return urlOnlyMatch;
                }
                return null;
            }
            
            // Ensure we preserve ALL existing images even if enrichment partially failed
            // Merge back any existing enriched data that wasn't overwritten
            // BUT: prioritize new data over old data to ensure updates are reflected
            if(existingEnriched && existingEnriched.groups) {
                for(const existingGroup of existingEnriched.groups) {
                    const group = enrichedData.groups.find(g => g.id === existingGroup.id);
                    if(group) {
                        for(const existingCard of existingGroup.cards || []) {
                            const card = group.cards.find(c => 
                                (c.mapUrl && existingCard.mapUrl && c.mapUrl === existingCard.mapUrl) || 
                                (!c.mapUrl && !existingCard.mapUrl && c.title === existingCard.title)
                            );
                            if(card) {
                                // Preserve existing map if new one is missing
                                if(existingCard.map && !card.map) {
                                    card.map = existingCard.map;
                                }
                                // Smart merge: preserve existing playerInfo ONLY if entry matches and new entry doesn't have playerInfo
                                // This ensures updates are reflected while preserving images for unchanged entries
                                for(const existingEntry of existingCard.entries || []) {
                                    const entry = findMatchingEntry(existingEntry, card.entries);
                                    if(entry) {
                                        // Only preserve playerInfo if:
                                        // 1. New entry doesn't have playerInfo yet, AND
                                        // 2. PlayerUrl matches (user didn't change)
                                        if(!entry.playerInfo && existingEntry.playerInfo && 
                                           entry.playerUrl === existingEntry.playerUrl) {
                                        entry.playerInfo = existingEntry.playerInfo;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Verify enrichment worked
            let hasEnrichment = false;
            for(const group of enrichedData.groups) {
                for(const card of group.cards) {
                    if(card.map) hasEnrichment = true;
                    for(const entry of card.entries) {
                        if(entry.playerInfo) hasEnrichment = true;
                    }
                }
            }
            
            if(!hasEnrichment && existingMapCache.size === 0 && existingPlayerCache.size === 0) {
                throw new Error('Enrichment completed but no enriched data found. Check console for errors.');
            }
            
            const enrichedPayload = {
                generatedAt: new Date().toISOString(),
                source: 'https://www.geoguessr.com',
                groups: enrichedData.groups,
                lookupCounts: enrichedData.stats
            };
            
                await ghPut('data/enrichedLeaderboards.json', JSON.stringify(enrichedPayload, null, 2), enrichedSha, 'chore(admin): enrich and sync data', 3);
            console.log('✅ Enriched data saved to GitHub');
            showSuccessNotification('✅ Enrichment complete! Data saved with images.');
        } catch(e){ 
            console.error('❌ Failed to enrich and update enrichedLeaderboards.json:', e);
            console.error('Stack trace:', e.stack);
            // Don't throw - leaderboards.json is already saved, enrichment can be retried
                showSuccessNotification('⚠️ Data saved but enrichment failed. Images may not load. Error: ' + (e.message || 'Unknown error'));
        }
        })(); // Run in background, don't await
        
        // Clear ALL cache keys (including ui.js cache) to force refresh
        try {
            // Clear admin cache
            localStorage.removeItem('gg_cache');
            // Clear UI cache to force reload of updated data
            localStorage.removeItem('gg_enriched_cache_v1');
            localStorage.removeItem('gg_enriched_cache_time_v1');
            console.log('✅ Cleared all caches to force data refresh');
            localStorage.removeItem('gg_cache_time');
            // Clear ui.js cache (uses different keys)
            localStorage.removeItem('gg_enriched_cache_v1');
            localStorage.removeItem('gg_enriched_cache_time_v1');
            console.log('✅ All caches cleared');
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
        showSuccessNotification('✅ Changes saved successfully! Refreshing page...');
        
        // Force hard reload to bypass all caches and get fresh data
        setTimeout(() => {
            // Use location.reload(true) for hard reload, or add cache busting
            window.location.href = window.location.href.split('#')[0] + '?refresh=' + Date.now();
        }, 2000); // Increased delay to ensure GitHub API has propagated changes
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
        
        // Create admin sidebar (similar to toc-sidebar)
        const sidebar = document.createElement('aside');
        sidebar.id = 'admin-mode-indicator';
        sidebar.className = 'admin-sidebar';
        sidebar.setAttribute('aria-hidden', 'false');
        
        const content = el('div', { class: 'admin-sidebar-content' });
        
        // Title
        const title = el('div', { class: 'admin-sidebar-title' }, ['🔧 Admin']);
        content.appendChild(title);
        
        // Add Record button
        const addRecordBtn = el('button', {
            class: 'admin-sidebar-button admin-sidebar-button--primary',
            onclick: () => {
                openAddRecordEditor();
            }
        }, ['➕ Přidat záznam']);
        content.appendChild(addRecordBtn);
        
        // Logout button
        const logoutBtn = el('button', {
            class: 'admin-sidebar-button admin-sidebar-button--secondary',
            onclick: () => {
                localStorage.removeItem('gg_admin_data');
                localStorage.removeItem('gg_admin_ok');
                location.reload();
            }
        }, ['🚪 Odhlásit']);
        content.appendChild(logoutBtn);
        
        sidebar.appendChild(content);
        document.body.appendChild(sidebar);
    }

    function showMaintenanceOverlay(){
        // Remove existing overlay if present
        const existing = document.getElementById('maintenance-overlay');
        if(existing) existing.remove();
        
        // Create maintenance overlay
        const overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #0b3d91 0%, #1e5bb8 50%, #0b3d91 100%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
            color: white;
        `;
        
        const content = document.createElement('div');
        content.style.cssText = `
            max-width: 1200px;
            width: 100%;
        `;
        
        const title = document.createElement('h1');
        title.textContent = '🔧 Probíhá údržba';
        title.style.cssText = `
            font-size: 64px;
            font-weight: 700;
            margin: 0 0 16px 0;
            text-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: 'Quicksand', sans-serif;
        `;
        
        const message = document.createElement('p');
        message.textContent = 'Web je momentálně v údržbě. Prosím zkuste to později.';
        message.style.cssText = `
            font-size: 24px;
            margin: 0 0 40px 0;
            opacity: 0.9;
            line-height: 1.6;
            font-family: 'Quicksand', sans-serif;
        `;
        
        // Sneak peek cards
        const sneakPeekContainer = document.createElement('div');
        sneakPeekContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 24px;
            margin-bottom: 48px;
            max-width: 1100px;
            margin-left: auto;
            margin-right: auto;
        `;
        
        // Card 1: Leaderboard Podium
        const card1 = document.createElement('div');
        card1.style.cssText = `
            background: rgba(255,255,255,0.09);
            border-radius: 24px;
            padding: 28px;
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,0.18);
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;
        card1.onmouseenter = function(){
            this.style.transform = 'translateY(-4px)';
            this.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)';
            this.style.borderColor = 'rgba(255,255,255,0.25)';
        };
        card1.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)';
            this.style.borderColor = 'rgba(255,255,255,0.18)';
        };
        const card1TitleWrapper = document.createElement('div');
        card1TitleWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 20px;
        `;
        const icon1 = document.createElement('div');
        icon1.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" fill-opacity="0.95"/></svg>';
        icon1.style.cssText = `width: 26px; height: 26px; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));`;
        const card1Title = document.createElement('div');
        card1Title.textContent = 'Overall Leaderboard';
        card1Title.style.cssText = `
            font-size: 17px;
            font-weight: 700;
            color: rgba(255,255,255,0.98);
            font-family: 'Quicksand', sans-serif;
            letter-spacing: 0.4px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        card1TitleWrapper.appendChild(icon1);
        card1TitleWrapper.appendChild(card1Title);
        const podium = document.createElement('div');
        podium.style.cssText = `
            display: flex;
            align-items: flex-end;
            justify-content: center;
            gap: 12px;
            height: 170px;
            padding-top: 8px;
        `;
        
        // 2nd place
        const place2 = document.createElement('div');
        place2.style.cssText = `
            background: linear-gradient(180deg, rgba(192,192,192,0.3) 0%, rgba(160,160,160,0.2) 100%);
            width: 72px;
            min-height: 95px;
            border-radius: 18px 18px 0 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 12px 8px 8px 8px;
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.25);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3);
            transition: all 0.3s ease;
        `;
        place2.onmouseenter = function(){
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.35)';
        };
        place2.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)';
        };
        const avatar2 = document.createElement('div');
        avatar2.style.cssText = `
            width: 46px;
            height: 54px;
            background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%);
            border-radius: 10px;
            margin-bottom: 8px;
            border: 1px solid rgba(255,255,255,0.3);
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        `;
        const name2 = document.createElement('div');
        name2.textContent = 'Alex Johnson';
        name2.style.cssText = `
            font-size: 11.5px;
            font-weight: 600;
            color: rgba(255,255,255,0.98);
            font-family: 'Quicksand', sans-serif;
            text-align: center;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        `;
        place2.appendChild(avatar2);
        place2.appendChild(name2);
        
        // 1st place
        const place1 = document.createElement('div');
        place1.style.cssText = `
            background: linear-gradient(180deg, rgba(255,215,0,0.35) 0%, rgba(255,180,0,0.25) 100%);
            width: 84px;
            min-height: 140px;
            border-radius: 20px 20px 0 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 14px 10px 10px 10px;
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.35);
            box-shadow: 0 6px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4);
            transition: all 0.3s ease;
        `;
        place1.onmouseenter = function(){
            this.style.transform = 'translateY(-3px)';
            this.style.boxShadow = '0 8px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.45)';
        };
        place1.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)';
        };
        const avatar1 = document.createElement('div');
        avatar1.style.cssText = `
            width: 52px;
            height: 64px;
            background: linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.2) 100%);
            border-radius: 12px;
            margin-bottom: 10px;
            border: 1px solid rgba(255,255,255,0.35);
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
        `;
        const name1 = document.createElement('div');
        name1.textContent = 'Ryan Miller';
        name1.style.cssText = `
            font-size: 12.5px;
            font-weight: 700;
            color: rgba(255,255,255,1);
            font-family: 'Quicksand', sans-serif;
            text-align: center;
            text-shadow: 0 1px 3px rgba(0,0,0,0.25);
        `;
        place1.appendChild(avatar1);
        place1.appendChild(name1);
        
        // 3rd place
        const place3 = document.createElement('div');
        place3.style.cssText = `
            background: linear-gradient(180deg, rgba(205,127,50,0.3) 0%, rgba(160,82,45,0.2) 100%);
            width: 68px;
            min-height: 80px;
            border-radius: 16px 16px 0 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 10px 8px 8px 8px;
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.25);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3);
            transition: all 0.3s ease;
        `;
        place3.onmouseenter = function(){
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.35)';
        };
        place3.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.3)';
        };
        const avatar3 = document.createElement('div');
        avatar3.style.cssText = `
            width: 42px;
            height: 50px;
            background: linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.12) 100%);
            border-radius: 9px;
            margin-bottom: 7px;
            border: 1px solid rgba(255,255,255,0.3);
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        `;
        const name3 = document.createElement('div');
        name3.textContent = 'Chris Davis';
        name3.style.cssText = `
            font-size: 10.5px;
            font-weight: 600;
            color: rgba(255,255,255,0.98);
            font-family: 'Quicksand', sans-serif;
            text-align: center;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        `;
        place3.appendChild(avatar3);
        place3.appendChild(name3);
        
        podium.appendChild(place2);
        podium.appendChild(place1);
        podium.appendChild(place3);
        card1.appendChild(card1TitleWrapper);
        card1.appendChild(podium);
        
        // Card 2: Record Card
        const card2 = document.createElement('div');
        card2.style.cssText = `
            background: rgba(255,255,255,0.09);
            border-radius: 24px;
            padding: 28px;
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,0.18);
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;
        card2.onmouseenter = function(){
            this.style.transform = 'translateY(-4px)';
            this.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)';
            this.style.borderColor = 'rgba(255,255,255,0.25)';
        };
        card2.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)';
            this.style.borderColor = 'rgba(255,255,255,0.18)';
        };
        const card2TitleWrapper = document.createElement('div');
        card2TitleWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 22px;
        `;
        const icon2 = document.createElement('div');
        icon2.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="white" fill-opacity="0.95"/></svg>';
        icon2.style.cssText = `width: 26px; height: 26px; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));`;
        const card2Title = document.createElement('div');
        card2Title.textContent = 'Records';
        card2Title.style.cssText = `
            font-size: 17px;
            font-weight: 700;
            color: rgba(255,255,255,0.98);
            font-family: 'Quicksand', sans-serif;
            letter-spacing: 0.4px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        card2TitleWrapper.appendChild(icon2);
        card2TitleWrapper.appendChild(card2Title);
        const recordList = document.createElement('div');
        recordList.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;
        const records = [
            { rank: '1', name: 'Michael Chen', score: '25000' },
            { rank: '2', name: 'James Wilson', score: '24895' },
            { rank: '3', name: 'David Brown', score: '24782' }
        ];
        records.forEach(record => {
            const entry = document.createElement('div');
            entry.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: rgba(255,255,255,0.08);
                border-radius: 14px;
                border: 1px solid rgba(255,255,255,0.12);
                transition: all 0.3s ease;
            `;
            entry.onmouseenter = function(){
                this.style.background = 'rgba(255,255,255,0.12)';
                this.style.borderColor = 'rgba(255,255,255,0.18)';
                this.style.transform = 'translateX(2px)';
            };
            entry.onmouseleave = function(){
                this.style.background = 'rgba(255,255,255,0.08)';
                this.style.borderColor = 'rgba(255,255,255,0.12)';
                this.style.transform = 'translateX(0)';
            };
            const rank = document.createElement('div');
            rank.textContent = record.rank;
            rank.style.cssText = `
                font-size: 14px;
                font-weight: 700;
                color: rgba(255,255,255,0.75);
                font-family: 'Quicksand', sans-serif;
                min-width: 22px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            `;
            const avatar = document.createElement('div');
            avatar.style.cssText = `
                width: 36px;
                height: 44px;
                background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.12) 100%);
                border-radius: 10px;
                flex-shrink: 0;
                border: 1px solid rgba(255,255,255,0.25);
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            `;
            const info = document.createElement('div');
            info.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            `;
            const name = document.createElement('div');
            name.textContent = record.name;
            name.style.cssText = `
                font-size: 13.5px;
                font-weight: 600;
                color: rgba(255,255,255,0.98);
                font-family: 'Quicksand', sans-serif;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            `;
            const score = document.createElement('div');
            score.textContent = record.score;
            score.style.cssText = `
                font-size: 11.5px;
                color: rgba(255,255,255,0.75);
                font-family: 'Quicksand', sans-serif;
                font-weight: 500;
            `;
            info.appendChild(name);
            info.appendChild(score);
            entry.appendChild(rank);
            entry.appendChild(avatar);
            entry.appendChild(info);
            recordList.appendChild(entry);
        });
        card2.appendChild(card2TitleWrapper);
        card2.appendChild(recordList);
        
        // Card 3: Streaks
        const card3 = document.createElement('div');
        card3.style.cssText = `
            background: rgba(255,255,255,0.09);
            border-radius: 24px;
            padding: 28px;
            backdrop-filter: blur(24px);
            border: 1px solid rgba(255,255,255,0.18);
            box-shadow: 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;
        card3.onmouseenter = function(){
            this.style.transform = 'translateY(-4px)';
            this.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)';
            this.style.borderColor = 'rgba(255,255,255,0.25)';
        };
        card3.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)';
            this.style.borderColor = 'rgba(255,255,255,0.18)';
        };
        const card3TitleWrapper = document.createElement('div');
        card3TitleWrapper.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 22px;
        `;
        const icon3 = document.createElement('div');
        icon3.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.09 11L12 5.91L6.91 11L12 16.09L17.09 11ZM12 2L2 12L12 22L22 12L12 2Z" fill="white" fill-opacity="0.95"/></svg>';
        icon3.style.cssText = `width: 26px; height: 26px; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));`;
        const card3Title = document.createElement('div');
        card3Title.textContent = 'Streaks';
        card3Title.style.cssText = `
            font-size: 17px;
            font-weight: 700;
            color: rgba(255,255,255,0.98);
            font-family: 'Quicksand', sans-serif;
            letter-spacing: 0.4px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.1);
        `;
        card3TitleWrapper.appendChild(icon3);
        card3TitleWrapper.appendChild(card3Title);
        const streakList = document.createElement('div');
        streakList.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;
        const streaks = [
            { name: 'Robert Taylor', streak: '15' },
            { name: 'Kevin Martinez', streak: '12' },
            { name: 'Brian Anderson', streak: '10' }
        ];
        streaks.forEach(streak => {
            const entry = document.createElement('div');
            entry.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: rgba(255,255,255,0.08);
                border-radius: 14px;
                border: 1px solid rgba(255,255,255,0.12);
                transition: all 0.3s ease;
            `;
            entry.onmouseenter = function(){
                this.style.background = 'rgba(255,255,255,0.12)';
                this.style.borderColor = 'rgba(255,255,255,0.18)';
                this.style.transform = 'translateX(2px)';
            };
            entry.onmouseleave = function(){
                this.style.background = 'rgba(255,255,255,0.08)';
                this.style.borderColor = 'rgba(255,255,255,0.12)';
                this.style.transform = 'translateX(0)';
            };
            const avatar = document.createElement('div');
            avatar.style.cssText = `
                width: 36px;
                height: 44px;
                background: linear-gradient(135deg, rgba(255,120,120,0.25) 0%, rgba(255,100,100,0.15) 100%);
                border-radius: 10px;
                flex-shrink: 0;
                border: 1px solid rgba(255,255,255,0.25);
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
            `;
            const info = document.createElement('div');
            info.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            `;
            const name = document.createElement('div');
            name.textContent = streak.name;
            name.style.cssText = `
                font-size: 13.5px;
                font-weight: 600;
                color: rgba(255,255,255,0.98);
                font-family: 'Quicksand', sans-serif;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            `;
            const streakValue = document.createElement('div');
            streakValue.style.cssText = `
                display: flex;
                align-items: center;
                gap: 5px;
            `;
            const streakNum = document.createElement('span');
            streakNum.textContent = streak.streak;
            streakNum.style.cssText = `
                font-size: 11.5px;
                color: rgba(255,255,255,0.75);
                font-family: 'Quicksand', sans-serif;
                font-weight: 500;
            `;
            const fireIcon = document.createElement('span');
            fireIcon.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.59 10.12 16.35 9.85 16.2 9.5C16.05 9.15 16 8.78 16 8.39C16 7.3 16.34 6.28 17 5.4C16.22 4.88 15.3 4.57 14.31 4.57C12.47 4.57 10.89 5.4 9.73 6.73C8.57 8.06 8 9.67 8 11.39C8 12.2 8.12 12.95 8.33 13.63C8.54 14.31 8.83 14.93 9.2 15.47C9.57 16.01 10 16.47 10.5 16.84C11 17.21 11.54 17.5 12.12 17.71C12.7 17.92 13.3 18.03 13.91 18.03C15.5 18.03 16.87 17.5 17.99 16.45C19.11 15.4 19.67 14.05 19.67 12.4C19.67 11.95 19.6 11.53 19.47 11.14C19.34 10.75 19.15 10.4 18.9 10.1L17.66 11.2Z" fill="rgba(255,120,120,0.95)"/></svg>';
            fireIcon.style.cssText = `width: 13px; height: 13px; display: inline-block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));`;
            streakValue.appendChild(streakNum);
            streakValue.appendChild(fireIcon);
            info.appendChild(name);
            info.appendChild(streakValue);
            entry.appendChild(avatar);
            entry.appendChild(info);
            streakList.appendChild(entry);
        });
        card3.appendChild(card3TitleWrapper);
        card3.appendChild(streakList);
        
        sneakPeekContainer.appendChild(card1);
        sneakPeekContainer.appendChild(card2);
        sneakPeekContainer.appendChild(card3);
        
        const loginButton = document.createElement('button');
        loginButton.textContent = '🔐 Přihlásit se jako Admin';
        loginButton.style.cssText = `
            padding: 16px 32px;
            font-size: 18px;
            font-weight: 600;
            background: white;
            color: #0b3d91;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            font-family: 'Quicksand', sans-serif;
        `;
        loginButton.onmouseenter = function(){
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
        };
        loginButton.onmouseleave = function(){
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
        };
        loginButton.onclick = function(e){
            e.preventDefault();
            e.stopPropagation();
            // Show login form OVER maintenance overlay (don't hide overlay yet)
            // Login form has higher z-index (100000) than maintenance overlay (99999)
            uiLogin(()=>{ 
                // After successful login, hide maintenance overlay and show content
                hideMaintenanceOverlay();
                bindContextMenu(); 
                showAdminIndicator();
                removeRoot();
                location.hash = '#admin';
            });
        };
        
        content.appendChild(title);
        content.appendChild(message);
        content.appendChild(sneakPeekContainer);
        content.appendChild(loginButton);
        overlay.appendChild(content);
        document.body.appendChild(overlay);
        
        // Hide main content
        const container = document.querySelector('.container');
        const header = document.querySelector('.header');
        const footer = document.querySelector('.footer');
        const sidebar = document.querySelector('#toc-sidebar');
        if(container) container.style.display = 'none';
        if(header) header.style.display = 'none';
        if(footer) footer.style.display = 'none';
        if(sidebar) sidebar.style.display = 'none';
    }
    
    function hideMaintenanceOverlay(){
        const overlay = document.getElementById('maintenance-overlay');
        if(overlay) overlay.remove();
        
        // Show main content
        const container = document.querySelector('.container');
        const header = document.querySelector('.header');
        const footer = document.querySelector('.footer');
        const sidebar = document.querySelector('#toc-sidebar');
        if(container) container.style.display = '';
        if(header) header.style.display = '';
        if(footer) footer.style.display = '';
        if(sidebar) sidebar.style.display = '';
    }

    function boot(){
        if(location.hash === '#admin'){
            if(isAdminAuthenticated()) {
                uiApp();
                hideMaintenanceOverlay();
            } else {
                uiLogin(uiApp);
                hideMaintenanceOverlay();
            }
        } else {
            removeRoot();
            // Check if admin is authenticated
            if(isAdminAuthenticated()){
                // Admin is authenticated - show normal content
                hideMaintenanceOverlay();
                activateAdminMode();
            } else {
                // Admin is not authenticated - show maintenance overlay
                showMaintenanceOverlay();
            }
        }
    }

    // Debug: Check if token is available on page load
    if(typeof window !== 'undefined'){
        const tokenCheck = localStorage.getItem('gg_pat') || window.GITHUB_TOKEN;
        if(tokenCheck){
            console.log('✅ GitHub token found:', tokenCheck.substring(0, 10) + '...');
        } else {
            console.warn('⚠️ GitHub token not found. Make sure you ran: npm run inject-token');
            console.warn('   Or set window.GITHUB_TOKEN in browser console');
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
            hideMaintenanceOverlay();
            location.hash = '#admin';
        } else {
            // Not authenticated, show login
            hideMaintenanceOverlay();
            uiLogin(()=>{ 
                bindContextMenu(); 
                showAdminIndicator();
                removeRoot(); 
                hideMaintenanceOverlay();
                location.hash = '#admin';
            });
        }
    });
})();
