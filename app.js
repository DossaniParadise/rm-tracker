// ============================================================
// APP.JS - Repair & Maintenance Tracker
// Dossani Paradise - Main Application Logic
// ============================================================
// This file contains ALL application JavaScript.
// Dependencies (loaded before this file in index.html):
//   - Firebase SDK (app, auth, database, storage)
//   - Leaflet.js (maps)
//   - stores-data.js (store locations array)
//   - users-data.js (user directory for auto-lookup)
//
// GitHub repo structure:
//   index.html      - HTML shell + script/css imports
//   styles.css      - All CSS (light, dark, responsive)
//   app.js          - This file (auth, tickets, admin, notifications)
//   stores-data.js  - Store locations data
//   users-data.js   - User directory for onboarding lookup
//   logos/           - Brand logo images
// ============================================================

// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyDf0W5a8UPpuZbo873nWfed6VvNExL4BjM",
    authDomain: "dossani-paradise-rm-tracker.firebaseapp.com",
    databaseURL: "https://dossani-paradise-rm-tracker-default-rtdb.firebaseio.com",
    projectId: "dossani-paradise-rm-tracker",
    storageBucket: "dossani-paradise-rm-tracker.firebasestorage.app",
    messagingSenderId: "328034984226",
    appId: "1:328034984226:web:2b2ddb58d935bec201857b"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();

// ============================================================
// STORES & USERS DATA - loaded from external files
// stores-data.js must define: const stores = [...]
// users-data.js is reference only (actual auth is Firebase DB)
// ============================================================

// LOGO URLS - relative to index.html
const BRAND_LOGOS = {
    bk: 'logos/bk-logo.png',
    sub: 'logos/subway-logo.png',
    pqs: 'logos/pqs-logo.png',
    '711': 'logos/711-logo.png',
    cw: 'logos/cw-logo.png',
    nash: 'logos/pqs-logo.png',
    dpm: 'logos/dpm-icon.png'
};

// ============================================================
// APP STATE
// ============================================================
let currentUser = null;
let selectedStore = null;
let selectedCategory = null;
let selectedLocation = null;
let selectedPriority = null;
let uploadedPhotos = []; // { file, previewUrl }
let currentTickets = [];
let currentFilter = 'all';
let activeTicketListener = null;
let vendorList = [];
let desktopStoreData = [];
let dslShowAll = false;

// ============================================================
// AUTH
// ============================================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log('Signed in:', user.email);
        await loadUserData(user);
    } else if (auth.isSignInWithEmailLink(window.location.href)) {
        handleEmailLinkSignIn();
    } else {
        showLoginScreen();
    }
});

async function sendSignInLink() {
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    if (!email) { showError('Enter your email address.'); return; }

    if (!email.endsWith('@dossaniparadise.com') && email !== 'scroadmart@att.net') {
        showError('Only @dossaniparadise.com emails are allowed.');
        return;
    }

    const btn = document.getElementById('sendLinkBtn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
        await auth.sendSignInLinkToEmail(email, { url: window.location.href, handleCodeInApp: true });
        window.localStorage.setItem('emailForSignIn', email);
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('emailSentMessage').classList.remove('hidden');
        document.getElementById('sentToEmail').textContent = email;
    } catch (err) {
        console.error('Send link error:', err);
        showError(err.code === 'auth/invalid-email' ? 'Invalid email.' : 'Failed to send. Try again.');
    } finally {
        btn.innerHTML = 'Send Sign-In Link';
        btn.disabled = false;
    }
}

// Allow pressing Enter on email input
document.getElementById('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendSignInLink();
});

async function handleEmailLinkSignIn() {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) email = window.prompt('Confirm your email:');
    if (!email) { showLoginScreen(); return; }

    try {
        await auth.signInWithEmailLink(email, window.location.href);
        window.localStorage.removeItem('emailForSignIn');
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
        console.error('Link sign-in error:', err);
        const msgs = {
            'auth/invalid-action-code': 'This link has expired or was already used. Request a new one.',
            'auth/invalid-email': 'Invalid email. Try again.',
            'auth/user-disabled': 'Account disabled. Contact IT.'
        };
        showError(msgs[err.code] || 'Sign-in failed: ' + err.message);
        window.history.replaceState({}, document.title, window.location.pathname);
        showLoginScreen();
    }
}

function resendEmail() {
    document.getElementById('emailSentMessage').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

async function loadUserData(user) {
    try {
        const snap = await db.ref(`users/${user.uid}`).once('value');
        let data = snap.val();

        if (!data) {
            // Check if user was pre-approved by admin
            const emailKey = user.email.toLowerCase().replace(/\./g, ',');
            const preSnap = await db.ref(`preApproved/${emailKey}`).once('value');
            const preData = preSnap.val();

            if (preData) {
                // Auto-activate pre-approved user
                data = {
                    name: preData.name,
                    email: user.email,
                    role: preData.role,
                    stores: preData.stores,
                    status: 'active',
                    activatedAt: firebase.database.ServerValue.TIMESTAMP
                };
                await db.ref(`users/${user.uid}`).set(data);
                // Clean up pre-approval entry
                await db.ref(`preApproved/${emailKey}`).remove();
            } else {
                // Auto-register as pending
                try {
                    await db.ref(`pending/${user.uid}`).set({
                        email: user.email,
                        requestedAt: firebase.database.ServerValue.TIMESTAMP
                    });
                    showError('Your account is pending approval. An admin will set you up shortly.');
                } catch (e) {
                    console.warn('Could not write pending entry:', e);
                    showError('Account not set up yet. Contact IT at itsupport@dossaniparadise.com to get access.');
                }
                auth.signOut();
                return;
            }
        }

        currentUser = {
            uid: user.uid,
            email: user.email,
            name: data.name || user.email.split('@')[0],
            role: normalizeRole(data.role),
            stores: data.stores || []
        };

        showAppScreen();
    } catch (err) {
        console.error('Load user error:', err);
        showError('Failed to load account. Try again.');
    }
}

function logout() {
    if (activeTicketListener) { activeTicketListener(); activeTicketListener = null; }
    if (notifyListenerRef && notifyListenerCallback) {
        notifyListenerRef.off('value', notifyListenerCallback);
        notifyListenerRef = null;
        notifyListenerCallback = null;
    }
    notifyTickets = [];
    auth.signOut();
}

// ============================================================
// SCREENS
// ============================================================
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';

    // Populate header
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('userAvatar').textContent = initials || '?';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;

    // Show admin button for admins (case-insensitive check)
    if (currentUser.role && currentUser.role.toLowerCase() === 'admin') {
        document.getElementById('adminBtn').classList.remove('hidden');
        watchPendingUsers();
    }

    // Show "All Locations" pill for admins
    if (currentUser.role === 'Admin' || currentUser.role === 'Technician' || currentUser.stores === 'all') {
        document.getElementById('brandPill-all').classList.remove('hidden');
        document.querySelectorAll('.admin-only-opt').forEach(el => el.classList.remove('hidden'));
    }

    // Show "View As" only for itsupport
    if (currentUser.email === 'itsupport@dossaniparadise.com') {
        document.getElementById('viewAsBtn').classList.remove('hidden');
    }

    // Load notification routing config
    db.ref('config/notifyRouting').once('value', snap => {
        notifyRouting = snap.val() || {};
        initNotificationCenter();
    });

    // Auto-select store for single-store managers
    if (currentUser.role === 'Manager' && currentUser.stores && !Array.isArray(currentUser.stores)) {
        const store = stores.find(s => s.code === currentUser.stores);
        if (store) {
            selectedStore = store;
            document.getElementById('storeType').value = store.type;
            filterStores();
            document.getElementById('storeSelect').value = store.id;
            selectStore();
        }
    }

    // Show assignment fields for coaches/admins
    if (currentUser.role === 'Admin' || currentUser.role === 'Area Coach') {
        document.getElementById('assignmentFields').classList.remove('hidden');
        populateAssignDropdown();
    }

    // Desktop: auto-select brand if user only has one store type
    // Desktop: auto-select brand for multi-store users (admins, coaches, techs)
    if (window.innerWidth >= 1100 && isMultiStoreUser()) {
        const userStoreList = currentUser.stores === 'all' ? stores :
            stores.filter(s => {
                const us = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
                return us.includes(s.code);
            });
        const types = [...new Set(userStoreList.map(s => s.type))];
        if (types.length === 1) {
            setTimeout(() => selectBrand(types[0]), 100);
        } else if (currentUser.role === 'Admin' || currentUser.role === 'Technician') {
            setTimeout(() => selectBrand('all'), 100);
        }
    }

    // Load vendor list
    loadVendors();
}

function showError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 8000);
}

function showScreen(screenId) {
    ['storeSelection', 'newIssueScreen', 'existingIssuesScreen', 'allTicketsScreen', 'adminScreen'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== screenId);
    });
}

function goBack() {
    showScreen('storeSelection');
    resetNewIssueForm();
    if (activeTicketListener) { activeTicketListener(); activeTicketListener = null; }
}

// ============================================================
// STORE SELECTION
// ============================================================
function filterStores() {
    const type = document.getElementById('storeType').value;
    const sel = document.getElementById('storeSelect');
    sel.innerHTML = '<option value="">Choose store...</option>';
    document.getElementById('actionButtons').classList.add('hidden');
    selectedStore = null;

    if (!type) return;

    let filtered = stores.filter(s => s.type === type);

    // Permission filtering
    if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
        const userStores = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
        filtered = filtered.filter(s => userStores.includes(s.code));
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        sel.appendChild(opt);
    });
}

function selectStore() {
    const id = document.getElementById('storeSelect').value;
    if (!id) { document.getElementById('actionButtons').classList.add('hidden'); selectedStore = null; return; }
    selectedStore = stores.find(s => s.id === id);
    document.getElementById('actionButtons').classList.remove('hidden');
}



// ============================================================
// MAP OVERVIEW (for Admin / Area Coach)
// ============================================================
let overviewMap = null;
let mapMarkers = [];
let allTicketCounts = {}; // { storeCode: { open: N, total: N } }

function isMultiStoreUser() {
    return currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Area Coach' || currentUser.role === 'Technician');
}

// Brand pill click → set dropdown + trigger map
function selectBrand(type) {
    document.getElementById('storeType').value = type;
    document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
    const pill = document.getElementById('brandPill-' + type);
    if (pill) pill.classList.add('active');
    filterStores();
}

// Override filterStores to sync pill active state
const _origFilterStores = filterStores;
filterStores = function() {
    _origFilterStores();
    const type = document.getElementById('storeType').value;
    
    // Sync pill active state
    document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
    if (type) {
        const pill = document.getElementById('brandPill-' + type);
        if (pill) pill.classList.add('active');
    }
    
    const mapEl = document.getElementById('mapOverview');
    
    if (type && isMultiStoreUser()) {
        mapEl.classList.remove('hidden');
        loadMapOverview(type);
    } else {
        mapEl.classList.add('hidden');
    }
    
    // For 'all' type, also show all stores in dropdown
    if (type === 'all') {
        const storeSelect = document.getElementById('storeSelect');
        let allStores = [...stores];
        if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
            const us = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
            allStores = allStores.filter(s => us.includes(s.code));
        }
        storeSelect.innerHTML = '<option value="">Choose store...</option>' +
            allStores.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join('');
    }
};

function loadMapOverview(type) {
    let filtered = type === 'all' ? [...stores] : stores.filter(s => s.type === type);
    
    // Permission filter
    if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
        const us = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
        filtered = filtered.filter(s => us.includes(s.code));
    }
    
    const typeLabels = { all: 'All Locations', fastfood: 'Fast Food Stores', cstore: 'C-Stores', carwash: 'Car Washes' };
    document.getElementById('mapTitle').textContent = typeLabels[type] || 'Stores';
    
    // Init or clear map
    if (!overviewMap) {
        overviewMap = L.map('overviewMap', { zoomControl: true, attributionControl: false }).setView([33.0, -96.5], 7);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        currentTileLayer = L.tileLayer(isDark ? DARK_TILES : LIGHT_TILES, {
            maxZoom: 18
        }).addTo(overviewMap);
        setTimeout(() => overviewMap.invalidateSize(), 100);
    } else {
        overviewMap.invalidateSize();
    }
    
    // Clear old markers
    mapMarkers.forEach(m => overviewMap.removeLayer(m));
    mapMarkers = [];
    
    // Fetch open ticket counts for these stores
    const codes = filtered.map(s => s.code);
    fetchTicketCounts(codes, () => {
        // Add markers
        const bounds = [];
        filtered.forEach(s => {
            if (!s.lat || !s.lng) return;
            const counts = allTicketCounts[s.code] || { open: 0, total: 0, score: 0, hasEmergency: false };
            // Color: green = no issues, yellow = low severity, red = emergency or high score
            const color = counts.open === 0 ? '#059669' : (counts.hasEmergency || counts.score >= 3) ? '#dc2626' : '#d97706';
            const size = counts.open === 0 ? 10 : (counts.hasEmergency || counts.score >= 3) ? 16 : 13;
            
            const icon = L.divIcon({
                className: '',
                html: '<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+color+';border:2px solid rgba(255,255,255,0.3);box-shadow:0 0 8px '+color+'55;'+(counts.open > 0 ? 'display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#000;' : '')+'">'+( counts.open > 0 ? counts.open : '')+'</div>',
                iconSize: [size, size],
                iconAnchor: [size/2, size/2]
            });
            
            const marker = L.marker([s.lat, s.lng], { icon: icon }).addTo(overviewMap);
            
            const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
            const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address);
            
            marker.bindPopup(`<div class="map-popup">
                <div class="mp-name">${shortName}</div>
                <div class="mp-addr" onclick="window.open('${mapsUrl}','_blank')">${s.address}</div>
                <div class="mp-stats">
                    <div class="mp-stat"><strong style="color:${counts.open > 0 ? '#f87171' : '#34d399'}">${counts.open}</strong>open</div>
                    <div class="mp-stat"><strong>${counts.total}</strong>total</div>
                </div>
                <div class="mp-btns">
                    <button class="mp-btn" onclick="mapSelectStore('${s.id}','tickets')">View Tickets</button>
                    <button class="mp-btn" onclick="mapSelectStore('${s.id}','new')">Report Issue</button>
                </div>
            </div>`, { maxWidth: 260, closeButton: false });
            
            mapMarkers.push(marker);
            bounds.push([s.lat, s.lng]);
        });
        
        if (bounds.length) {
            overviewMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
        }
        
        // Stats bar
        let totalOpen = 0, totalAll = 0, storesWithIssues = 0;
        codes.forEach(c => {
            const ct = allTicketCounts[c] || { open: 0, total: 0 };
            totalOpen += ct.open;
            totalAll += ct.total;
            if (ct.open > 0) storesWithIssues++;
        });
        document.getElementById('mapStatsBar').innerHTML = 
            '<div class="mstat"><strong>' + filtered.length + '</strong>stores</div>' +
            '<div class="mstat" style="cursor:pointer" onclick="showAllTickets(\'open\')"><strong style="color:' + (totalOpen > 0 ? '#dc2626' : '#059669') + '">' + totalOpen + '</strong>open tickets</div>' +
            '<div class="mstat" style="cursor:pointer" onclick="showAllTickets(\'open\')"><strong>' + storesWithIssues + '</strong>need attention</div>' +
            '<div class="mstat" style="cursor:pointer" onclick="showAllTickets(\'all\')"><strong>' + totalAll + '</strong>total tickets</div>';

        // Desktop store list sidebar with toggle
        const dsl = document.getElementById('desktopStoreList');
        if (dsl && window.innerWidth >= 1100) {
            desktopStoreData = filtered.map(s => ({
                ...s,
                counts: allTicketCounts[s.code] || { open: 0, total: 0 }
            }));
            renderDesktopStoreList();
            dsl.style.display = '';
        }

        // Also build list view data for toggle
        lastFilteredStores = filtered;
    });
}

function fetchTicketCounts(codes, callback) {
    // Listen once for all tickets and count per store
    // Priority weighting: emergency = auto red (score 3), urgent = 2, routine = 1
    db.ref('tickets').once('value', snap => {
        allTicketCounts = {};
        codes.forEach(c => allTicketCounts[c] = { open: 0, total: 0, score: 0, hasEmergency: false });
        snap.forEach(child => {
            const t = child.val();
            if (codes.includes(t.storeCode)) {
                if (!allTicketCounts[t.storeCode]) allTicketCounts[t.storeCode] = { open: 0, total: 0, score: 0, hasEmergency: false };
                allTicketCounts[t.storeCode].total++;
                if (t.status && t.status !== 'closed' && t.status !== 'resolved') {
                    allTicketCounts[t.storeCode].open++;
                    if (t.priority === 'emergency') {
                        allTicketCounts[t.storeCode].score += 3;
                        allTicketCounts[t.storeCode].hasEmergency = true;
                    } else if (t.priority === 'urgent') {
                        allTicketCounts[t.storeCode].score += 2;
                    } else {
                        allTicketCounts[t.storeCode].score += 1;
                    }
                }
            }
        });
        callback();
    });
}

function mapSelectStore(storeId, action) {
    // Set the dropdown and select the store
    const store = stores.find(s => s.id === storeId);
    if (!store) return;
    selectedStore = store;
    document.getElementById('storeSelect').value = storeId;
    document.getElementById('actionButtons').classList.remove('hidden');
    // Close any open popup
    if (overviewMap) overviewMap.closePopup();
    // Navigate
    if (action === 'tickets') {
        showExistingIssuesScreen();
    } else {
        showNewIssueScreen();
    }
}

function renderDesktopStoreList() {
    const dsl = document.getElementById('desktopStoreList');
    if (!dsl) return;
    
    const withIssues = desktopStoreData.filter(s => s.counts.open > 0);
    const displayList = dslShowAll ? desktopStoreData : withIssues;
    
    let html = `<div class="dsl-header">
        <span>${displayList.length} store${displayList.length !== 1 ? 's' : ''}</span>
        <div class="dsl-toggle">
            <button class="${dslShowAll ? '' : 'active'}" onclick="dslShowAll=false;renderDesktopStoreList()">With Issues</button>
            <button class="${dslShowAll ? 'active' : ''}" onclick="dslShowAll=true;renderDesktopStoreList()">All</button>
        </div>
    </div>`;
    
    if (displayList.length === 0) {
        html += '<div style="padding:12px;text-align:center;font-size:13px;color:var(--text-muted)">🎉 No open issues!</div>';
    } else {
        displayList.forEach(s => {
            const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
            const badgeCls = s.counts.open > 0 ? 'has-issues' : 'no-issues';
            const isSelected = selectedStore && selectedStore.code === s.code;
            html += `<div class="store-list-item ${isSelected ? 'active' : ''}" onclick="desktopSelectStore('${s.id}')">
                <span class="sli-name">${shortName}</span>
                <span class="sli-badge ${badgeCls}">${s.counts.open} open</span>
            </div>`;
        });
    }
    dsl.innerHTML = html;
}

function desktopSelectStore(storeId) {
    const store = stores.find(s => s.id === storeId);
    if (!store) return;
    selectedStore = store;
    document.getElementById('storeSelect').value = storeId;
    document.getElementById('actionButtons').classList.remove('hidden');
    document.querySelectorAll('.store-list-item').forEach(el => el.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');
    if (overviewMap && store.lat && store.lng) {
        overviewMap.flyTo([store.lat, store.lng], 13, { duration: 0.5 });
        mapMarkers.forEach(m => {
            const ll = m.getLatLng();
            if (Math.abs(ll.lat - store.lat) < 0.001 && Math.abs(ll.lng - store.lng) < 0.001) {
                m.openPopup();
            }
        });
    }
}

// Map / List view toggle
let currentMapView = localStorage.getItem('mapViewPref') || 'map';
let lastFilteredStores = [];

function setMapView(view) {
    currentMapView = view;
    localStorage.setItem('mapViewPref', view);
    document.querySelectorAll('#mapViewToggle button').forEach(b => b.classList.remove('active'));
    document.querySelector(`#mapViewToggle button[onclick="setMapView('${view}')"]`).classList.add('active');
    
    const mapEl = document.getElementById('overviewMap');
    const listEl = document.getElementById('storeListView');
    const legend = document.querySelector('.map-legend');
    
    if (view === 'list') {
        mapEl.style.display = 'none';
        listEl.style.display = '';
        if (legend) legend.style.display = 'none';
        renderStoreListView();
    } else {
        mapEl.style.display = '';
        listEl.style.display = 'none';
        if (legend) legend.style.display = '';
        if (overviewMap) setTimeout(() => overviewMap.invalidateSize(), 100);
    }
}

function renderStoreListView() {
    const listEl = document.getElementById('storeListView');
    if (!lastFilteredStores.length) { listEl.innerHTML = '<div class="empty-state">Select a store type first</div>'; return; }
    
    // Fetch all tickets once, group by store
    db.ref('tickets').once('value', snap => {
        const allT = [];
        snap.forEach(child => { allT.push({ _key: child.key, ...child.val() }); });
        
        const statusLabel = { open:'Open', assigned:'Assigned', inprogress:'In Progress', waiting:'Waiting', resolved:'Resolved', closed:'Closed' };
        
        // Only show stores that have open tickets
        const storesWithTickets = lastFilteredStores.filter(s => {
            return allT.some(t => t.storeCode === s.code && t.status !== 'closed' && t.status !== 'resolved');
        });

        if (storesWithTickets.length === 0) {
            listEl.innerHTML = '<div style="padding:40px;text-align:center;font-size:15px;color:var(--text-muted)">🎉 No open tickets across these stores!</div>';
            return;
        }
        
        let html = '';
        storesWithTickets.forEach(s => {
            const storeTickets = allT.filter(t => t.storeCode === s.code && t.status !== 'closed' && t.status !== 'resolved');
            const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
            storeTickets.sort((a,b) => { const p = {emergency:0,urgent:1,routine:2}; return (p[a.priority]||2) - (p[b.priority]||2); });
            
            html += `<div class="slv-store">
                <div class="slv-store-name">${shortName} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${storeTickets.length} open)</span></div>`;
            storeTickets.forEach(t => {
                const assignee = t.assignedTo ? t.assignedTo : '';
                const prBadge = {routine:'<span class="priority-word p-routine">Routine</span>',urgent:'<span class="priority-word p-urgent">Urgent</span>',emergency:'<span class="priority-word p-emergency">Emergency</span>'}[t.priority] || '';
                html += `<div class="slv-ticket" onclick="listViewOpenTicket('${t._key}')">
                    ${prBadge}
                    <span class="slv-desc">${escHtml(t.description || '').substring(0,80)}</span>
                    <span class="ticket-status-badge status-${t.status}" style="font-size:11px;padding:2px 8px">${statusLabel[t.status] || t.status}</span>
                    ${assignee ? '<span class="slv-assignee">' + escHtml(assignee) + '</span>' : ''}
                </div>`;
            });
            html += '</div>';
        });
        listEl.innerHTML = html;
    });
}

function listViewOpenTicket(key) {
    // Load the ticket into currentTickets array so openTicketDetail can find it
    db.ref('tickets/' + key).once('value', snap => {
        const t = snap.val();
        if (!t) return;
        t._key = key;
        currentTickets = [t];
        openTicketDetail(key);
    });
}

// Also hide map when going back
const _origGoBack = goBack;
goBack = function() {
    _origGoBack();
    if (window.innerWidth >= 1100 && overviewMap) {
        setTimeout(() => overviewMap.invalidateSize(), 200);
    }
};

// Handle window resize for map
window.addEventListener('resize', () => {
    if (overviewMap) setTimeout(() => overviewMap.invalidateSize(), 200);
});

// ============================================================
// ADMIN PANEL
// ============================================================
let pendingListener = null;
let pendingUsers = {};

function watchPendingUsers() {
    if (pendingListener) return;
    pendingListener = db.ref('pending').on('value', snap => {
        pendingUsers = snap.val() || {};
        const count = Object.keys(pendingUsers).length;
        const badge = document.getElementById('pendingBadge');
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
        // If admin panel is visible, refresh it
        if (!document.getElementById('adminScreen').classList.contains('hidden')) {
            renderPendingUsers();
        }
    });
}

function showAdminPanel() {
    showScreen('adminScreen');
    renderPendingUsers();
    loadActiveUsers();
    loadNotifyRouting();
    renderAddUserForm();
}

function goBackFromAdmin() {
    showScreen('storeSelection');
}

function renderPendingUsers() {
    const container = document.getElementById('pendingList');
    const entries = Object.entries(pendingUsers);
    const count = entries.length;
    document.getElementById('pendingCount').textContent = count > 0 ? `(${count})` : '';

    if (count === 0) {
        container.innerHTML = '<div class="empty-state">No pending users</div>';
        return;
    }

    container.innerHTML = entries.map(([uid, p]) => {
        const email = (p.email || '').toLowerCase();
        const known = (typeof USER_DIRECTORY !== 'undefined') ? USER_DIRECTORY[email] : null;
        const guessedName = known ? known.name : email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const guessedRole = known ? known.role : 'Manager';
        const guessedStores = known ? (known.stores === 'all' ? [] : Array.isArray(known.stores) ? known.stores : [known.stores]) : [];
        const isKnown = !!known;
        const timeStr = p.requestedAt ? new Date(p.requestedAt).toLocaleString() : 'Unknown';

        const storeCheckboxes = stores.map(s => 
            `<label class="store-cb"><input type="checkbox" class="pstore-${uid}" value="${s.code}" ${guessedStores.includes(s.code) ? 'checked' : ''}> ${s.name.length > 22 ? s.name.substring(0,22)+'...' : s.name}</label>`
        ).join('');

        return `<div class="pending-card" id="pending-${uid}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div class="pending-email">${esc(p.email || 'Unknown')}</div>
                ${isKnown ? '<span style="font-size:11px;color:#059669;font-weight:600">✓ Found in directory</span>' : '<span style="font-size:11px;color:var(--accent);font-weight:600">⚠ Not in directory</span>'}
            </div>
            <div class="pending-time">Requested: ${timeStr}</div>
            <div class="pending-form">
                <input type="text" class="form-input" placeholder="Full name" id="pname-${uid}" value="${esc(guessedName)}">
                <select class="form-select" id="prole-${uid}">
                    <option value="Manager" ${guessedRole === 'Manager' ? 'selected' : ''}>Manager</option>
                    <option value="Area Coach" ${guessedRole === 'Area Coach' ? 'selected' : ''}>Area Coach</option>
                    <option value="Admin" ${guessedRole === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="Technician" ${guessedRole === 'Technician' ? 'selected' : ''}>Technician</option>
                </select>
                <div class="full">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                        <label class="form-label" style="margin:0">Store Access</label>
                        <button class="btn btn-ghost" style="font-size:11px;padding:2px 8px" onclick="togglePendingStores('${uid}')">All / None</button>
                    </div>
                    <div class="store-cb-grid">${storeCheckboxes}</div>
                </div>
            </div>
            <div class="pending-actions">
                <button class="btn btn-primary" onclick="approveUser('${uid}')">${isKnown ? '✓ Approve' : 'Approve'}</button>
                <button class="btn btn-secondary" onclick="denyUser('${uid}')">Deny</button>
            </div>
        </div>`;
    }).join('');
}

function togglePendingStores(uid) {
    const cbs = document.querySelectorAll(`.pstore-${uid}`);
    const allChecked = [...cbs].every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !allChecked);
}

async function approveUser(uid) {
    const name = document.getElementById(`pname-${uid}`).value.trim();
    const role = document.getElementById(`prole-${uid}`).value;
    const selectedStores = [...document.querySelectorAll(`.pstore-${uid}:checked`)].map(cb => cb.value);

    if (!name) { showToast('Enter a name', 'error'); return; }

    let storeVal;
    if (role === 'Admin') {
        storeVal = 'all';
    } else if (selectedStores.length === 0) {
        showToast('Select at least one store', 'error');
        return;
    } else if (selectedStores.length === 1 && role === 'Manager') {
        storeVal = selectedStores[0];
    } else {
        storeVal = selectedStores;
    }

    try {
        await db.ref(`users/${uid}`).set({
            name: name,
            role: role,
            stores: storeVal,
            email: pendingUsers[uid]?.email || '',
            approvedAt: firebase.database.ServerValue.TIMESTAMP,
            approvedBy: currentUser.email
        });
        await db.ref(`pending/${uid}`).remove();
        showToast(`${name} approved as ${role}`, 'success');
    } catch (err) {
        console.error('Approve error:', err);
        showToast('Failed to approve: ' + err.message, 'error');
    }
}

async function denyUser(uid) {
    if (!confirm('Deny this user? They will need to request access again.')) return;
    try {
        await db.ref(`pending/${uid}`).remove();
        showToast('User denied', 'success');
    } catch (err) {
        showToast('Failed: ' + err.message, 'error');
    }
}

async function loadActiveUsers() {
    const container = document.getElementById('activeUsersList');
    try {
        const snap = await db.ref('users').once('value');
        const users = snap.val() || {};
        const entries = Object.entries(users);
        document.getElementById('activeCount').textContent = `(${entries.length})`;

        if (entries.length === 0) {
            container.innerHTML = '<div class="empty-state">No active users</div>';
            return;
        }

        container.innerHTML = entries.map(([uid, u]) => {
            const initials = (u.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const roleClass = u.role === 'Admin' ? 'admin' : u.role === 'Area Coach' ? 'areacoach' : 'manager';
            const storeStr = u.stores === 'all' ? 'All stores' :
                Array.isArray(u.stores) ? u.stores.length + ' stores' :
                u.stores || 'None';

            return `<div class="user-row">
                <div class="user-row-avatar">${initials}</div>
                <div class="user-row-info">
                    <div class="user-row-name">${esc(u.name || 'Unknown')}</div>
                    <div class="user-row-email">${esc(u.email || uid)} · ${storeStr}</div>
                </div>
                <span class="user-row-role ${roleClass}">${u.role || 'Manager'}</span>
                <div class="user-row-actions">
                    <button onclick="editUser('${uid}')">Edit</button>
                    <button class="del" onclick="removeUser('${uid}','${esc(u.name || '')}')">Remove</button>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div class="empty-state">Error loading users</div>';
    }
}

function editUser(uid) {
    db.ref(`users/${uid}`).once('value', snap => {
        const u = snap.val();
        if (!u) return;

        const storeCheckboxes = stores.map(s => {
            const checked = u.stores === 'all' ? true :
                Array.isArray(u.stores) ? u.stores.includes(s.code) :
                u.stores === s.code;
            return `<label class="store-cb"><input type="checkbox" class="edit-store-cb" value="${s.code}" ${checked ? 'checked' : ''}> ${s.name.length > 22 ? s.name.substring(0,22)+'...' : s.name}</label>`;
        }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'admin-modal';
        overlay.id = 'editUserModal';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div class="modal-card">
            <h3>Edit User</h3>
            <div class="form-group">
                <label class="form-label">Name</label>
                <input class="form-input" id="editName" value="${esc(u.name || '')}">
            </div>
            <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-input" value="${esc(u.email || uid)}" disabled style="opacity:.5">
            </div>
            <div class="form-group">
                <label class="form-label">Role</label>
                <select class="form-select" id="editRole">
                    <option value="Manager" ${u.role === 'Manager' ? 'selected' : ''}>Manager</option>
                    <option value="Area Coach" ${u.role === 'Area Coach' ? 'selected' : ''}>Area Coach</option>
                    <option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="Technician" ${u.role === 'Technician' ? 'selected' : ''}>Technician</option>
                </select>
            </div>
            <div class="form-group">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                    <label class="form-label" style="margin:0">Store Access</label>
                    <button class="btn btn-ghost" style="font-size:11px;padding:2px 8px" onclick="toggleEditStores()">All / None</button>
                </div>
                <div class="store-cb-grid">${storeCheckboxes}</div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="saveEditUser('${uid}')">Save</button>
                <button class="btn btn-secondary" onclick="document.getElementById('editUserModal').remove()">Cancel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    });
}

function toggleEditStores() {
    const cbs = document.querySelectorAll('.edit-store-cb');
    const allChecked = [...cbs].every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !allChecked);
}

async function saveEditUser(uid) {
    const name = document.getElementById('editName').value.trim();
    const role = document.getElementById('editRole').value;
    const selected = [...document.querySelectorAll('.edit-store-cb:checked')].map(cb => cb.value);

    if (!name) { showToast('Name required', 'error'); return; }

    let storeVal;
    if (role === 'Admin') {
        storeVal = 'all';
    } else if (selected.length === 0) {
        showToast('Select at least one store', 'error');
        return;
    } else if (selected.length === 1 && role === 'Manager') {
        storeVal = selected[0];
    } else {
        storeVal = selected;
    }

    try {
        await db.ref(`users/${uid}`).update({ name, role, stores: storeVal });
        document.getElementById('editUserModal').remove();
        showToast('User updated', 'success');
        loadActiveUsers();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function removeUser(uid, name) {
    if (!confirm(`Remove ${name || 'this user'}? They won't be able to sign in until re-approved.`)) return;
    try {
        await db.ref(`users/${uid}`).remove();
        showToast('User removed', 'success');
        loadActiveUsers();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// Database cleanup
// ============================================================
// ADD NEW USER
// ============================================================
function renderAddUserForm() {
    const catsEl = document.getElementById('newUserCats');
    const allCats = ['plumbing', 'equipment', 'it', 'structural', 'safety', 'other'];
    catsEl.innerHTML = allCats.map(cat => `
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">
            <input type="checkbox" class="new-user-cat" value="${cat}"> ${capitalize(cat)}
        </label>
    `).join('');

    const storesEl = document.getElementById('newUserStores');
    storesEl.innerHTML = stores.map(s => `
        <label class="store-cb"><input type="checkbox" class="new-user-store" value="${s.code}"> ${s.name.length > 22 ? s.name.substring(0,22)+'...' : s.name}</label>
    `).join('');
}

let allNewUserStoresSelected = false;
function toggleAllNewUserStores() {
    allNewUserStoresSelected = !allNewUserStoresSelected;
    document.querySelectorAll('.new-user-store').forEach(cb => cb.checked = allNewUserStoresSelected);
}

async function addNewUser() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim().toLowerCase();
    const role = document.getElementById('newUserRole').value;

    if (!name) { toast('Enter a name', 'error'); return; }
    if (!email || !email.includes('@')) { toast('Enter a valid email', 'error'); return; }
    if (!role) { toast('Select a role', 'error'); return; }

    const selectedStores = [...document.querySelectorAll('.new-user-store:checked')].map(cb => cb.value);
    const selectedCats = [...document.querySelectorAll('.new-user-cat:checked')].map(cb => cb.value);

    if (selectedStores.length === 0 && role !== 'Admin') {
        toast('Select at least one store', 'error');
        return;
    }

    // Determine stores value
    let storesVal;
    if (role === 'Admin') {
        storesVal = 'all';
    } else if (selectedStores.length === 1) {
        storesVal = selectedStores[0];
    } else {
        storesVal = selectedStores;
    }

    // Save user to Firebase (pre-approved, ready to sign in)
    const userData = {
        name: name,
        email: email,
        role: role,
        stores: storesVal,
        status: 'active',
        addedAt: firebase.database.ServerValue.TIMESTAMP,
        addedBy: currentUser.email
    };

    try {
        // Store under a sanitized email key
        const emailKey = email.replace(/\./g, ',');
        await db.ref(`preApproved/${emailKey}`).set(userData);

        // Also update notification routing for selected categories
        if (selectedCats.length > 0) {
            const routingSnap = await db.ref('config/notifyRouting').once('value');
            const routing = routingSnap.val() || {};
            for (const cat of selectedCats) {
                if (!routing[cat]) routing[cat] = [];
                if (!routing[cat].includes(email)) {
                    routing[cat].push(email);
                }
            }
            await db.ref('config/notifyRouting').set(routing);
            notifyRouting = routing;
        }

        toast(`User ${name} added successfully`, 'success');

        // Clear form
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserRole').value = '';
        document.querySelectorAll('.new-user-store').forEach(cb => cb.checked = false);
        document.querySelectorAll('.new-user-cat').forEach(cb => cb.checked = false);
        allNewUserStoresSelected = false;
    } catch (err) {
        toast('Error: ' + err.message, 'error');
    }
}

async function scanOldNodes() {
    const btn = document.getElementById('scanBtn');
    btn.textContent = 'Scanning...';
    btn.disabled = true;
    
    const oldNodes = ['issues', 'stores', 'cameras'];
    const container = document.getElementById('cleanupNodes');
    const found = [];
    
    for (const node of oldNodes) {
        try {
            const snap = await db.ref(node).once('value');
            if (snap.exists()) {
                const count = snap.numChildren();
                found.push({ node, count });
            }
        } catch (e) { /* skip nodes we can't read */ }
    }
    
    // Also check for stale user entries (UIDs in /users that have no matching pending and weird data)
    
    if (found.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">✓ Database is clean. No old data found.</div>';
    } else {
        container.innerHTML = found.map(f => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--border-light);border-radius:8px;margin-bottom:6px">
                <div>
                    <strong style="font-size:13px">/${f.node}</strong>
                    <span style="font-size:12px;color:var(--text-muted);margin-left:8px">${f.count} entries</span>
                </div>
                <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px" onclick="deleteNode('${f.node}')">Delete</button>
            </div>
        `).join('');
    }
    
    btn.textContent = 'Scan again';
    btn.disabled = false;
}

async function deleteNode(node) {
    if (!confirm(`Delete /${node} and all its data? This cannot be undone.`)) return;
    try {
        await db.ref(node).remove();
        showToast(`/${node} deleted`, 'success');
        scanOldNodes();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// NOTIFICATION ROUTING
// ============================================================
const CATEGORIES = ['plumbing','equipment','it','structural','safety','other'];
const CAT_LABELS = {plumbing:'Plumbing',equipment:'Equipment',it:'IT',structural:'Structural',safety:'Safety',other:'Other'};
let notifyRouting = {};

function loadNotifyRouting() {
    db.ref('config/notifyRouting').once('value', snap => {
        notifyRouting = snap.val() || {};
        renderNotifyGrid();
    });
}

function renderNotifyGrid() {
    const container = document.getElementById('notifyGrid');
    container.innerHTML = CATEGORIES.map(cat => {
        const emails = notifyRouting[cat] || ['','',''];
        return `<div style="margin-bottom:10px;padding:10px 12px;background:var(--border-light);border-radius:8px">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--text-mid)">${CAT_LABELS[cat]}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
                <input class="form-input" style="flex:1;min-width:160px;font-size:12px;padding:5px 8px" placeholder="Email 1" id="nr-${cat}-0" value="${esc(emails[0]||'')}">
                <input class="form-input" style="flex:1;min-width:160px;font-size:12px;padding:5px 8px" placeholder="Email 2" id="nr-${cat}-1" value="${esc(emails[1]||'')}">
                <input class="form-input" style="flex:1;min-width:160px;font-size:12px;padding:5px 8px" placeholder="Email 3" id="nr-${cat}-2" value="${esc(emails[2]||'')}">
            </div>
        </div>`;
    }).join('');
}

async function saveNotifyRouting() {
    const routing = {};
    CATEGORIES.forEach(cat => {
        const emails = [0,1,2].map(i => document.getElementById(`nr-${cat}-${i}`).value.trim().toLowerCase()).filter(Boolean);
        if (emails.length) routing[cat] = emails;
    });
    try {
        await db.ref('config/notifyRouting').set(routing);
        notifyRouting = routing;
        showToast('Notification routing saved', 'success');
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// ============================================================
// VENDOR MANAGEMENT
// ============================================================
async function loadVendors() {
    const snap = await db.ref('config/vendors').once('value');
    vendorList = [];
    snap.forEach(child => { vendorList.push({ id: child.key, ...child.val() }); });
    renderVendorRows();
    populateAssignDropdown();
    renderVendorCatCheckboxes();
}

function renderVendorRows() {
    const container = document.getElementById('vendorRows');
    if (!container) return;
    if (vendorList.length === 0) {
        container.innerHTML = '<div class="empty-state" style="font-size:13px">No vendors added yet</div>';
        return;
    }
    container.innerHTML = vendorList.map(v => `
        <div class="vendor-row">
            <span class="vendor-name">${escHtml(v.name)}</span>
            <span class="vendor-meta">${escHtml(v.areas || '')} · ${(v.categories || []).map(capitalize).join(', ')}</span>
            <button class="btn btn-ghost" style="font-size:11px;color:var(--danger)" onclick="removeVendor('${v.id}')">Remove</button>
        </div>`).join('');
}

function renderVendorCatCheckboxes() {
    const container = document.getElementById('newVendorCats');
    if (!container) return;
    const cats = ['plumbing','equipment','it','structural','safety','other'];
    container.innerHTML = cats.map(c => `<label class="store-cb" style="border:1px solid var(--border);border-radius:6px;padding:2px 6px"><input type="checkbox" class="vendor-cat-cb" value="${c}"> ${capitalize(c)}</label>`).join('');
}

async function addVendor() {
    const name = document.getElementById('newVendorName').value.trim();
    const areas = document.getElementById('newVendorAreas').value.trim();
    const cats = [...document.querySelectorAll('.vendor-cat-cb:checked')].map(c => c.value);
    if (!name) { showToast('Enter vendor name', 'error'); return; }
    
    // Check edit permission
    const canEdit = await checkVendorEditPermission();
    if (!canEdit) { showToast('You don\'t have permission to edit vendors', 'error'); return; }
    
    try {
        await db.ref('config/vendors').push({ name, areas, categories: cats });
        document.getElementById('newVendorName').value = '';
        document.getElementById('newVendorAreas').value = '';
        document.querySelectorAll('.vendor-cat-cb').forEach(c => c.checked = false);
        showToast('Vendor added', 'success');
        loadVendors();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function removeVendor(id) {
    if (!confirm('Remove this vendor?')) return;
    const canEdit = await checkVendorEditPermission();
    if (!canEdit) { showToast('No permission', 'error'); return; }
    try {
        await db.ref('config/vendors/' + id).remove();
        showToast('Vendor removed', 'success');
        loadVendors();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function checkVendorEditPermission() {
    if (currentUser.role === 'Admin') return true;
    const snap = await db.ref('config/vendorEditors').once('value');
    const editors = snap.val() || [];
    return editors.includes(currentUser.email);
}

// Stores that can ONLY be assigned to Ravay (east TX / AR)
const RAVAY_ONLY_STORES = ['BK02390','PQS16','PQS15','BK24008','PQS11','BK26015','PQS13','BK23086','BK10358','PQS06','PQS08','SUB22','PQS07','PQS09','PQS12','PQS10','PQS05','NASH01'];

const TECH_INFO = [
    { email: 'rmtech1@dossaniparadise.com', name: 'Ronny Gossett', zone: 'west' },
    { email: 'rmtech2@dossaniparadise.com', name: 'Ravay Wickware', zone: 'east' },
    { email: 'rmtech3@dossaniparadise.com', name: 'Zamir Rios', zone: 'west' }
];

function getAvailableTechs(storeCode) {
    if (RAVAY_ONLY_STORES.includes(storeCode)) {
        return TECH_INFO.filter(t => t.zone === 'east'); // Only Ravay for east TX
    }
    return TECH_INFO.filter(t => t.zone === 'west'); // Only Ronny + Zamir for west
}

function populateAssignDropdown() {
    const sel = document.getElementById('assignTo');
    if (!sel) return;
    sel.innerHTML = '<option value="">Unassigned</option>';
    
    // Internal techs - filtered by store geography
    const storeCode = selectedStore ? selectedStore.code : '';
    const availTechs = getAvailableTechs(storeCode);
    
    if (availTechs.length) {
        sel.innerHTML += '<optgroup label="Repair Technicians">';
        availTechs.forEach(t => {
            sel.innerHTML += `<option value="tech:${t.email}">🔧 ${t.name}</option>`;
        });
        sel.innerHTML += '</optgroup>';
    }
    
    // Vendors
    if (vendorList.length) {
        sel.innerHTML += '<optgroup label="Third-Party Vendors">';
        vendorList.forEach(v => {
            sel.innerHTML += `<option value="vendor:${v.name}">🏢 ${v.name}</option>`;
        });
        sel.innerHTML += '</optgroup>';
    }
}

function toggleDateFields() {
    const type = document.getElementById('reqDateType').value;
    const d1 = document.getElementById('reqDate1');
    const d2 = document.getElementById('reqDate2');
    const sep = document.getElementById('reqDateRangeSep');
    
    d1.style.display = type ? '' : 'none';
    d2.style.display = type === 'range' ? '' : 'none';
    sep.style.display = type === 'range' ? '' : 'none';
}

// ============================================================
// NOTIFICATION CENTER
// ============================================================
let notifyTickets = [];
let notifyListenerRef = null;
let notifyListenerCallback = null;

function initNotificationCenter() {
    // Show bell for every logged-in user
    document.getElementById('notifyBtn').classList.remove('hidden');

    // Properly detach previous listener if any
    if (notifyListenerRef && notifyListenerCallback) {
        notifyListenerRef.off('value', notifyListenerCallback);
        notifyListenerRef = null;
        notifyListenerCallback = null;
    }

    // Determine which stores this user can see
    const isAdmin = currentUser.role === 'Admin' || currentUser.stores === 'all';
    let myStores = null;
    if (!isAdmin) {
        myStores = Array.isArray(currentUser.stores) ? currentUser.stores : 
                   (currentUser.stores ? [currentUser.stores] : []);
    }

    // Check notification routing for category-based visibility
    const myEmail = currentUser.email ? currentUser.email.toLowerCase() : '';
    const myRoutedCategories = [];
    if (notifyRouting && typeof notifyRouting === 'object') {
        for (const [cat, emails] of Object.entries(notifyRouting)) {
            if (Array.isArray(emails) && emails.some(e => e.toLowerCase() === myEmail)) {
                myRoutedCategories.push(cat);
            }
        }
    }

    console.log('[Notifications] Init for', currentUser.name, 
        '| isAdmin:', isAdmin, 
        '| myStores:', myStores, 
        '| routedCats:', myRoutedCategories);

    // Create the callback
    notifyListenerCallback = function(snap) {
        notifyTickets = [];
        snap.forEach(child => {
            const t = child.val();
            if (!t) return;
            t._key = child.key;

            // Skip closed/resolved tickets
            if (!t.status || t.status === 'closed' || t.status === 'resolved') return;

            // Store access check: admin sees all, others check store list
            let canSee = false;
            if (isAdmin) {
                canSee = true;
            } else if (myStores && myStores.length > 0 && t.storeCode) {
                canSee = myStores.includes(t.storeCode);
            }

            // Category routing: if user is routed for this category, also show it
            if (!canSee && myRoutedCategories.length > 0 && t.category) {
                canSee = myRoutedCategories.includes(t.category);
            }

            if (canSee) {
                notifyTickets.push(t);
            }
        });

        // Sort: emergency first, then urgent, then routine, then by newest
        const priOrder = { emergency: 0, urgent: 1, routine: 2 };
        notifyTickets.sort((a, b) => 
            (priOrder[a.priority] || 2) - (priOrder[b.priority] || 2) || 
            (b.createdAt || 0) - (a.createdAt || 0)
        );

        console.log('[Notifications] Found', notifyTickets.length, 'tickets for', currentUser.name);
        updateNotifyBadge();

        // If panel is open, refresh it live
        const panel = document.getElementById('notifyPanel');
        if (panel && panel.classList.contains('open')) {
            renderNotifyPanel();
        }
    };

    // Attach listener
    notifyListenerRef = db.ref('tickets');
    notifyListenerRef.on('value', notifyListenerCallback);
}

function updateNotifyBadge() {
    const badge = document.getElementById('notifyBadge');
    const count = notifyTickets.length;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function toggleNotifyPanel() {
    const panel = document.getElementById('notifyPanel');
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
        panel.classList.remove('open');
        return;
    }
    panel.classList.add('open');
    renderNotifyPanel();
}

function renderNotifyPanel() {
    const body = document.getElementById('notifyPanelBody');
    if (notifyTickets.length === 0) {
        const lang = currentLang === 'es' ? 'No hay tickets abiertos' : 'No open tickets';
        body.innerHTML = '<div class="notify-empty">' + lang + '</div>';
        return;
    }
    const lang = currentLang === 'es';
    body.innerHTML = notifyTickets.map(t => {
        const priClass = t.priority === 'emergency' ? 'pri-emergency' : t.priority === 'urgent' ? 'pri-urgent' : '';
        const timeAgo = getTimeAgo(t.createdAt);
        const store = stores.find(s => s.code === t.storeCode);
        const storeName = store ? store.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ') : t.storeCode;
        const priLabel = lang ? ({routine:'Rutina',urgent:'Urgente',emergency:'Emergencia'}[t.priority]||t.priority) : capitalize(t.priority || 'routine');
        return `<div class="notify-item" onclick="notifyGoToTicket('${esc(t._key || t.id)}', '${esc(t.storeCode)}')">
            <div class="notify-item-title">${getCategoryEmoji(t.category)} ${esc((t.description || '').substring(0, 60))}${(t.description||'').length > 60 ? '...' : ''}</div>
            <div class="notify-item-meta">
                <span class="${priClass}">● ${priLabel}</span>
                <span>${capitalize(t.category)}${t.location ? ' · ' + capitalize(t.location) : ''}</span>
                <span>${storeName}</span>
                <span>${timeAgo}</span>
            </div>
        </div>`;
    }).join('');
}

function notifyGoToTicket(key, storeCode) {
    document.getElementById('notifyPanel').classList.remove('open');
    const store = stores.find(s => s.code === storeCode);
    if (store) {
        selectedStore = store;
        const t = notifyTickets.find(x => (x._key === key || x.id === key));
        if (t) {
            if (!t._key) t._key = key;
            if (!currentTickets.find(x => x._key === key)) currentTickets.push(t);
        }
        openTicketDetail(key);
    }
}

// Close notify panel on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifyPanel');
    const btn = document.getElementById('notifyBtn');
    if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.classList.remove('open');
    }
});

// ============================================================
// ALL TICKETS SCREEN
// ============================================================
let allTicketsData = [];

function showAllTickets(defaultStatus) {
    showScreen('allTicketsScreen');
    const statusSel = document.getElementById('atFilterStatus');
    statusSel.value = defaultStatus || 'open';
    
    // Populate store filter
    const type = document.getElementById('storeType').value;
    document.getElementById('atFilterType').value = type || '';
    populateAllTicketsStoreFilter();
    
    // Load all tickets
    const listEl = document.getElementById('allTicketsList');
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)"><span class="spinner spinner-dark"></span> Loading...</div>';
    
    db.ref('tickets').once('value', snap => {
        allTicketsData = [];
        snap.forEach(child => {
            allTicketsData.push(child.val());
        });
        // Sort newest first
        allTicketsData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        filterAllTickets();
    });
}

function populateAllTicketsStoreFilter() {
    const type = document.getElementById('atFilterType').value;
    const sel = document.getElementById('atFilterStore');
    sel.innerHTML = '<option value="">All Stores</option>';
    let filtered = stores;
    if (type) filtered = stores.filter(s => s.type === type);
    // Permission filter
    if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
        const userStores = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
        filtered = filtered.filter(s => userStores.includes(s.code));
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    filtered.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = s.name;
        sel.appendChild(opt);
    });
}

function filterAllTickets() {
    populateAllTicketsStoreFilter();
    const status = document.getElementById('atFilterStatus').value;
    const type = document.getElementById('atFilterType').value;
    const storeCode = document.getElementById('atFilterStore').value;
    
    let filtered = allTicketsData;
    
    // Permission filter
    if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
        const userStores = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
        filtered = filtered.filter(t => userStores.includes(t.storeCode));
    }
    
    // Status filter
    if (status === 'open') {
        filtered = filtered.filter(t => t.status && t.status !== 'closed' && t.status !== 'resolved');
    } else if (status !== 'all') {
        filtered = filtered.filter(t => (t.status || '').toLowerCase().replace(/\s+/g, '') === status);
    }
    
    // Type filter
    if (type) {
        const typeCodes = stores.filter(s => s.type === type).map(s => s.code);
        filtered = filtered.filter(t => typeCodes.includes(t.storeCode));
    }
    
    // Store filter
    if (storeCode) {
        filtered = filtered.filter(t => t.storeCode === storeCode);
    }
    
    const title = document.getElementById('allTicketsTitle');
    title.textContent = status === 'all' ? `All Tickets (${filtered.length})` : `${status === 'open' ? 'Open' : capitalize(status)} Tickets (${filtered.length})`;
    
    const listEl = document.getElementById('allTicketsList');
    if (filtered.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">No tickets found</div>';
        return;
    }
    
    listEl.innerHTML = filtered.map(t => {
        const brandIcon = BRAND_LOGOS[t.brand] ? `<img src="${BRAND_LOGOS[t.brand]}" style="height:14px;width:14px;object-fit:contain;border-radius:2px">` : '';
        const timeAgo = getTimeAgo(t.createdAt);
        const photoCount = t.photos ? t.photos.length : 0;
        const shortDesc = (t.description || '').substring(0, 80) + ((t.description || '').length > 80 ? '...' : '');
        const statusClass = (t.status || 'open').toLowerCase().replace(/\s+/g, '');
        const prColor = t.priority === 'emergency' ? '#dc2626' : t.priority === 'urgent' ? '#d97706' : '#059669';
        
        return `<div class="ticket-card" onclick="openTicketFromAll('${esc(t.id)}')">
            <div class="ticket-card-top">
                <span class="ticket-id">${esc(t.id)}</span>
                <span class="ticket-status s-${statusClass}">${(t.status || 'open').toUpperCase()}</span>
            </div>
            <div class="ticket-card-desc">
                <span class="cat-emoji">${getCategoryEmoji(t.category)}</span> ${esc(shortDesc)}
            </div>
            <div class="ticket-card-meta">
                <span style="color:${prColor}">● ${capitalize(t.priority || 'routine')}</span>
                <span>${capitalize(t.category || '')}${t.location ? ' · ' + capitalize(t.location) : ''}</span>
                ${brandIcon}
                <span>${timeAgo}</span>
                <span style="color:var(--text-muted)">${esc(t.storeName || t.storeCode)}</span>
                ${photoCount ? '<span>📷 ' + photoCount + '</span>' : ''}
            </div>
        </div>`;
    }).join('');
}

function openTicketFromAll(ticketId) {
    const t = allTicketsData.find(x => x.id === ticketId);
    if (!t) return;
    const store = stores.find(s => s.code === t.storeCode);
    if (store) selectedStore = store;
    // Inject into currentTickets so openTicketDetail can find it
    if (!t._key) t._key = ticketId;
    const existing = currentTickets.find(x => x._key === ticketId);
    if (!existing) currentTickets.push(t);
    openTicketDetail(ticketId);
}

// ============================================================
// VIEW AS (itsupport impersonation)
// ============================================================
let realUser = null; // stash the real itsupport user when impersonating

function showViewAsModal() {
    // Load all active users from Firebase
    db.ref('users').once('value', snap => {
        const users = snap.val() || {};
        const entries = Object.entries(users).filter(([uid]) => uid !== currentUser.uid);

        const overlay = document.createElement('div');
        overlay.className = 'admin-modal';
        overlay.id = 'viewAsModal';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div class="modal-card">
            <h3>View As Another User</h3>
            <p style="font-size:13px;color:var(--text-mid);margin-bottom:14px">See the app exactly as this user would. You'll keep your admin powers but see their stores and role.</p>
            <div class="form-group">
                <select class="form-select" id="viewAsSelect" style="font-size:14px">
                    <option value="">Choose a user...</option>
                    ${entries.sort((a,b) => (a[1].name||'').localeCompare(b[1].name||'')).map(([uid, u]) =>
                        `<option value="${uid}">${esc(u.name || 'Unknown')} — ${esc(u.role || 'Manager')} (${esc(u.email || uid)})</option>`
                    ).join('')}
                </select>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" onclick="doViewAs()">View As</button>
                ${realUser ? '<button class="btn btn-accent" onclick="exitViewAs()">↩ Back to IT Support</button>' : ''}
                <button class="btn btn-secondary" onclick="document.getElementById('viewAsModal').remove()">Cancel</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
    });
}

function doViewAs() {
    const uid = document.getElementById('viewAsSelect').value;
    if (!uid) return;

    db.ref(`users/${uid}`).once('value', snap => {
        const data = snap.val();
        if (!data) { showToast('User not found', 'error'); return; }

        // Stash real user if not already impersonating
        if (!realUser) realUser = { ...currentUser };

        // Impersonate
        currentUser = {
            uid: realUser.uid, // keep real auth UID for Firebase writes
            email: data.email || '',
            name: data.name || 'Unknown',
            role: normalizeRole(data.role),
            stores: data.stores || [],
            _impersonating: data.name || data.email
        };

        document.getElementById('viewAsModal').remove();

        // Reset UI
        showScreen('storeSelection');
        document.getElementById('storeType').value = '';
        document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
        document.getElementById('storeSelect').innerHTML = '<option value="">Choose store...</option>';
        document.getElementById('actionButtons').classList.add('hidden');
        document.getElementById('mapOverview').classList.add('hidden');
        selectedStore = null;

        // Update header
        const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        document.getElementById('userAvatar').textContent = initials || '?';
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').innerHTML = currentUser.role + ' <span style="font-size:10px;color:var(--accent);font-weight:700">(viewing as)</span>';

        // Keep admin + viewAs buttons visible
        document.getElementById('adminBtn').classList.remove('hidden');
        document.getElementById('viewAsBtn').classList.remove('hidden');

        // Show/hide All Locations pill based on impersonated user's role
        const allPill = document.getElementById('brandPill-all');
        const allOpt = document.querySelector('.admin-only-opt');
        if (currentUser.role === 'Admin' || currentUser.stores === 'all') {
            if (allPill) allPill.classList.remove('hidden');
            if (allOpt) allOpt.classList.remove('hidden');
        } else {
            if (allPill) allPill.classList.add('hidden');
            if (allOpt) allOpt.classList.add('hidden');
        }

        // Re-run auto-select for single-store managers
        if (currentUser.role === 'Manager' && currentUser.stores && !Array.isArray(currentUser.stores)) {
            const store = stores.find(s => s.code === currentUser.stores);
            if (store) {
                selectedStore = store;
                document.getElementById('storeType').value = store.type;
                filterStores();
                document.getElementById('storeSelect').value = store.id;
                selectStore();
            }
        }

        initNotificationCenter();
        showToast(`Viewing as ${currentUser.name}`, 'success');
    });
}

function exitViewAs() {
    if (!realUser) return;
    currentUser = { ...realUser };
    realUser = null;

    document.getElementById('viewAsModal')?.remove();

    // Reset UI
    showScreen('storeSelection');
    document.getElementById('storeType').value = '';
    document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('storeSelect').innerHTML = '<option value="">Choose store...</option>';
    document.getElementById('actionButtons').classList.add('hidden');
    document.getElementById('mapOverview').classList.add('hidden');
    selectedStore = null;

    // Restore header
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('userAvatar').textContent = initials || '?';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;

    // Restore All Locations for admin
    if (currentUser.role === 'Admin' || currentUser.role === 'Technician' || currentUser.stores === 'all') {
        document.getElementById('brandPill-all').classList.remove('hidden');
        document.querySelector('.admin-only-opt')?.classList.remove('hidden');
    }

    initNotificationCenter();
    showToast('Back to IT Support', 'success');
}

// ============================================================
// NEW ISSUE FORM
// ============================================================
function showNewIssueScreen() {
    if (!selectedStore) return;
    resetNewIssueForm();
    document.getElementById('newIssueStoreName').textContent = selectedStore.name;
    populateAssignDropdown(); // refresh based on selected store geography
    showScreen('newIssueScreen');
}

function resetNewIssueForm() {
    selectedCategory = null;
    selectedPriority = null;
    selectedLocation = null;
    uploadedPhotos = [];
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('issueDescription').value = '';
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('photoPreviewGrid').innerHTML = '';
    document.getElementById('photoUploadArea').classList.remove('has-photos');
    const assignTo = document.getElementById('assignTo');
    if (assignTo) assignTo.value = '';
    const reqDateType = document.getElementById('reqDateType');
    if (reqDateType) { reqDateType.value = ''; toggleDateFields(); }
    const btn = document.getElementById('submitBtn');
    btn.innerHTML = 'Submit Ticket';
    btn.disabled = false;
}

function selectCategory(el) {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selectedCategory = el.dataset.cat;
}

function selectLocation(el) {
    el.parentElement.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selectedLocation = el.dataset.loc;
}

function formatPhone(input) {
    let v = input.value.replace(/\D/g, '').substring(0, 10);
    if (v.length >= 7) {
        input.value = v.substring(0,3) + '-' + v.substring(3,6) + '-' + v.substring(6);
    } else if (v.length >= 4) {
        input.value = v.substring(0,3) + '-' + v.substring(3);
    } else {
        input.value = v;
    }
}

function selectPriority(el) {
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selectedPriority = el.dataset.priority;
}

function handlePhotos(input) {
    const files = Array.from(input.files).slice(0, 3 - uploadedPhotos.length);
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'error'); return; }
        const url = URL.createObjectURL(file);
        uploadedPhotos.push({ file, previewUrl: url });
    });
    renderPhotoPreview();
    input.value = '';
}

function renderPhotoPreview() {
    const grid = document.getElementById('photoPreviewGrid');
    grid.innerHTML = '';
    document.getElementById('photoUploadArea').classList.toggle('has-photos', uploadedPhotos.length > 0);

    uploadedPhotos.forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'photo-preview';
        div.innerHTML = `<img src="${p.previewUrl}" alt="Photo"><button class="photo-remove" onclick="removePhoto(${i})">✕</button>`;
        grid.appendChild(div);
    });
}

function removePhoto(i) {
    URL.revokeObjectURL(uploadedPhotos[i].previewUrl);
    uploadedPhotos.splice(i, 1);
    renderPhotoPreview();
}

function showAssignPrompt() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-box">
            <h4>📋 No assignment or date set</h4>
            <p>Assigning a tech or vendor and setting a requested date helps track this ticket. Submit without?</p>
            <div class="confirm-btns">
                <button class="btn btn-secondary" id="assignGoBack">Go back</button>
                <button class="btn btn-primary" id="assignSubmitAnyway">Submit anyway</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#assignGoBack').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#assignSubmitAnyway').onclick = () => { window._skipAssignPrompt = true; overlay.remove(); resolve(true); };
    });
}

function showPhotoConfirm() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-box">
            <h4>📷 No photos attached</h4>
            <p>Even 1 photo helps our repair team understand the issue faster. Submit without photos?</p>
            <div class="confirm-btns">
                <button class="btn btn-secondary" onclick="this.closest('.confirm-overlay').remove()">Go back</button>
                <button class="btn btn-primary" id="confirmNoPhoto">Submit anyway</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.btn-secondary').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('#confirmNoPhoto').onclick = () => { overlay.remove(); resolve(true); };
    });
}

async function submitTicket() {
    // Validate
    if (!selectedCategory) { toast('Select a category', 'error'); return; }
    if (!selectedLocation) { toast('Select interior or exterior', 'error'); return; }
    const contactName = document.getElementById('contactName').value.trim();
    if (!contactName) { toast('Enter your name', 'error'); return; }
    const contactPhone = document.getElementById('contactPhone').value.trim();
    if (!contactPhone || contactPhone.replace(/\D/g,'').length < 10) { toast('Enter a valid phone number', 'error'); return; }
    if (!selectedPriority) { toast('Select a priority', 'error'); return; }
    // Photos optional but encouraged
    if (uploadedPhotos.length === 0) {
        const confirmed = await showPhotoConfirm();
        if (!confirmed) return;
    }
    const desc = document.getElementById('issueDescription').value.trim();
    if (!desc) { toast('Add a description', 'error'); return; }
    if (desc.length < 10) { toast('Description too short', 'error'); return; }

    // Soft prompt for assignment (coaches/admins only)
    const assignEl = document.getElementById('assignTo');
    if (assignEl && assignEl.offsetParent !== null && !assignEl.value) {
        if (!window._skipAssignPrompt) {
            const doAssign = await showAssignPrompt();
            if (!doAssign) { window._skipAssignPrompt = false; return; }
        }
    }
    window._skipAssignPrompt = false;

    const btn = document.getElementById('submitBtn');
    btn.innerHTML = '<span class="spinner"></span> Submitting...';
    btn.disabled = true;

    try {
        // Convert photos to base64 data URLs (stored directly in ticket)
        const photoUrls = [];
        for (const p of uploadedPhotos) {
            const dataUrl = await fileToBase64(p.file);
            photoUrls.push(dataUrl);
        }

        // Generate sequential ticket ID: STORE-CAT-0001
        const catPrefix = {
            plumbing: 'PLM', equipment: 'EQP', it: 'IT',
            structural: 'STR', safety: 'SAF', other: 'GEN'
        }[selectedCategory] || 'GEN';
        
        // Get next number from counter
        const counterRef = db.ref(`counters/${selectedStore.code}/${catPrefix}`);
        const counterSnap = await counterRef.transaction(val => (val || 0) + 1);
        const num = String(counterSnap.snapshot.val()).padStart(4, '0');
        const ticketId = `${selectedStore.code}-${catPrefix}-${num}`;

        // Get assignment data
        const assignVal = document.getElementById('assignTo')?.value || '';
        let assignedTo = '';
        let assigneeType = 'unassigned';
        if (assignVal.startsWith('tech:')) {
            assignedTo = assignVal.replace('tech:', '');
            assigneeType = 'tech';
        } else if (assignVal.startsWith('vendor:')) {
            assignedTo = assignVal.replace('vendor:', '');
            assigneeType = 'vendor';
        }

        // Get requested date
        let requestedDate = null;
        const dateType = document.getElementById('reqDateType')?.value;
        if (dateType) {
            requestedDate = { type: dateType, date: document.getElementById('reqDate1')?.value || '' };
            if (dateType === 'range') {
                requestedDate.endDate = document.getElementById('reqDate2')?.value || '';
            }
        }

        // Create ticket in Firebase
        const ticket = {
            id: ticketId,
            storeCode: selectedStore.code,
            storeName: selectedStore.name,
            brand: selectedStore.brand || '',
            category: selectedCategory,
            location: selectedLocation,
            contactName: contactName,
            contactPhone: contactPhone,
            priority: selectedPriority,
            description: desc,
            photos: photoUrls,
            status: assignedTo ? 'assigned' : 'open',
            assignedTo: assignedTo || '',
            assigneeType: assigneeType,
            requestedDate: requestedDate,
            createdBy: currentUser.email,
            createdByName: currentUser.name,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP,
            activity: [{
                action: 'created',
                by: currentUser.name,
                byEmail: currentUser.email,
                timestamp: Date.now(),
                note: 'Ticket created'
            }]
        };

        await db.ref(`tickets/${ticketId}`).set(ticket);

        toast('Ticket submitted!', 'success');

        // Navigate to existing issues view for this store
        setTimeout(() => showExistingIssuesScreen(), 600);
    } catch (err) {
        console.error('Submit error:', err);
        toast('Failed to submit. Try again.', 'error');
        btn.innerHTML = 'Submit Ticket';
        btn.disabled = false;
    }
}

// ============================================================
// EXISTING ISSUES
// ============================================================
function showExistingIssuesScreen() {
    if (!selectedStore) return;
    showScreen('existingIssuesScreen');
    document.getElementById('ticketStoreName').textContent = '— ' + selectedStore.name;
    currentFilter = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
    loadTickets();
}

function loadTickets() {
    const listEl = document.getElementById('ticketsList');
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><span class="spinner spinner-dark"></span><br><br>Loading tickets...</div>';

    // Detach previous listener
    if (activeTicketListener) { activeTicketListener(); }

    // Real-time listener for this store's tickets
    const ref = db.ref('tickets').orderByChild('storeCode').equalTo(selectedStore.code);

    const handler = ref.on('value', (snap) => {
        currentTickets = [];
        snap.forEach(child => {
            currentTickets.push({ ...child.val(), _key: child.key });
        });
        // Sort newest first
        currentTickets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        renderTickets();
    });

    activeTicketListener = () => ref.off('value', handler);
}

function filterTickets(filter, chipEl) {
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    if (chipEl) chipEl.classList.add('active');
    renderTickets();
}

function renderTickets() {
    const listEl = document.getElementById('ticketsList');
    let tickets = currentTickets;

    if (currentFilter !== 'all') {
        tickets = tickets.filter(t => t.status === currentFilter);
    }

    if (tickets.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">${currentFilter === 'all' ? '📭' : '🔍'}</div>
                <h3>${currentFilter === 'all' ? 'No tickets yet' : 'No ' + currentFilter + ' tickets'}</h3>
                <p>${currentFilter === 'all' ? 'All clear at this location!' : 'Try a different filter.'}</p>
            </div>`;
        return;
    }

    listEl.innerHTML = tickets.map(t => {
        const statusLabel = {
            open: 'Open', assigned: 'Assigned', inprogress: 'In Progress',
            waiting: 'Waiting on Parts', resolved: 'Resolved', closed: 'Closed'
        }[t.status] || t.status;

        const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
        const timeAgo = getTimeAgo(t.createdAt);
        const brandLogo = t.brand && BRAND_LOGOS[t.brand] ? `<img src="${BRAND_LOGOS[t.brand]}" alt="" style="width:16px;height:16px;object-fit:contain;border-radius:3px;opacity:.7;vertical-align:middle">` : '';

        return `
        <div class="ticket-card" onclick="openTicketDetail('${t._key}')">
            <div class="ticket-card-inner">
                <div class="ticket-status-bar" style="background: var(--status-${t.status})"></div>
                <div class="ticket-body">
                    <div class="ticket-top-row">
                        <span class="ticket-id">${t.id || t._key}</span>
                        <span class="ticket-status-badge status-${t.status}">${statusLabel}</span>
                    </div>
                    <div class="ticket-title">${catIcons[t.category] || '📎'} ${escHtml(t.description.substring(0, 80))}${t.description.length > 80 ? '...' : ''}</div>
                    <div class="ticket-meta">
                        <span><span class="priority-dot ${t.priority}"></span> ${capitalize(t.priority)}</span>
                        <span>${capitalize(t.category)}${t.location ? ' · ' + capitalize(t.location) : ''}</span>
                        <span>${brandLogo} ${timeAgo}</span>
                        ${t.photos && t.photos.length ? '<span>📷 ' + t.photos.length + '</span>' : ''}
                        ${t.contactPhone ? '<span>📞</span>' : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// TICKET DETAIL MODAL
// ============================================================
function openTicketDetail(key) {
    const t = currentTickets.find(x => x._key === key);
    if (!t) return;

    document.getElementById('modalTicketId').textContent = t.id || key;

    const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
    const statusLabel = {
        open: 'Open', assigned: 'Assigned', inprogress: 'In Progress',
        waiting: 'Waiting on Parts', resolved: 'Resolved', closed: 'Closed'
    };

    const canUpdateStatus = currentUser.role === 'Admin' || currentUser.role === 'Area Coach';

    let html = `
        <div class="detail-section">
            <span class="ticket-status-badge status-${t.status}" style="font-size: 13px; padding: 5px 14px;">
                ${statusLabel[t.status] || t.status}
            </span>
            <span style="margin-left: 10px; font-size: 13px;">
                <span class="priority-dot ${t.priority}"></span> ${capitalize(t.priority)} Priority
            </span>
        </div>

        <div class="detail-section">
            <div class="detail-label">Category</div>
            <div class="detail-value">${catIcons[t.category] || ''} ${capitalize(t.category)}${t.location ? ' &middot; ' + capitalize(t.location) : ''}</div>
        </div>

        <div class="detail-section">
            <div class="detail-label">Description</div>
            <div class="detail-value">${escHtml(t.description)}</div>
        </div>

        ${t.contactName || t.contactPhone ? '<div class="detail-section"><div class="detail-label">Contact</div><div class="detail-value">' + (t.contactName ? escHtml(t.contactName) : '') + (t.contactPhone ? ' &middot; <a href="tel:' + t.contactPhone.replace(/\D/g,'') + '" style="color:var(--primary);text-decoration:none;font-weight:600">' + escHtml(t.contactPhone) + '</a>' : '') + '</div></div>' : ''}`;

    if (t.photos && t.photos.length) {
        html += `
        <div class="detail-section">
            <div class="detail-label">Photos</div>
            <div class="detail-photos">
                ${t.photos.map(url => `<img src="${url}" class="detail-photo" onclick="openLightbox('${url}')">`).join('')}
            </div>
        </div>`;
    }

    html += `
        <div class="detail-section">
            <div class="detail-label">Reported By</div>
            <div class="detail-value">${escHtml(t.createdByName || t.createdBy)} &middot; ${formatDate(t.createdAt)}</div>
        </div>`;

    // Status update for admins/coaches
    if (canUpdateStatus) {
        const statuses = ['open', 'assigned', 'inprogress', 'waiting', 'resolved', 'closed'];
        html += `
        <div class="status-update-section">
            <h4>Update Status</h4>
            <div class="status-select-grid">
                ${statuses.map(s => `
                    <button class="status-option ${t.status === s ? 'active' : ''}" onclick="updateTicketStatus('${key}', '${s}', this)">
                        ${statusLabel[s]}
                    </button>`).join('')}
            </div>
            <div style="margin-top: 8px;">
                <textarea class="form-textarea" id="statusNote" placeholder="Add a note (optional)..." style="min-height: 60px; font-size: 13px;"></textarea>
            </div>
            <div style="margin-top:8px">
                <label style="font-size:12px;color:var(--text-muted);cursor:pointer;display:inline-flex;align-items:center;gap:4px">
                    📷 <span>Attach photos</span>
                    <input type="file" id="statusPhotoInput" accept="image/*" multiple style="display:none" onchange="handleStatusPhotos(this)">
                </label>
                <div id="statusPhotoPreview" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"></div>
            </div>
            ${canUpdateStatus && t.assignedTo ? '<div style="margin-top:8px"><label class="form-label" style="font-size:12px">Reassign</label><select class="form-select" id="reassignTo" style="font-size:12px"><option value="">Keep current</option></select></div>' : ''}
            <button class="btn btn-primary btn-sm" style="margin-top: 10px;" onclick="saveStatusUpdate(\'${key}\')" id="saveStatusBtn">
                Save Update
            </button>
        </div>`;
    }

    // Activity log
    if (t.activity && t.activity.length) {
        html += `
        <div class="activity-log">
            <h4>Activity</h4>
            ${t.activity.slice().reverse().map(a => `
                <div class="activity-item">
                    <div class="activity-dot" style="background: var(--status-${a.action === 'created' ? 'open' : (a.newStatus || 'open')})"></div>
                    <div>
                        <div class="activity-text"><strong>${escHtml(a.by)}</strong> ${getActivityText(a)}</div>
                        ${a.photos && a.photos.length ? '<div style="display:flex;gap:4px;margin-top:4px">' + a.photos.map(url => '<img src="' + url + '" style="width:48px;height:48px;border-radius:6px;object-fit:cover;cursor:pointer;border:1px solid var(--border)" onclick="openLightbox(\'' + url + '\')">').join('') + '</div>' : ''}
                        <div class="activity-time">${formatDate(a.timestamp)}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
    }

    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('ticketModal').classList.add('open');
}

let pendingStatusUpdate = null;
let statusPhotos = [];

function handleStatusPhotos(input) {
    const files = Array.from(input.files).slice(0, 3 - statusPhotos.length);
    files.forEach(file => {
        if (file.size > 5*1024*1024) { toast('File too large (max 5MB)','error'); return; }
        statusPhotos.push(file);
    });
    const preview = document.getElementById('statusPhotoPreview');
    if (preview) {
        preview.innerHTML = statusPhotos.map((f,i) => `<div style="position:relative;width:48px;height:48px;border-radius:6px;overflow:hidden;border:1px solid var(--border)"><img src="${URL.createObjectURL(f)}" style="width:100%;height:100%;object-fit:cover"><button onclick="statusPhotos.splice(${i},1);handleStatusPhotos({files:[]})" style="position:absolute;top:-2px;right:-2px;background:var(--danger);color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;line-height:1">✕</button></div>`).join('');
    }
    input.value = '';
}

function updateTicketStatus(key, status, el) {
    document.querySelectorAll('.status-option').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    pendingStatusUpdate = { key, status };
}

async function saveStatusUpdate(key) {
    const t = currentTickets.find(x => x._key === key);
    if (!t) return;

    const newStatus = pendingStatusUpdate ? pendingStatusUpdate.status : t.status;
    const note = document.getElementById('statusNote')?.value?.trim() || '';

    if (newStatus === t.status && !note) {
        toast('No changes to save', 'error');
        return;
    }

    const btn = document.getElementById('saveStatusBtn');
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
        const updates = {};
        updates[`tickets/${key}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;

        if (newStatus !== t.status) {
            updates[`tickets/${key}/status`] = newStatus;
        }

        // Convert status photos to base64
        const statusPhotoUrls = [];
        for (const f of statusPhotos) {
            const dataUrl = await fileToBase64(f);
            statusPhotoUrls.push(dataUrl);
        }

        // Append activity
        const activityItem = {
            action: newStatus !== t.status ? 'status_change' : 'note',
            by: currentUser.name,
            byEmail: currentUser.email,
            timestamp: Date.now(),
            ...(newStatus !== t.status && { oldStatus: t.status, newStatus }),
            ...(note && { note }),
            ...(statusPhotoUrls.length && { photos: statusPhotoUrls })
        };

        // Get current activity array length and push
        const actSnap = await db.ref(`tickets/${key}/activity`).once('value');
        const currentActivity = actSnap.val() || [];
        currentActivity.push(activityItem);
        updates[`tickets/${key}/activity`] = currentActivity;

        await db.ref().update(updates);

        statusPhotos = [];
        toast('Ticket updated!', 'success');
        closeModal();
    } catch (err) {
        console.error('Update error:', err);
        toast('Update failed', 'error');
    } finally {
        btn.innerHTML = 'Save Update';
        btn.disabled = false;
    }
}

function closeModal() {
    document.getElementById('ticketModal').classList.remove('open');
    pendingStatusUpdate = null;
}

// ============================================================
// LIGHTBOX
// ============================================================
function openLightbox(url) {
    event.stopPropagation();
    document.getElementById('lightboxImg').src = url;
    document.getElementById('lightbox').classList.add('open');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
}

// ============================================================
// UTILITIES
// ============================================================
function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => el.className = 'toast', duration);
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
const esc = escHtml;

function normalizeRole(r) {
    if (!r) return 'Manager';
    const lower = r.toLowerCase();
    if (lower === 'admin') return 'Admin';
    if (lower === 'areacoach' || lower === 'area coach') return 'Area Coach';
    return 'Manager';
}

function goHome() {
    showScreen('storeSelection');
    document.getElementById('storeType').value = '';
    document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('storeSelect').innerHTML = '<option value="">Choose store...</option>';
    document.getElementById('actionButtons').classList.add('hidden');
    document.getElementById('mapOverview').classList.add('hidden');
    selectedStore = null;
    if (activeTicketListener) { activeTicketListener(); activeTicketListener = null; }
}

// ============================================================
// DARK MODE
// ============================================================
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
let currentTileLayer = null;

function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        document.getElementById('themeToggle').textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.getElementById('themeToggle').textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
    // Swap map tiles if map is active
    if (overviewMap && currentTileLayer) {
        overviewMap.removeLayer(currentTileLayer);
        currentTileLayer = L.tileLayer(isDark ? LIGHT_TILES : DARK_TILES, {
            attribution: '© CartoDB',
            maxZoom: 18
        }).addTo(overviewMap);
    }
}

// Restore saved theme on load
(function() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        setTimeout(() => {
            const btn = document.getElementById('themeToggle');
            if (btn) btn.textContent = '☀️';
        }, 0);
    }
})();

// ============================================================
// LANGUAGE / i18n
// ============================================================
let currentLang = localStorage.getItem('lang') || 'en';

const TRANSLATIONS = {
    es: {
        // Store selection
        select_store: 'Selecciona Tu Tienda',
        select_store_sub: 'Elige una ubicación para reportar o ver problemas',
        store_type: 'Tipo de Tienda',
        location_label: 'Ubicación',
        // Form
        report_new: 'Reportar Nuevo Problema',
        form_category: 'Categoría',
        form_location: 'Ubicación',
        form_name: 'Tu Nombre',
        form_phone: 'Tu Teléfono de Contacto',
        form_priority: 'Prioridad',
        form_description: 'Descripción',
        form_photos: 'Fotos',
        form_photos_hint: '(requerida, al menos 1, máximo 3)',
        // Categories
        cat_plumbing: 'Plomería',
        cat_equipment: 'Equipo',
        cat_it: 'IT',
        cat_structural: 'Estructural',
        cat_safety: 'Seguridad',
        cat_other: 'Otro',
        // Location
        loc_interior: 'Interior',
        loc_exterior: 'Exterior',
        // Priority
        p_routine: 'Rutina',
        p_routine_desc: 'Hasta 1 semana',
        p_urgent: 'Urgente',
        p_urgent_desc: 'Dentro de 72 horas',
        p_emergency: 'Emergencia',
        p_emergency_desc: 'Dentro de 24 horas',
        // Actions
        report_issue: 'Reportar Nuevo Problema',
        view_tickets: 'Ver Tickets Existentes',
        back_store: '← Volver a la tienda',
        sign_out: 'Cerrar Sesión',
        tap_photos: 'Toca para añadir fotos',
        photo_hint: 'JPG o PNG, máximo 5MB cada una',
        notifications: 'Notificaciones',
        all_locations: 'Todas las Ubicaciones',
    }
};

function toggleLang() {
    currentLang = currentLang === 'en' ? 'es' : 'en';
    localStorage.setItem('lang', currentLang);
    applyLang();
}

function applyLang() {
    const btn = document.getElementById('langToggle');
    if (btn) btn.textContent = currentLang === 'en' ? 'EN' : 'ES';

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (currentLang === 'es' && TRANSLATIONS.es[key]) {
            if (!el.getAttribute('data-orig')) {
                el.setAttribute('data-orig', el.textContent);
            }
            el.textContent = TRANSLATIONS.es[key];
        } else if (currentLang === 'en' && el.getAttribute('data-orig')) {
            el.textContent = el.getAttribute('data-orig');
        }
    });

    // Update placeholders
    const nameInput = document.getElementById('contactName');
    if (nameInput) nameInput.placeholder = currentLang === 'es' ? 'Nombre de la persona reportando' : 'Name of person reporting issue';
    const phoneInput = document.getElementById('contactPhone');
    if (phoneInput) phoneInput.placeholder = currentLang === 'es' ? '555-123-4567' : '555-123-4567';
    const descInput = document.getElementById('issueDescription');
    if (descInput) descInput.placeholder = currentLang === 'es'
        ? 'Describe el problema en detalle. ¿Qué está roto? ¿Dónde exactamente? ¿Cuándo empezó?'
        : "Describe the issue in detail. What's broken? Where exactly? When did it start?";

    // Submit button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn && !submitBtn.disabled) {
        submitBtn.textContent = currentLang === 'es' ? 'Enviar Ticket' : 'Submit Ticket';
    }

    // Store select placeholder
    const storeSel = document.getElementById('storeSelect');
    if (storeSel && storeSel.options[0]) {
        storeSel.options[0].textContent = currentLang === 'es' ? 'Elige tienda...' : 'Choose store...';
    }
    const typeSel = document.getElementById('storeType');
    if (typeSel && typeSel.options[0]) {
        typeSel.options[0].textContent = currentLang === 'es' ? 'Elige tipo...' : 'Choose type...';
    }
}

// Apply saved language on load
(function() {
    setTimeout(applyLang, 100);
})();

function getCategoryEmoji(cat) {
    const map = {plumbing:'🚿',equipment:'⚙️',it:'💻',structural:'🧱',safety:'🛡️',other:'📎'};
    return map[cat] || '📎';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type + ' show';
    setTimeout(() => t.className = 'toast', 3000);
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function getTimeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return formatDate(ts);
}

function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getActivityText(a) {
    if (a.action === 'created') return 'created this ticket';
    if (a.action === 'status_change') {
        const labels = { open:'Open', assigned:'Assigned', inprogress:'In Progress', waiting:'Waiting on Parts', resolved:'Resolved', closed:'Closed' };
        let text = `changed status to <strong>${labels[a.newStatus] || a.newStatus}</strong>`;
        if (a.note) text += ` — "${escHtml(a.note)}"`;
        return text;
    }
    if (a.action === 'note') return `added a note: "${escHtml(a.note)}"`;
    return a.action;
}

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeLightbox();
        closeModal();
    }
});
