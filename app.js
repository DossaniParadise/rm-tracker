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

const STATUS_ORDER = ['unassigned', 'assigned', 'waiting', 'inprogress', 'resolved', 'closed'];
const PRIORITY_ORDER = { emergency: 0, urgent: 1, routine: 2 };
const WAITING_REASONS = {
    parts: 'Waiting on Parts',
    vendor: 'Waiting on Vendor',
    approval: 'Waiting on Approval',
    other: 'Waiting on Other'
};

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
                    title: preData.title || preData.role,
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

        const directoryProfile = getDirectoryProfileByEmail(user.email);
        const effectiveRoleRaw = (directoryProfile && directoryProfile.role) ? directoryProfile.role : data.role;
        const effectiveStores = (directoryProfile && directoryProfile.stores) ? directoryProfile.stores : (data.stores || []);
        const fallbackTitle = getDirectoryTitleByEmail(user.email, '');
        currentUser = {
            uid: user.uid,
            email: user.email,
            name: data.name || (directoryProfile && directoryProfile.name) || user.email.split('@')[0],
            role: normalizeRole(effectiveRoleRaw),
            stores: effectiveStores,
            title: data.title || fallbackTitle || effectiveRoleRaw || normalizeRole(effectiveRoleRaw)
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

function getViewportHints() {
    const width = window.innerWidth || document.documentElement.clientWidth || 0;
    const height = window.innerHeight || document.documentElement.clientHeight || 0;
    const touchCapable = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    return {
        width,
        height,
        touchCapable,
        isMobile: width <= 767,
        isTablet: width >= 768 && width <= 1099,
        isDesktop: width >= 1100
    };
}

function isAdminDesktopExperience() {
    if (!currentUser) return false;
    const profile = getExperienceProfile(currentUser.role);
    return profile === 'admin-desktop' || profile === 'director-desktop';
}

function applyExperienceClass(role, viewport = getViewportHints()) {
    const profile = getExperienceProfile(role, viewport);
    const expClass = `exp-${profile}`;
    document.body.classList.forEach(c => {
        if (c.startsWith('exp-')) document.body.classList.remove(c);
    });
    document.body.classList.add(expClass);
    return expClass;
}

function getExperienceProfile(role, viewport = getViewportHints()) {
    const normalizedRole = normalizeRole(role || 'Manager').toLowerCase();
    let device = 'desktop';

    if (viewport.isMobile) {
        device = 'mobile';
    } else if (viewport.isTablet || (viewport.touchCapable && viewport.width < 1200)) {
        device = 'tablet';
    }

    const rolePrefix = normalizedRole === 'area coach' ? 'manager' : normalizedRole;
    return `${rolePrefix}-${device}`;
}

function routeToProfileLanding() {
    const role = currentUser.role;

    // TECHNICIAN: job dashboard with clock in/out
    if (role === 'Technician') {
        showScreen('techDashboard');
        initTechDashboard();
        return;
    }

    // MANAGER: clean 2-button landing
    if (role === 'Manager') {
        if (currentUser.stores && !Array.isArray(currentUser.stores)) {
            const store = stores.find(s => s.code === currentUser.stores);
            if (store) {
                selectedStore = store;
                document.getElementById('mgrStoreName').textContent = store.name;
            }
        }
        showScreen('managerLanding');
        return;
    }

    // AREA COACH: store grid + view all tickets
    if (role === 'Area Coach') {
        showScreen('coachLanding');
        initCoachLanding();
        return;
    }

    // DIRECTOR / ADMIN: summary cards + map (mobile portrait defaults to list flow)
    showScreen('storeSelection');
    loadAdminSummary();
    if (window.innerWidth >= 1100 || window.innerWidth > window.innerHeight) {
        setTimeout(() => selectBrand('all'), 100);
    }
}

function initCoachLanding() {
    const myStores = getAccessibleStores();
    const grid = document.getElementById('coachStoreGrid');
    // Fetch ticket counts for coach stores
    const codes = myStores.map(s => s.code);
    fetchTicketCounts(codes, () => {
        const brandLabels = { fastfood: 'Burger King', cstore: 'C-Store', carwash: 'Car Wash' };
        grid.innerHTML = myStores
            .sort((a, b) => {
                const ca = (allTicketCounts[a.code] || {}).open || 0;
                const cb = (allTicketCounts[b.code] || {}).open || 0;
                return cb - ca || a.name.localeCompare(b.name);
            })
            .map(s => {
                const tc = allTicketCounts[s.code] || { open: 0 };
                const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
                const hasIssues = tc.open > 0;
                return '<div class="coach-store-btn" onclick="coachSelectStore(\'' + s.id + '\')">' +
                    '<div class="csb-name">' + escHtml(shortName) + '</div>' +
                    '<div class="csb-brand">' + (brandLabels[s.type] || s.type) + '</div>' +
                    (hasIssues
                        ? '<div class="csb-tickets has-issues">' + tc.open + ' unassigned</div>'
                        : '<div class="csb-tickets no-issues">✓ No issues</div>') +
                '</div>';
            }).join('');
        applyLang();
    });
}

function coachSelectStore(storeId) {
    const store = stores.find(s => s.id === storeId);
    if (!store) return;
    selectedStore = store;
    document.getElementById('coachSelectedStoreName').textContent = store.name;
    showScreen('coachStoreView');
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    const experienceProfile = getExperienceProfile(currentUser.role);
    applyExperienceClass(currentUser.role);

    // Populate header
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('userAvatar').textContent = initials || '?';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = getRoleTitle(currentUser);

    // Toggle top-right privileged buttons for this user
    document.getElementById('adminBtn').classList.toggle('hidden', !canAccessAdminPanel(currentUser));
    document.getElementById('vendorBtn').classList.toggle('hidden', !canManageVendors(currentUser));
    document.getElementById('viewAsBtn').classList.toggle('hidden', !isItsupportUser(currentUser));
    if (canAccessAdminPanel(currentUser)) watchPendingUsers();

    // Show "All Locations" pill for admins
    if (currentUser.role === 'Admin' || currentUser.role === 'Director' || currentUser.role === 'Technician' || currentUser.stores === 'all') {
        document.getElementById('brandPill-all').classList.remove('hidden');
        document.querySelectorAll('.admin-only-opt').forEach(el => el.classList.remove('hidden'));
    }

    // Load notification routing config
    db.ref('config/notifyRouting').once('value', snap => {
        notifyRouting = snap.val() || {};
        initNotificationCenter();
    });

    // Manager/Coach store selection handled by routeToProfileLanding

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

    routeToProfileLanding();
}

function showError(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 8000);
}

function showScreen(screenId) {
    ['managerLanding', 'coachLanding', 'coachStoreView', 'techDashboard', 'adminSummary', 'storeSelection', 'newIssueScreen', 'existingIssuesScreen', 'allTicketsScreen', 'adminScreen'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', id !== screenId);
    });
    // Admin summary shows alongside storeSelection for admins
    if (screenId === 'storeSelection' && currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Director')) {
        document.getElementById('adminSummary').classList.remove('hidden');
    }
}

function goBack() {
    resetNewIssueForm();
    if (activeTicketListener) { activeTicketListener(); activeTicketListener = null; }
    if (currentUser.role === 'Technician') { showScreen('techDashboard'); loadTechJobs(); return; }
    if (currentUser.role === 'Manager') { showScreen('managerLanding'); return; }
    if (currentUser.role === 'Area Coach') {
        // If we came from a specific store, go back to coach store view
        if (selectedStore) { showScreen('coachStoreView'); return; }
        showScreen('coachLanding'); initCoachLanding(); return;
    }
    showScreen('storeSelection');
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
    if (currentUser.role === 'Technician' && currentUser.stores === 'all') {
        // Tech zone filtering
        const ti = TECH_INFO.find(t => t.email === currentUser.email);
        if (ti && ti.zone === 'west') filtered = filtered.filter(s => !RAVAY_ONLY_STORES.includes(s.code));
        else if (ti && ti.zone === 'east') filtered = filtered.filter(s => RAVAY_ONLY_STORES.includes(s.code));
    } else if (currentUser.role !== 'Admin' && currentUser.role !== 'Director' && currentUser.stores !== 'all') {
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
    return currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Director' || currentUser.role === 'Area Coach' || currentUser.role === 'Technician');
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
        if (currentUser.role === 'Technician' && currentUser.stores === 'all') {
            const ti = TECH_INFO.find(t => t.email === currentUser.email);
            if (ti && ti.zone === 'west') allStores = allStores.filter(s => !RAVAY_ONLY_STORES.includes(s.code));
            else if (ti && ti.zone === 'east') allStores = allStores.filter(s => RAVAY_ONLY_STORES.includes(s.code));
        } else if (currentUser.role !== 'Admin' && currentUser.role !== 'Director' && currentUser.stores !== 'all') {
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
    if (currentUser.role === 'Technician' && currentUser.stores === 'all') {
        const ti = TECH_INFO.find(t => t.email === currentUser.email);
        if (ti && ti.zone === 'west') filtered = filtered.filter(s => !RAVAY_ONLY_STORES.includes(s.code));
        else if (ti && ti.zone === 'east') filtered = filtered.filter(s => RAVAY_ONLY_STORES.includes(s.code));
    } else if (currentUser.role !== 'Admin' && currentUser.role !== 'Director' && currentUser.stores !== 'all') {
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
                    <div class="mp-stat"><strong style="color:${counts.open > 0 ? '#f87171' : '#34d399'}">${counts.open}</strong>unassigned</div>
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
            '<div class="mstat" style="cursor:pointer" onclick="showAllTickets(\'unassigned\')"><strong style="color:' + (totalOpen > 0 ? '#dc2626' : '#059669') + '">' + totalOpen + '</strong>unassigned tickets</div>' +
            '<div class="mstat" style="cursor:pointer" onclick="showAllTickets(\'unassigned\')"><strong>' + storesWithIssues + '</strong>need assignment</div>' +
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
        const scopedTickets = [];
        codes.forEach(c => allTicketCounts[c] = { open: 0, total: 0, score: 0, hasEmergency: false });
        snap.forEach(child => {
            const t = { _key: child.key, ...child.val() };
            if (codes.includes(t.storeCode)) {
                scopedTickets.push(t);
                if (!allTicketCounts[t.storeCode]) allTicketCounts[t.storeCode] = { open: 0, total: 0, score: 0, hasEmergency: false };
                allTicketCounts[t.storeCode].total++;
                if (isActiveTicketStatus(t.status)) {
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
        html += '<div style="padding:12px;text-align:center;font-size:13px;color:var(--text-muted)">🎉 No unassigned issues!</div>';
    } else {
        displayList.forEach(s => {
            const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
            const badgeCls = s.counts.open > 0 ? 'has-issues' : 'no-issues';
            const isSelected = selectedStore && selectedStore.code === s.code;
            html += `<div class="store-list-item ${isSelected ? 'active' : ''}" onclick="desktopSelectStore('${s.id}')">
                <span class="sli-name">${shortName}</span>
                <span class="sli-badge ${badgeCls}">${s.counts.open} unassigned</span>
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
        if (legend) { legend.style.visibility = 'hidden'; legend.style.pointerEvents = 'none'; }
        renderStoreListView();
    } else {
        mapEl.style.display = '';
        listEl.style.display = 'none';
        if (legend) { legend.style.visibility = ''; legend.style.pointerEvents = ''; }
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
        
        const statusLabel = { unassigned:'Unassigned', assigned:'Assigned', inprogress:'In Progress', waiting:'Waiting', resolved:'Resolved', closed:'Closed' };
        
        // Only show stores that have unassigned tickets
        const storesWithTickets = lastFilteredStores.filter(s => {
            return allT.some(t => t.storeCode === s.code && t.status !== 'closed' && t.status !== 'resolved');
        });

        if (storesWithTickets.length === 0) {
            listEl.innerHTML = '<div style="padding:40px;text-align:center;font-size:15px;color:var(--text-muted)">🎉 No unassigned tickets across these stores!</div>';
            return;
        }
        
        let html = '';
        storesWithTickets.forEach(s => {
            const storeTickets = allT.filter(t => t.storeCode === s.code && t.status !== 'closed' && t.status !== 'resolved');
            const shortName = s.name.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
            storeTickets.sort((a,b) => { const p = {emergency:0,urgent:1,routine:2}; return (p[a.priority]||2) - (p[b.priority]||2); });
            
            html += `<div class="slv-store">
                <div class="slv-store-name">${shortName} <span style="font-size:12px;font-weight:400;color:var(--text-muted)">(${storeTickets.length} unassigned)</span></div>`;
            storeTickets.forEach(t => {
                const assignee = t.assignedTo ? t.assignedTo : '';
                const prBadge = {routine:'<span class="priority-word p-routine">Routine</span>',urgent:'<span class="priority-word p-urgent">Urgent</span>',emergency:'<span class="priority-word p-emergency">Emergency</span>'}[t.priority] || '';
                html += `<div class="slv-ticket" onclick="listViewOpenTicket('${t._key}')">
                    ${prBadge}
                    <span class="slv-desc">${escHtml(t.description || '').substring(0,80)}</span>
                    <span class="ticket-status-badge status-${normalizeTicketStatus(t.status)}" style="font-size:11px;padding:2px 8px">${statusLabel[normalizeTicketStatus(t.status)] || t.status}</span>
                    ${assignee ? '<span class="slv-assignee">' + escHtml(assignee) + '</span>' : ''}
                    ${renderInlineAssignControls(t, 'slv')}
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
    if (currentUser) applyExperienceClass(currentUser.role);
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
    if (!canAccessAdminPanel()) { showToast('Only IT Support can access user controls', 'error'); return; }
    showScreen('adminScreen');
    renderPendingUsers();
    loadActiveUsers();
    loadNotifyRouting();
    renderAddUserForm();
}

function goBackFromAdmin() {
    routeToProfileLanding();
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
                    <option value="Director" ${guessedRole === 'Director' ? 'selected' : ''}>Director</option>
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
            const roleClass = u.role === 'Admin' ? 'admin' : u.role === 'Director' ? 'director' : u.role === 'Area Coach' ? 'areacoach' : u.role === 'Technician' ? 'technician' : 'manager';
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
                    <option value="Director" ${u.role === 'Director' ? 'selected' : ''}>Director</option>
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
    renderVendorManagerRows();
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
    const cats = ['all','plumbing','equipment','it','structural','safety','other'];
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

function showVendorManager() {
    if (!canManageVendors()) { showToast('Only admin/director/IT support can manage vendors', 'error'); return; }
    document.getElementById('vendorManagerModal')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'admin-modal';
    overlay.id = 'vendorManagerModal';
    overlay.style.zIndex = '220';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<div class="modal-card" style="max-width:760px">
        <h3>🏢 Approved Vendors</h3>
        <p style="font-size:13px;color:var(--text-mid);margin-bottom:10px">Add or remove vendors used in assignment dropdowns.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
            <input class="form-input" id="vmName" placeholder="Vendor name">
            <input class="form-input" id="vmAreas" placeholder="Areas served (optional)">
        </div>
        <div id="vmCats" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px">
            <button class="btn btn-primary" onclick="addVendorFromManager()">Add Vendor</button>
        </div>
        <div id="vmRows" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px"></div>
        <div class="modal-actions" style="margin-top:10px">
            <button class="btn btn-secondary" onclick="document.getElementById('vendorManagerModal')?.remove()">Close</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    renderVendorManagerCatCheckboxes();
    renderVendorManagerRows();
}

function renderVendorManagerCatCheckboxes() {
    const container = document.getElementById('vmCats');
    if (!container) return;
    const cats = ['all','plumbing','equipment','it','structural','safety','other'];
    container.innerHTML = cats.map(c => `<label class="store-cb" style="border:1px solid var(--border);border-radius:6px;padding:2px 6px"><input type="checkbox" class="vm-cat-cb" value="${c}"> ${capitalize(c)}</label>`).join('');
}

function renderVendorManagerRows() {
    const container = document.getElementById('vmRows');
    if (!container) return;
    if (!vendorList.length) {
        container.innerHTML = '<div class="empty-state" style="font-size:13px">No approved vendors yet</div>';
        return;
    }
    container.innerHTML = vendorList.map(v => `<div class="vendor-row">
        <span class="vendor-name">${escHtml(v.name)}</span>
        <span class="vendor-meta">${escHtml(v.areas || '')}${(v.categories || []).length ? ' · ' + (v.categories || []).map(capitalize).join(', ') : ''}</span>
        <button class="btn btn-ghost" style="font-size:11px;color:var(--danger)" onclick="removeVendorFromManager('${v.id}')">Delete</button>
    </div>`).join('');
}

async function addVendorFromManager() {
    const name = (document.getElementById('vmName')?.value || '').trim();
    const areas = (document.getElementById('vmAreas')?.value || '').trim();
    const cats = [...document.querySelectorAll('.vm-cat-cb:checked')].map(c => c.value);
    if (!name) { showToast('Enter vendor name', 'error'); return; }
    const canEdit = await checkVendorEditPermission();
    if (!canEdit) { showToast('No permission', 'error'); return; }
    try {
        await db.ref('config/vendors').push({ name, areas, categories: cats });
        showToast('Vendor added', 'success');
        document.getElementById('vmName').value = '';
        document.getElementById('vmAreas').value = '';
        document.querySelectorAll('.vm-cat-cb').forEach(c => c.checked = false);
        await loadVendors();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function removeVendorFromManager(id) {
    if (!confirm('Delete this vendor from approved list?')) return;
    await removeVendor(id);
}

async function checkVendorEditPermission() {
    if (canManageVendors(currentUser)) return true;
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

    if (canManageVendors()) {
        sel.innerHTML += '<optgroup label="Vendor Tools"><option value="__edit_vendors__" class="vendor-manage-option">🛠 Edit Vendors</option></optgroup>';
    }
    sel.onchange = () => handleVendorManagerSelection(sel);
}

function getAssignmentOptionsHtml(storeCode) {
    const availTechs = getAvailableTechs(storeCode || '');
    let html = '<option value="">Assign to...</option>';

    if (availTechs.length) {
        html += '<optgroup label="Repair Technicians">';
        availTechs.forEach(t => {
            html += `<option value="tech:${t.email}">🔧 ${escHtml(t.name)}</option>`;
        });
        html += '</optgroup>';
    }

    if (vendorList.length) {
        html += '<optgroup label="Approved Vendors">';
        vendorList.forEach(v => {
            html += `<option value="vendor:${escHtml(v.name)}">🏢 ${escHtml(v.name)}</option>`;
        });
        html += '</optgroup>';
    }

    if (canManageVendors()) {
        html += '<optgroup label="Vendor Tools"><option value="__edit_vendors__" class="vendor-manage-option">🛠 Edit Vendors</option></optgroup>';
    }

    return html;
}

function handleVendorManagerSelection(selectEl) {
    if (!selectEl || selectEl.value !== '__edit_vendors__') return false;
    if (!canManageVendors()) {
        toast('Only admin/director/IT support can manage vendors', 'error');
        selectEl.value = '';
        return true;
    }
    showVendorManager();
    setTimeout(() => { selectEl.value = ''; }, 0);
    return true;
}

function renderInlineAssignControls(ticket, contextPrefix = 'inline') {
    if (!canAssignTickets()) return '';
    const status = normalizeTicketStatus(ticket.status);
    if (status === 'closed') return '';

    const safeKey = String(ticket._key || ticket.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const selectId = `${contextPrefix}Assign_${safeKey}`;
    const actionLabel = status === 'unassigned' ? 'Assign' : 'Reassign';

    const ticketKey = ticket._key || ticket.id || '';
    return `<div class="inline-assign-row" onclick="event.stopPropagation()">
        <select class="form-select inline-assign-select" id="${selectId}">${getAssignmentOptionsHtml(ticket.storeCode)}</select>
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();quickAssignTicket('${ticketKey}', '${selectId}')">${actionLabel}</button>
    </div>`;
}

// ------------------------------------------------------------
// Assignment reminder + email helper (for parties outside app)
// ------------------------------------------------------------
function buildAssignEmailDraft(ticket, partyLabel) {
    const lines = [
        `Hello ${partyLabel},`,
        '',
        `Please find details below for a job we need done at ${ticket.storeName || ticket.storeCode || 'the location'}.`,
        '',
        'Details from ticket below:',
        `- Ticket ID: ${ticket.id || ticket._key || ''}`,
        `- Location: ${ticket.storeName || ticket.storeCode || ''}`,
        `- Status: ${getStatusLabel(ticket.status)}`,
        `- Priority: ${capitalize(ticket.priority || 'routine')}`,
        `- Category: ${capitalize(ticket.category || '')}${ticket.location ? ' / ' + capitalize(ticket.location) : ''}`,
        `- Description: ${ticket.description || ''}`,
        ticket.contactName ? `- Contact: ${ticket.contactName}${ticket.contactPhone ? ' (' + ticket.contactPhone + ')' : ''}` : '',
        '',
        'Attach picture below:',
        ...(Array.isArray(ticket.photos) && ticket.photos.length
            ? ticket.photos.map((url, i) => `- Photo ${i + 1}: ${url}`)
            : ['- No photo attached in ticket']),
        '',
        'Thank you.'
    ].filter(Boolean);

    return lines.join('\n');
}

function openAssignEmailComposer(ticket, partyLabel) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    const draft = buildAssignEmailDraft(ticket, partyLabel);
    overlay.innerHTML = `<div class="confirm-box" style="max-width:700px;width:min(92vw,700px)">
        <h4>✉️ Email Draft</h4>
        <p style="text-align:left">You can edit this text before copying into your email.</p>
        <textarea id="assignEmailDraft" class="form-textarea" style="min-height:280px">${escHtml(draft)}</textarea>
        <div class="confirm-btns" style="margin-top:10px">
            <button class="btn btn-secondary" id="assignEmailClose">Close</button>
            <button class="btn btn-primary" id="assignEmailCopy">Copy</button>
        </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#assignEmailClose').onclick = () => overlay.remove();
    overlay.querySelector('#assignEmailCopy').onclick = async () => {
        const txt = overlay.querySelector('#assignEmailDraft').value;
        try {
            await navigator.clipboard.writeText(txt);
            toast('Email draft copied', 'success');
        } catch {
            toast('Could not copy automatically. Please copy manually.', 'error');
        }
    };
}

function showAssignReminder(ticket, partyLabel) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-box" style="max-width:520px">
            <h4>📣 Assignment sent</h4>
            <p>Don’t forget to let <strong>${escHtml(partyLabel)}</strong> know about this job — they don’t have access to this site.</p>
            <div class="confirm-btns">
                <button class="btn btn-secondary" id="assignCancel">Cancel</button>
                <button class="btn btn-primary" id="assignOkay">Okay</button>
                <button class="btn btn-accent" id="assignEmail">Write me an email</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('#assignCancel').onclick = () => { overlay.remove(); resolve('cancel'); };
        overlay.querySelector('#assignOkay').onclick = () => { overlay.remove(); resolve('okay'); };
        overlay.querySelector('#assignEmail').onclick = () => {
            overlay.remove();
            openAssignEmailComposer(ticket, partyLabel);
            resolve('email');
        };
    });
}

async function quickAssignTicket(ticketKey, selectId) {
    if (!ticketKey) { toast('Ticket key is missing. Please refresh and try again.', 'error'); return; }
    const select = document.getElementById(selectId);
    if (!select) return;
    const value = select.value;

    if (handleVendorManagerSelection(select)) return;
    if (!value) { toast('Select a technician or vendor', 'error'); return; }
    if (!canAssignTickets()) { toast('You do not have assignment permissions', 'error'); return; }

    const parsed = parseAssignmentValue(value);
    if (!parsed.assignedTo) { toast('Invalid assignee', 'error'); return; }

    try {
        const ticketSnap = await db.ref(`tickets/${ticketKey}`).once('value');
        const ticket = ticketSnap.val();
        if (!ticket) { toast('Ticket not found. Please refresh.', 'error'); return; }

        const updates = {
            [`tickets/${ticketKey}/assignedTo`]: parsed.assignedTo,
            [`tickets/${ticketKey}/assigneeType`]: parsed.assigneeType,
            [`tickets/${ticketKey}/status`]: 'assigned',
            [`tickets/${ticketKey}/updatedAt`]: firebase.database.ServerValue.TIMESTAMP
        };

        const actSnap = await db.ref(`tickets/${ticketKey}/activity`).once('value');
        const activity = actSnap.val() || [];
        activity.push({
            action: 'assignment_change',
            by: currentUser.name,
            byEmail: currentUser.email,
            timestamp: Date.now(),
            assignedTo: parsed.assignedTo,
            assigneeType: parsed.assigneeType,
            note: 'Assigned from unassigned queue'
        });
        updates[`tickets/${ticketKey}/activity`] = activity;

        await db.ref().update(updates);
        toast('Ticket assigned', 'success');
        showAssignReminder({ ...ticket, _key: ticketKey, status: 'assigned' }, parsed.assignedTo);

        if (!document.getElementById('allTicketsScreen').classList.contains('hidden')) filterAllTickets();
        if (currentMapView === 'list') renderStoreListView();
        loadAdminSummary();
    } catch (err) {
        console.error('Quick assign failed', err);
        toast('Assignment failed', 'error');
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
// TECHNICIAN DASHBOARD
// ============================================================
let techJobs = [];
let techFilter = 'active'; // 'active' | 'all' | 'completed'
let activeClockIn = null; // { ticketKey, ticketId, storeName, startTime }
let clockTimerInterval = null;
let clockOutPhotos = [];
let clockOutStatus = 'inprogress';

function initTechDashboard() {
    // Check for active clock-in from Firebase
    db.ref('timeEntries').orderByChild('techEmail').equalTo(currentUser.email).once('value', snap => {
        const entries = snap.val() || {};
        // Find any entry that has no endTime (still clocked in)
        for (const [key, entry] of Object.entries(entries)) {
            if (!entry.endTime) {
                activeClockIn = {
                    entryKey: key,
                    ticketKey: entry.ticketKey,
                    ticketId: entry.ticketId,
                    storeName: entry.storeName,
                    startTime: entry.startTime,
                    modeStatus: entry.modeStatus || 'assigned',
                    emergency: !!entry.emergency
                };
                showClockBanner();
                break;
            }
        }
        loadTechJobs();
    });
}

function loadTechJobs() {
    db.ref('tickets').once('value', snap => {
        const allTickets = [];
        snap.forEach(child => { allTickets.push({ _key: child.key, ...child.val() }); });
        
        // Get stores this tech has access to
        const techStores = currentUser.stores === 'all' ? stores.map(s => s.code) :
            (Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores]);
        
        // Filter: only tickets explicitly assigned to this tech
        techJobs = allTickets.filter(t => {
            if (!techStores.includes(t.storeCode)) return false;
            return t.assignedTo === currentUser.email;
        });
        
        renderTechDashboard();
    });
}

function getExecutionModeState(status = 'inprogress') {
    if (status === 'assigned' || status === 'unassigned' || status === 'open') return { key: 'travel', label: '🚗 Start Travel', nextStatus: 'inprogress', note: 'Travel started to site' };
    if (status === 'inprogress') return { key: 'arrived', label: '📍 Arrived', nextStatus: 'inprogress', note: 'Arrived onsite and began diagnosis' };
    if (status === 'waiting') return { key: 'waiting', label: '📦 Waiting Parts', nextStatus: 'waiting', note: 'Waiting on parts / vendor support' };
    return { key: 'complete', label: '✅ Complete', nextStatus: 'resolved', note: 'Work completed, ready to close out' };
}

function getTicketByKey(key) {
    return techJobs.find(x => x._key === key) || currentTickets.find(x => x._key === key);
}

function renderTechDetailPane(key) {
    const pane = document.getElementById('techDetailPane');
    if (!pane) return;
    const t = getTicketByKey(key || (activeClockIn && activeClockIn.ticketKey));
    if (!t) {
        pane.innerHTML = '<div class="tech-detail-empty">Select a job to view full details.</div>';
        return;
    }
    const statusLabel = { unassigned:'Unassigned', assigned:'Assigned', inprogress:'In Progress', waiting:'Waiting', resolved:'Resolved', closed:'Closed' };
    const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
    const notes = [
        'On site — troubleshooting now',
        'Part ordered — ETA pending',
        'Temporary fix in place',
        'Need manager follow-up'
    ];
    pane.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px">
            <div>
                <div style="font-weight:700">${escHtml(t.id || t._key)}</div>
                <div style="font-size:12px;color:var(--text-muted)">${escHtml((stores.find(s => s.code === t.storeCode) || {}).name || t.storeCode || '')}</div>
            </div>
            <span class="ticket-status-badge status-${normalizeTicketStatus(t.status)}" style="font-size:11px">${statusLabel[normalizeTicketStatus(t.status)] || t.status}</span>
        </div>
        <div style="font-size:13px;line-height:1.4;margin-bottom:8px">${catIcons[t.category] || '📎'} ${escHtml(t.description || '')}</div>
        <div class="tjc-fast-actions" style="margin-bottom:10px">
            ${notes.map(n => `<button class="quick-chip" onclick="prefillTechNote('${escHtml(n)}')">${escHtml(n)}</button>`).join('')}
        </div>
        <textarea class="form-textarea" id="techQuickNote" placeholder="Quick update note" style="min-height:78px;font-size:13px"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-sm" style="background:var(--primary);color:#fff;border:none" onclick="saveTechQuickUpdate('${t._key}', 'inprogress')">Save Update</button>
            <button class="btn-view-ticket" onclick="openTicketDetail('${t._key}', true)">Open Full Details</button>
        </div>`;
}

function prefillTechNote(text) {
    const el = document.getElementById('techQuickNote');
    if (el) el.value = text;
}

async function saveTechQuickUpdate(key, fallbackStatus) {
    const t = getTicketByKey(key);
    if (!t) return;
    const note = document.getElementById('techQuickNote')?.value?.trim();
    if (!note) { toast('Add a quick note first.', 'error'); return; }
    const status = (activeClockIn && activeClockIn.ticketKey === key && activeClockIn.modeStatus) || t.status || fallbackStatus;
    const activity = { action: 'note', by: currentUser.name, byEmail: currentUser.email, timestamp: Date.now(), newStatus: status, note };
    await db.ref('tickets/' + key + '/activity').push(activity);
    toast('Update saved', 'success');
    renderTechDetailPane(key);
}

function renderTechDashboard() {
    const active = techJobs.filter(t => t.status !== 'closed' && t.status !== 'resolved');
    const urgent = active.filter(t => t.priority === 'emergency' || t.priority === 'urgent');
    const waiting = active.filter(t => t.status === 'waiting');
    const completed = techJobs.filter(t => t.status === 'resolved' || t.status === 'closed');

    document.getElementById('techStats').innerHTML = `
        <div class="tech-stat-card" onclick="filterTechJobs('active',null)">
            <div class="tsc-num" style="color:#d97706">${active.length}</div>
            <div class="tsc-label" data-i18n="tech_active">Active Jobs</div>
        </div>
        <div class="tech-stat-card">
            <div class="tsc-num" style="color:#dc2626">${urgent.length}</div>
            <div class="tsc-label" data-i18n="tech_urgent">Urgent</div>
        </div>
        <div class="tech-stat-card">
            <div class="tsc-num" style="color:#ea580c">${waiting.length}</div>
            <div class="tsc-label" data-i18n="tech_waiting">Waiting</div>
        </div>
        <div class="tech-stat-card" onclick="filterTechJobs('completed',null)">
            <div class="tsc-num" style="color:#059669">${completed.length}</div>
            <div class="tsc-label" data-i18n="tech_completed">Completed</div>
        </div>`;

    let displayJobs = techFilter === 'completed'
        ? techJobs.filter(t => t.status === 'resolved' || t.status === 'closed')
        : techJobs.filter(t => t.status !== 'closed' && t.status !== 'resolved');

    displayJobs.sort((a, b) => {
        const p = { emergency: 0, urgent: 1, routine: 2 };
        const pd = (p[a.priority] || 2) - (p[b.priority] || 2);
        if (pd !== 0) return pd;
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (activeClockIn) {
        const activeJob = displayJobs.find(t => t._key === activeClockIn.ticketKey) || techJobs.find(t => t._key === activeClockIn.ticketKey);
        if (activeJob) displayJobs = [activeJob, ...displayJobs.filter(t => t._key !== activeClockIn.ticketKey)];
    }

    const listEl = document.getElementById('techJobList');
    if (displayJobs.length === 0) {
        const msg = techFilter === 'active' ? 'No jobs assigned to you' : 'No completed jobs yet';
        listEl.innerHTML = `<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">${msg}</div>`;
        return;
    }

    const statusLabel = { unassigned:'Unassigned', assigned:'Assigned', inprogress:'In Progress', waiting:'Waiting', resolved:'Resolved', closed:'Closed' };
    const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
    const isClocked = activeClockIn !== null;

    listEl.innerHTML = displayJobs.map(t => {
        const storeName = (stores.find(s => s.code === t.storeCode) || {}).name || t.storeCode;
        const shortStore = storeName.replace(/^Burger King /, 'BK ').replace(/^Paradise QS /, 'PQS ');
        const isActiveJob = activeClockIn && activeClockIn.ticketKey === t._key;
        const prBadge = {routine:'<span class="priority-word p-routine">Routine</span>',urgent:'<span class="priority-word p-urgent">Urgent</span>',emergency:'<span class="priority-word p-emergency">Emergency</span>'}[t.priority] || '';
        const desc = (t.description || '').substring(0, 100) + ((t.description || '').length > 100 ? '...' : '');
        const time = getTimeAgo(t.createdAt);

        let actionBtn = '';
        if (isActiveJob) {
            const mode = getExecutionModeState(activeClockIn.modeStatus || t.status);
            actionBtn = `<button class="btn-tech-primary" onclick="event.stopPropagation();techAdvanceExecutionMode()">${mode.label}</button>`;
        } else if (!isClocked && t.status !== 'resolved' && t.status !== 'closed') {
            actionBtn = `<button class="btn-clock-in" onclick="event.stopPropagation();clockIn('${t._key}','${escHtml(t.id)}','${escHtml(shortStore)}', '${t.priority || ''}')">▶ Clock In</button>`;
        } else if (isClocked && !isActiveJob) {
            actionBtn = `<button class="btn-clock-in" disabled title="Finish current job first">▶ Clock In</button>`;
        }

        return `<div class="tech-job-card ${isActiveJob ? 'active-job' : ''}" onclick="techOpenTicket('${t._key}')">
            <div class="tjc-main">
                <div class="tjc-top">
                    <span class="tjc-store">${escHtml(shortStore)}</span>
                    <span class="tjc-id">${escHtml(t.id || t._key)}</span>
                    ${prBadge}
                </div>
                <div class="tjc-desc">${catIcons[t.category] || ''} ${escHtml(desc)}</div>
                <div class="tjc-meta">
                    <span class="ticket-status-badge status-${normalizeTicketStatus(t.status)}" style="font-size:11px;padding:2px 8px">${statusLabel[normalizeTicketStatus(t.status)] || t.status}</span>
                    <span style="color:var(--text-muted)">${time}</span>
                    <span style="color:#059669;font-weight:600">Assigned to you</span>
                </div>
                <div class="tjc-fast-actions">
                    <button class="quick-chip" onclick="event.stopPropagation();saveTechQuickChip('${t._key}','On site — troubleshooting now')">On site</button>
                    <button class="quick-chip" onclick="event.stopPropagation();saveTechQuickChip('${t._key}','Waiting on parts')">Waiting parts</button>
                    <button class="quick-chip" onclick="event.stopPropagation();saveTechQuickChip('${t._key}','Need callback from store')">Need callback</button>
                </div>
            </div>
            <div class="tjc-actions">
                ${actionBtn}
                ${isActiveJob ? '<button class="btn-view-ticket" onclick="event.stopPropagation();showClockOutPrompt()">Clock Out</button>' : ''}
            </div>
        </div>`;
    }).join('');

    if (activeClockIn) renderTechDetailPane(activeClockIn.ticketKey);
}

async function saveTechQuickChip(key, note) {
    await db.ref('tickets/' + key + '/activity').push({ action: 'note', by: currentUser.name, byEmail: currentUser.email, timestamp: Date.now(), note });
    toast('Note added', 'success');
}

function filterTechJobs(filter, btn) {
    techFilter = filter;
    document.querySelectorAll('#techDashboard .filter-chip').forEach(c => c.classList.remove('active'));
    if (btn) btn.classList.add('active');
    else document.querySelector(`#techDashboard .filter-chip[data-filter="${filter}"]`)?.classList.add('active');
    renderTechDashboard();
}

function techOpenTicket(key) {
    const t = techJobs.find(x => x._key === key);
    if (!t) return;
    const store = stores.find(s => s.code === t.storeCode);
    if (store) selectedStore = store;
    currentTickets = [t];
    if ((window.innerWidth || 0) >= 768 && (window.innerWidth || 0) < 1100) {
        renderTechDetailPane(key);
        return;
    }
    openTicketDetail(key, false);
}

function clockIn(ticketKey, ticketId, storeName, priority = 'routine') {
    if (activeClockIn) { toast('Already clocked into a job. Clock out first.', 'error'); return; }

    const now = Date.now();
    const entry = {
        techEmail: currentUser.email,
        techName: currentUser.name,
        ticketKey,
        ticketId,
        storeName,
        startTime: now,
        endTime: null,
        modeStatus: 'assigned',
        emergency: priority === 'emergency'
    };

    const ref = db.ref('timeEntries').push();
    ref.set(entry).then(() => {
        activeClockIn = { entryKey: ref.key, ticketKey, ticketId, storeName, startTime: now, modeStatus: 'assigned', emergency: priority === 'emergency' };
        db.ref('tickets/' + ticketKey + '/status').set('assigned');
        db.ref('tickets/' + ticketKey + '/assignedTo').set(currentUser.email);
        db.ref('tickets/' + ticketKey + '/assigneeType').set('tech');
        db.ref('tickets/' + ticketKey + '/activity').push({
            action: 'status', by: currentUser.name, oldStatus: 'assigned', newStatus: 'assigned', note: 'Clocked in and preparing travel', timestamp: now
        });
        showClockBanner();
        toast('Clocked in! Execution mode enabled.', 'success');
        loadTechJobs();
    }).catch(err => { toast('Failed to clock in: ' + err.message, 'error'); });
}

async function techAdvanceExecutionMode() {
    if (!activeClockIn) return;
    const mode = getExecutionModeState(activeClockIn.modeStatus || 'assigned');
    const now = Date.now();
    try {
        await db.ref('tickets/' + activeClockIn.ticketKey + '/status').set(mode.nextStatus);
        await db.ref('tickets/' + activeClockIn.ticketKey + '/activity').push({
            action: 'status', by: currentUser.name, oldStatus: activeClockIn.modeStatus || 'assigned', newStatus: mode.nextStatus, note: mode.note, timestamp: now
        });
        activeClockIn.modeStatus = mode.nextStatus === 'resolved' ? 'resolved' : (mode.key === 'travel' ? 'inprogress' : mode.nextStatus);
        if (mode.nextStatus === 'resolved') {
            showClockOutPrompt();
            return;
        }
        showClockBanner();
        loadTechJobs();
    } catch (err) {
        toast('Unable to update execution mode: ' + err.message, 'error');
    }
}

function showClockBanner() {
    if (!activeClockIn) return;
    const banner = document.getElementById('techClockBanner');
    banner.classList.remove('hidden');
    document.getElementById('tcbTicketId').textContent = activeClockIn.ticketId;
    document.getElementById('tcbStoreName').textContent = activeClockIn.storeName;
    const mode = getExecutionModeState(activeClockIn.modeStatus || 'assigned');
    document.getElementById('techPrimaryActionBtn').textContent = mode.label;
    const mobileBtn = document.getElementById('techMobilePrimaryBtn');
    if (mobileBtn) mobileBtn.textContent = mode.label;
    const emergency = document.getElementById('tcbEmergency');
    emergency.classList.toggle('hidden', !activeClockIn.emergency);
    const mobileFooter = document.getElementById('techMobileFooter');
    if (mobileFooter) mobileFooter.classList.toggle('hidden', !(window.innerWidth < 768 && activeClockIn));

    if (clockTimerInterval) clearInterval(clockTimerInterval);
    clockTimerInterval = setInterval(updateClockTimer, 1000);
    updateClockTimer();
}

function updateClockTimer() {
    if (!activeClockIn) return;
    const elapsed = Date.now() - activeClockIn.startTime;
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    const s = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('tcbTimer').textContent =
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function showClockOutPrompt() {
    if (!activeClockIn) return;
    clockOutPhotos = [];
    clockOutStatus = activeClockIn.modeStatus === 'waiting' ? 'waiting' : 'resolved';

    const elapsed = Date.now() - activeClockIn.startTime;
    const mins = Math.round(elapsed / 60000);

    document.getElementById('clockOutInfo').innerHTML = `
        <div style="font-size:14px;margin-bottom:4px"><strong>${escHtml(activeClockIn.ticketId)}</strong> at ${escHtml(activeClockIn.storeName)}</div>
        <div style="font-size:13px;color:var(--text-muted)">Execution mode active • time on job: ${mins} minute${mins !== 1 ? 's' : ''}</div>`;

    const statusOptions = ['inprogress', 'waiting', 'resolved'];
    const statusLabels = { inprogress: 'Continue Working', waiting: 'Waiting', resolved: 'Resolved / Completed' };
    document.getElementById('clockOutStatusGrid').innerHTML = statusOptions.map(s =>
        `<button class="status-option ${s === clockOutStatus ? 'active' : ''}" onclick="clockOutStatus='${s}';this.parentElement.querySelectorAll('.status-option').forEach(b=>b.classList.remove('active'));this.classList.add('active')">${statusLabels[s]}</button>`
    ).join('');

    document.getElementById('clockOutNotes').value = '';
    document.getElementById('clockOutPhotoPreview').innerHTML = '';
    document.getElementById('clockOutModal').classList.add('open');
}

function handleClockOutPhotos(input) {
    const files = Array.from(input.files).slice(0, 3 - clockOutPhotos.length);
    files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { toast('File too large (max 5MB)', 'error'); return; }
        clockOutPhotos.push(file);
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('clockOutPhotoPreview');
            const idx = clockOutPhotos.length - 1;
            preview.innerHTML += `<div style="position:relative;display:inline-block">
                <img src="${e.target.result}" style="width:56px;height:56px;border-radius:8px;object-fit:cover;border:1px solid var(--border)">
                <button onclick="clockOutPhotos.splice(${idx},1);this.parentElement.remove()" style="position:absolute;top:-4px;right:-4px;background:#dc2626;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;line-height:18px">✕</button>
            </div>`;
        };
        reader.readAsDataURL(file);
    });
    input.value = '';
}

async function confirmClockOut() {
    if (!activeClockIn) return;
    
    const btn = document.getElementById('clockOutBtn');
    btn.innerHTML = '<span class="spinner"></span> Saving...';
    btn.disabled = true;

    try {
        const now = Date.now();
        const notes = document.getElementById('clockOutNotes').value.trim();
        
        // Convert photos
        const photoUrls = [];
        for (const f of clockOutPhotos) {
            const dataUrl = await fileToBase64(f);
            photoUrls.push(dataUrl);
        }
        
        // Update time entry
        await db.ref('timeEntries/' + activeClockIn.entryKey).update({ endTime: now });
        
        // Update ticket status
        await db.ref('tickets/' + activeClockIn.ticketKey + '/status').set(clockOutStatus);
        
        // Add activity
        const activity = {
            action: 'status',
            by: currentUser.name,
            oldStatus: 'inprogress',
            newStatus: clockOutStatus,
            note: notes ? 'Clocked out — "' + notes + '"' : 'Clocked out',
            timestamp: now
        };
        if (photoUrls.length) activity.photos = photoUrls;
        await db.ref('tickets/' + activeClockIn.ticketKey + '/activity').push(activity);
        
        // Clear clock-in state
        if (clockTimerInterval) clearInterval(clockTimerInterval);
        activeClockIn = null;
        clockOutPhotos = [];
        
        document.getElementById('techClockBanner').classList.add('hidden');
        document.getElementById('techMobileFooter')?.classList.add('hidden');
        document.getElementById('clockOutModal').classList.remove('open');
        toast('Clocked out!', 'success');
        loadTechJobs();
    } catch (err) {
        toast('Error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = 'Complete Clock Out';
        btn.disabled = false;
    }
}

// ============================================================
// ADMIN SUMMARY DASHBOARD
// ============================================================
function loadAdminSummary() {
    db.ref('tickets').once('value', snap => {
        const tickets = [];
        snap.forEach(child => { tickets.push({ _key: child.key, ...child.val() }); });

        const statusCounts = { unassigned: 0, assigned: 0, inprogress: 0, waiting: 0, resolved: 0, closed: 0 };
        tickets.forEach(t => {
            const key = normalizeTicketStatus(t.status || '');
            if (Object.prototype.hasOwnProperty.call(statusCounts, key)) statusCounts[key]++;
        });

        document.getElementById('adminSummaryGrid').innerHTML = `
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('unassigned'),200)">
                <div class="asc-num red">${statusCounts.unassigned}</div>
                <div class="asc-label" data-i18n="status_unassigned">Unassigned</div>
            </div>
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('assigned'),200)">
                <div class="asc-num purple">${statusCounts.assigned}</div>
                <div class="asc-label" data-i18n="status_assigned">Assigned</div>
            </div>
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('inprogress'),200)">
                <div class="asc-num blue">${statusCounts.inprogress}</div>
                <div class="asc-label" data-i18n="status_inprogress">In Progress</div>
            </div>
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('waiting'),200)">
                <div class="asc-num orange">${statusCounts.waiting}</div>
                <div class="asc-label" data-i18n="status_waiting">Waiting</div>
            </div>
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('resolved'),200)">
                <div class="asc-num green">${statusCounts.resolved}</div>
                <div class="asc-label" data-i18n="status_resolved">Resolved</div>
            </div>
            <div class="admin-sum-card" onclick="selectBrand('all');setTimeout(()=>showAllTickets('closed'),200)">
                <div class="asc-num gray">${statusCounts.closed}</div>
                <div class="asc-label" data-i18n="status_closed">Closed</div>
            </div>`;

        document.getElementById('adminSummary').classList.remove('hidden');
    });
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

    // Determine visibility scope
    const isTech = currentUser.role === 'Technician';
    const isAdmin = currentUser.role === 'Admin';
    let myStores = null;
    if (!isAdmin && !isTech) {
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

            // Store access check
            let canSee = false;
            if (isAdmin) {
                canSee = true;
            } else if (isTech) {
                // Techs only see tickets assigned to them
                canSee = t.assignedTo === currentUser.email;
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

        // Sort: urgency, then status, then newest
        const statusOrder = { unassigned: 0, assigned: 1, waiting: 2, inprogress: 3, resolved: 4, closed: 5 };
        notifyTickets.sort((a, b) =>
            (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) ||
            (statusOrder[normalizeTicketStatus(a.status)] ?? 9) - (statusOrder[normalizeTicketStatus(b.status)] ?? 9) ||
            (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
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
        const lang = currentLang === 'es' ? 'No hay tickets abiertos' : 'No unassigned tickets';
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
let allTicketsDrilldown = null;

function showAllTickets(defaultStatus) {
    showScreen('allTicketsScreen');
    const statusSel = document.getElementById('atFilterStatus');
    statusSel.value = defaultStatus || 'unassigned';
    if (!allTicketsDrilldown) {
        const banner = document.getElementById('allTicketsDrilldownBanner');
        if (banner) banner.style.display = 'none';
    }
    
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
            allTicketsData.push({ _key: child.key, ...child.val() });
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
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Director' && currentUser.stores !== 'all') {
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
    if (currentUser.role !== 'Admin' && currentUser.role !== 'Director' && currentUser.stores !== 'all') {
        const userStores = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
        filtered = filtered.filter(t => userStores.includes(t.storeCode));
    }
    
    // Status filter
    if (status === 'unassigned') {
        filtered = filtered.filter(t => normalizeTicketStatus(t.status) === 'unassigned');
    } else if (status !== 'all') {
        filtered = filtered.filter(t => normalizeTicketStatus(t.status) === status);
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

    if (allTicketsDrilldown) {
        const d = allTicketsDrilldown;
        if (d.ticketId) filtered = filtered.filter(t => t.id === d.ticketId);
        if (d.assignedTo) filtered = filtered.filter(t => t.assignedTo === d.assignedTo);
        if (d.scope === 'unassigned-critical') {
            filtered = filtered.filter(t => isActiveTicketStatus(t.status) && (t.priority === 'urgent' || t.priority === 'emergency') && !String(t.assignedTo || '').trim());
        }
    }

    const banner = document.getElementById('allTicketsDrilldownBanner');
    if (banner) {
        if (allTicketsDrilldown) {
            const d = allTicketsDrilldown;
            const label = d.scope === 'unassigned-critical' ? 'Unassigned urgent/emergency' :
                d.scope === 'tech-workload' ? 'Tech workload' :
                'Drilldown';
            banner.style.display = '';
            banner.innerHTML = `<strong>${label}</strong> active. <button class="quick-chip" onclick="allTicketsDrilldown=null;filterAllTickets()" style="margin-left:8px">Clear</button>`;
        } else {
            banner.style.display = 'none';
        }
    }
    
    const title = document.getElementById('allTicketsTitle');
    title.textContent = status === 'all' ? `All Tickets (${filtered.length})` : `${status === 'unassigned' ? 'Unassigned' : capitalize(status)} Tickets (${filtered.length})`;
    
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
        const statusClass = (normalizeTicketStatus(t.status) || 'unassigned').toLowerCase().replace(/\s+/g, '');
        const prColor = t.priority === 'emergency' ? '#dc2626' : t.priority === 'urgent' ? '#d97706' : '#059669';
        const staleInProgress = normalizeTicketStatus(t.status) === 'inprogress' && ((Date.now() - (t.updatedAt || t.createdAt || 0)) >= 24 * 60 * 60 * 1000);
        
        return `<div class="ticket-card" onclick="openTicketFromAllByKey('${esc(t._key || t.id)}')">
            <div class="ticket-card-top">
                <span class="ticket-id">${esc(t.id)}</span>
                <span class="ticket-status s-${statusClass}">${getStatusLabel(normalizeTicketStatus(t.status))}</span>
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
                ${staleInProgress ? '<span class="priority-badge p-urgent">⏱️ In Progress 24h+</span>' : ''}
            </div>
            ${renderInlineAssignControls(t, 'all')}
        </div>`;
    }).join('');
}

function openTicketFromAllByKey(ticketKey) {
    const t = allTicketsData.find(x => x._key === ticketKey || x.id === ticketKey);
    if (!t) return;
    const store = stores.find(s => s.code === t.storeCode);
    if (store) selectedStore = store;
    if (!t._key) t._key = ticketKey;
    const existing = currentTickets.find(x => x._key === t._key);
    if (!existing) currentTickets.push(t);
    openTicketDetail(t._key);
}

function openTicketFromAll(ticketId) {
    // Legacy wrapper retained for compatibility.
    openTicketFromAllByKey(ticketId);
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
        overlay.style.zIndex = '200';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
        overlay.innerHTML = `<div class="modal-card">
            <h3>View As Another User</h3>
            <p style="font-size:13px;color:var(--text-mid);margin-bottom:14px">See the app exactly as this user would. You'll keep your admin powers but see their stores and role.</p>
            <div class="form-group">
                <select class="form-select" id="viewAsSelect" style="font-size:14px">
                    <option value="">Choose a user...</option>
                    ${entries.sort((a,b) => (a[1].name||'').localeCompare(b[1].name||'')).map(([uid, u]) =>
                        `<option value="${uid}">${esc(u.name || 'Unknown')} — ${esc(u.title || getDirectoryTitleByEmail(u.email, '') || u.role || 'Manager')} (${esc(u.email || uid)})</option>`
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
        const directoryProfile = getDirectoryProfileByEmail(data.email || '');
        const effectiveRoleRaw = (directoryProfile && directoryProfile.role) ? directoryProfile.role : data.role;
        const effectiveStores = (directoryProfile && directoryProfile.stores) ? directoryProfile.stores : (data.stores || []);
        const fallbackTitle = getDirectoryTitleByEmail(data.email || '', '');
        currentUser = {
            uid: realUser.uid,
            email: data.email || '',
            name: data.name || (directoryProfile && directoryProfile.name) || 'Unknown',
            role: normalizeRole(effectiveRoleRaw),
            stores: effectiveStores,
            title: data.title || fallbackTitle || effectiveRoleRaw || normalizeRole(effectiveRoleRaw),
            _impersonating: data.name || data.email
        };

        document.getElementById('viewAsModal').remove();

        // === FULL STATE RESET ===
        selectedStore = null;
        document.getElementById('storeType').value = '';
        document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
        document.getElementById('storeSelect').innerHTML = '<option value="">Choose store...</option>';
        document.getElementById('actionButtons').classList.add('hidden');
        document.getElementById('mapOverview').classList.add('hidden');
        document.getElementById('adminSummary').classList.add('hidden');

        // Clear tech dashboard state
        if (clockTimerInterval) { clearInterval(clockTimerInterval); clockTimerInterval = null; }
        activeClockIn = null;
        document.getElementById('techClockBanner')?.classList.add('hidden');

        // Update header
        const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        document.getElementById('userAvatar').textContent = initials || '?';
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userRole').innerHTML = getRoleTitle(currentUser) + ' <span style="font-size:10px;color:var(--accent);font-weight:700">(viewing as)</span>';

        // Mirror impersonated user's controls exactly.
        document.getElementById('adminBtn').classList.toggle('hidden', !canAccessAdminPanel(currentUser));
        document.getElementById('vendorBtn').classList.toggle('hidden', !canManageVendors(currentUser));
        document.getElementById('viewAsBtn').classList.toggle('hidden', true);

        // Show/hide admin-only UI
        const allPill = document.getElementById('brandPill-all');
        const allOpt = document.querySelector('.admin-only-opt');
        if (currentUser.role === 'Admin' || currentUser.role === 'Director') {
            if (allPill) allPill.classList.remove('hidden');
            if (allOpt) allOpt.classList.remove('hidden');
        } else {
            if (allPill) allPill.classList.add('hidden');
            if (allOpt) allOpt.classList.add('hidden');
        }

        // Apply experience CSS + route to correct landing
        applyExperienceClass(currentUser.role);
        routeToProfileLanding();

        initNotificationCenter();
        showToast('Viewing as ' + currentUser.name, 'success');
    });
}

function exitViewAs() {
    if (!realUser) return;
    currentUser = { ...realUser };
    realUser = null;

    document.getElementById('viewAsModal')?.remove();

    // Full state reset
    selectedStore = null;
    if (clockTimerInterval) { clearInterval(clockTimerInterval); clockTimerInterval = null; }
    activeClockIn = null;
    document.getElementById('techClockBanner')?.classList.add('hidden');

    showScreen('storeSelection');
    document.getElementById('storeType').value = '';
    document.querySelectorAll('.brand-pill').forEach(b => b.classList.remove('active'));
    document.getElementById('storeSelect').innerHTML = '<option value="">Choose store...</option>';
    document.getElementById('actionButtons').classList.add('hidden');
    document.getElementById('mapOverview').classList.add('hidden');

    // Restore header
    const initials = currentUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('userAvatar').textContent = initials || '?';
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = getRoleTitle(currentUser);

    // Restore admin experience
    document.getElementById('vendorBtn')?.classList.toggle('hidden', !canManageVendors(currentUser));
    applyExperienceClass(currentUser.role);
    document.getElementById('brandPill-all')?.classList.remove('hidden');
    document.querySelector('.admin-only-opt')?.classList.remove('hidden');
    routeToProfileLanding();

    initNotificationCenter();
    showToast('Back to IT Support', 'success');
}

// ============================================================
// NEW ISSUE FORM
// ============================================================
const NEW_ISSUE_DRAFT_KEY = 'rm_new_issue_draft_v1';
let wizardModeEnabled = false;
let wizardStep = 1;
const wizardTotalSteps = 6;

function getAccessibleStores() {
    if (!currentUser) return [];
    if (currentUser.role === 'Admin' || currentUser.role === 'Director' || currentUser.stores === 'all') return [...stores];
    const allowed = Array.isArray(currentUser.stores) ? currentUser.stores : [currentUser.stores];
    return stores.filter(s => allowed.includes(s.code));
}

function showNewIssueScreen() {
    if (!selectedStore) return;
    resetNewIssueForm();
    wizardModeEnabled = getExperienceProfile(currentUser.role) === 'manager-mobile';
    const screen = document.getElementById('newIssueScreen');
    screen.classList.toggle('wizard-mode', wizardModeEnabled);
    document.getElementById('newIssueStoreName').textContent = selectedStore.name;
    initWizardMode();
    restoreNewIssueDraft();
    showScreen('newIssueScreen');
}

function initWizardMode() {
    if (!wizardModeEnabled) return;
    initWizardCategoryCards();
    renderWizardStoreOptions();
    wizardStep = 1;
    syncWizardView();
}

function initWizardCategoryCards() {
    const host = document.getElementById('wizardCategoryGrid');
    if (!host || host.childElementCount) return;
    document.querySelectorAll('#categoryGrid .category-btn').forEach(btn => {
        const cat = btn.dataset.cat;
        const icon = btn.querySelector('.cat-icon')?.textContent || '📎';
        const label = btn.querySelector('.cat-label')?.textContent || cat;
        const card = document.createElement('button');
        card.className = 'wizard-touch-card';
        card.dataset.cat = cat;
        card.type = 'button';
        card.innerHTML = `<span class="cat-icon">${icon}</span><span>${label}</span>`;
        card.onclick = () => selectCategory(card);
        host.appendChild(card);
    });
}

function renderWizardStoreOptions() {
    const host = document.getElementById('wizardStoreList');
    if (!host) return;
    host.innerHTML = '';
    const available = getAccessibleStores();
    if (!selectedStore && available.length === 1) {
        selectedStore = available[0];
        document.getElementById('newIssueStoreName').textContent = selectedStore.name;
        document.getElementById('storeSelect').value = selectedStore.id;
    }
    available.forEach(store => {
        const btn = document.createElement('button');
        btn.className = 'wizard-store-btn';
        btn.type = 'button';
        btn.textContent = store.name;
        btn.dataset.storeId = store.id;
        btn.classList.toggle('selected', selectedStore && selectedStore.id === store.id);
        btn.onclick = () => {
            selectedStore = store;
            document.getElementById('newIssueStoreName').textContent = store.name;
            document.getElementById('storeSelect').value = store.id;
            renderWizardStoreOptions();
            saveNewIssueDraft();
        };
        host.appendChild(btn);
    });
}

function syncWizardView() {
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.toggle('active', Number(step.dataset.step) === wizardStep);
    });
    const chips = document.getElementById('wizardStepChips');
    if (chips) {
        chips.innerHTML = '';
        for (let i = 1; i <= wizardTotalSteps; i++) {
            const chip = document.createElement('div');
            chip.className = 'wizard-step-chip' + (i <= wizardStep ? ' active' : '');
            chips.appendChild(chip);
        }
    }
    const prevBtn = document.getElementById('wizardPrevBtn');
    const nextBtn = document.getElementById('wizardNextBtn');
    const submitBtn = document.getElementById('submitBtn');
    prevBtn.classList.toggle('hidden', wizardStep === 1);
    nextBtn.classList.toggle('hidden', wizardStep >= wizardTotalSteps);
    submitBtn.classList.toggle('hidden', wizardStep < wizardTotalSteps);
    if (wizardStep === wizardTotalSteps) renderWizardReview();
}

function wizardNextStep() {
    if (!wizardModeEnabled) return;
    if (wizardStep < wizardTotalSteps) wizardStep += 1;
    syncWizardView();
    saveNewIssueDraft();
}

function wizardPrevStep() {
    if (!wizardModeEnabled) return;
    if (wizardStep > 1) wizardStep -= 1;
    syncWizardView();
    saveNewIssueDraft();
}

function copyWizardDescriptionToMain() {
    const wizardDesc = document.getElementById('wizardIssueDescription')?.value || '';
    document.getElementById('issueDescription').value = wizardDesc;
    saveNewIssueDraft();
}

function renderWizardReview() {
    const review = document.getElementById('wizardReviewCard');
    if (!review) return;
    const categoryLabel = document.querySelector(`#categoryGrid .category-btn[data-cat="${selectedCategory || ''}"] .cat-label`)?.textContent || 'Not selected';
    review.innerHTML = `
        <div class="wizard-review-row"><strong>Store</strong><span>${selectedStore ? selectedStore.name : 'Not selected'}</span></div>
        <div class="wizard-review-row"><strong>Category</strong><span>${categoryLabel}</span></div>
        <div class="wizard-review-row"><strong>Photos</strong><span>${uploadedPhotos.length}</span></div>
        <div class="wizard-review-row"><strong>Description</strong><span>${(document.getElementById('issueDescription').value || '').trim().slice(0, 64) || 'Not provided'}</span></div>
        <div class="wizard-review-row"><strong>Priority</strong><span>${capitalize(selectedPriority || 'not selected')}</span></div>
    `;
}

function saveNewIssueDraft() {
    if (!currentUser) return;
    const draft = {
        user: currentUser.email,
        storeId: selectedStore ? selectedStore.id : '',
        category: selectedCategory,
        location: selectedLocation,
        priority: selectedPriority,
        contactName: document.getElementById('contactName')?.value || '',
        contactPhone: document.getElementById('contactPhone')?.value || '',
        description: document.getElementById('issueDescription')?.value || '',
        wizardDescription: document.getElementById('wizardIssueDescription')?.value || '',
        wizardStep,
        wizardModeEnabled,
        updatedAt: Date.now()
    };
    localStorage.setItem(NEW_ISSUE_DRAFT_KEY, JSON.stringify(draft));
}

function restoreNewIssueDraft() {
    let draft = null;
    try {
        draft = JSON.parse(localStorage.getItem(NEW_ISSUE_DRAFT_KEY) || 'null');
    } catch (e) {
        draft = null;
    }
    if (!draft || draft.user !== currentUser?.email) return;
    if (draft.storeId) {
        const store = stores.find(s => s.id === draft.storeId);
        if (store && getAccessibleStores().some(x => x.id === store.id)) {
            selectedStore = store;
            document.getElementById('storeSelect').value = store.id;
            document.getElementById('newIssueStoreName').textContent = store.name;
            renderWizardStoreOptions();
        }
    }
    if (draft.category) {
        const btn = document.querySelector(`.category-btn[data-cat="${draft.category}"]`) || document.querySelector(`.wizard-touch-card[data-cat="${draft.category}"]`);
        if (btn) selectCategory(btn);
    }
    if (draft.location) {
        const locBtn = document.querySelector(`.priority-btn[data-loc="${draft.location}"]`);
        if (locBtn) selectLocation(locBtn);
    }
    if (draft.priority) {
        const priBtn = document.querySelector(`.priority-btn[data-priority="${draft.priority}"]`);
        if (priBtn) selectPriority(priBtn);
    }
    document.getElementById('contactName').value = draft.contactName || '';
    document.getElementById('contactPhone').value = draft.contactPhone || '';
    document.getElementById('issueDescription').value = draft.description || '';
    document.getElementById('wizardIssueDescription').value = draft.wizardDescription || draft.description || '';
    if (wizardModeEnabled) {
        wizardStep = Math.min(Math.max(draft.wizardStep || 1, 1), wizardTotalSteps);
        syncWizardView();
    }
}

function clearNewIssueDraft() {
    localStorage.removeItem(NEW_ISSUE_DRAFT_KEY);
}

function resetNewIssueForm() {
    selectedCategory = null;
    selectedPriority = null;
    selectedLocation = null;
    wizardStep = 1;
    uploadedPhotos = [];
    document.querySelectorAll('.category-btn,.wizard-touch-card').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('issueDescription').value = '';
    const wizardDesc = document.getElementById('wizardIssueDescription');
    if (wizardDesc) wizardDesc.value = '';
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('photoPreviewGrid').innerHTML = '';
    const wizardGrid = document.getElementById('wizardPhotoPreviewGrid');
    if (wizardGrid) wizardGrid.innerHTML = '';
    document.getElementById('photoUploadArea').classList.remove('has-photos');
    const reqDateType = document.getElementById('reqDateType');
    if (reqDateType) { reqDateType.value = ''; toggleDateFields(); }
    const btn = document.getElementById('submitBtn');
    btn.innerHTML = 'Submit Ticket';
    btn.disabled = false;
}

function selectCategory(el) {
    const cat = el.dataset.cat;
    document.querySelectorAll(`.category-btn[data-cat="${cat}"], .wizard-touch-card[data-cat="${cat}"]`).forEach(b => b.classList.add('selected'));
    document.querySelectorAll('.category-btn, .wizard-touch-card').forEach(b => {
        if (b.dataset.cat !== cat) b.classList.remove('selected');
    });
    selectedCategory = cat;
    saveNewIssueDraft();
}

function selectLocation(el) {
    el.parentElement.querySelectorAll('.priority-btn[data-loc]').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    selectedLocation = el.dataset.loc;
    saveNewIssueDraft();
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
    saveNewIssueDraft();
}

function selectPriority(el) {
    const p = el.dataset.priority;
    document.querySelectorAll('.priority-btn[data-priority]').forEach(b => b.classList.toggle('selected', b.dataset.priority === p));
    selectedPriority = p;
    saveNewIssueDraft();
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
    saveNewIssueDraft();
}

function renderPhotoPreview() {
    const grid = document.getElementById('photoPreviewGrid');
    const wizardGrid = document.getElementById('wizardPhotoPreviewGrid');
    grid.innerHTML = '';
    if (wizardGrid) wizardGrid.innerHTML = '';
    document.getElementById('photoUploadArea').classList.toggle('has-photos', uploadedPhotos.length > 0);

    uploadedPhotos.forEach((p, i) => {
        const html = `<img src="${p.previewUrl}" alt="Photo"><button class="photo-remove" onclick="removePhoto(${i})">✕</button>`;
        const div = document.createElement('div');
        div.className = 'photo-preview';
        div.innerHTML = html;
        grid.appendChild(div);
        if (wizardGrid) {
            const wdiv = document.createElement('div');
            wdiv.className = 'photo-preview';
            wdiv.innerHTML = html;
            wizardGrid.appendChild(wdiv);
        }
    });
}

function removePhoto(i) {
    URL.revokeObjectURL(uploadedPhotos[i].previewUrl);
    uploadedPhotos.splice(i, 1);
    renderPhotoPreview();
    saveNewIssueDraft();
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
    if (!selectedStore) { toast('Select a store', 'error'); return; }
    if (wizardModeEnabled) copyWizardDescriptionToMain();
    // Validate
    if (!selectedCategory) { toast('Select a category', 'error'); return; }
    if (!selectedLocation) { toast('Select interior or exterior', 'error'); return; }
    let contactName = document.getElementById('contactName').value.trim();
    if (!contactName && wizardModeEnabled) contactName = currentUser?.name || '';
    if (!contactName) { toast('Enter your name', 'error'); return; }
    let contactPhone = document.getElementById('contactPhone').value.trim();
    if (!contactPhone && wizardModeEnabled) contactPhone = '';
    if (!wizardModeEnabled && (!contactPhone || contactPhone.replace(/\D/g,'').length < 10)) { toast('Enter a valid phone number', 'error'); return; }
    if (!selectedPriority) { toast('Select a priority', 'error'); return; }
    // Photos optional but encouraged
    if (uploadedPhotos.length === 0) {
        const confirmed = await showPhotoConfirm();
        if (!confirmed) return;
    }
    const desc = document.getElementById('issueDescription').value.trim();
    if (!desc) { toast('Add a description', 'error'); return; }
    if (desc.length < 10) { toast('Description too short', 'error'); return; }

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

        const assignedTo = '';
        const assigneeType = 'unassigned';

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
            status: 'unassigned',
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

        clearNewIssueDraft();
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

function toggleCompactFilters(open) {
    const modal = document.getElementById('compactFilterModal');
    if (!modal) return;
    modal.classList.toggle('open', !!open);
}

function filterTickets(filter, chipEl) {
    currentFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === filter));
    if (document.body.classList.contains('exp-manager-mobile')) {
        toggleCompactFilters(false);
    }
    renderTickets();
}

function renderTickets() {
    const listEl = document.getElementById('ticketsList');
    let tickets = currentTickets;

    if (currentFilter !== 'all') {
        tickets = tickets.filter(t => normalizeTicketStatus(t.status) === currentFilter);
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
            unassigned: 'Unassigned', assigned: 'Assigned', inprogress: 'In Progress',
            waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed'
        }[normalizeTicketStatus(t.status)] || t.status;

        const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
        const timeAgo = getTimeAgo(t.createdAt);
        const brandLogo = t.brand && BRAND_LOGOS[t.brand] ? `<img src="${BRAND_LOGOS[t.brand]}" alt="" style="width:16px;height:16px;object-fit:contain;border-radius:3px;opacity:.7;vertical-align:middle">` : '';
        const staleInProgress = normalizeTicketStatus(t.status) === 'inprogress' && ((Date.now() - (t.updatedAt || t.createdAt || 0)) >= 24 * 60 * 60 * 1000);

        return `
        <div class="ticket-card" onclick="openTicketDetail('${t._key}')">
            <div class="ticket-card-inner">
                <div class="ticket-status-bar" style="background: var(--status-${normalizeTicketStatus(t.status)})"></div>
                <div class="ticket-body">
                    <div class="ticket-top-row">
                        <span class="ticket-id">${t.id || t._key}</span>
                        <span class="ticket-status-badge status-${normalizeTicketStatus(t.status)}">${statusLabel}</span>
                    </div>
                    <div class="ticket-title">${catIcons[t.category] || '📎'} ${escHtml(t.description.substring(0, 80))}${t.description.length > 80 ? '...' : ''}</div>
                    <div class="ticket-meta">
                        <span><span class="priority-dot ${t.priority}"></span> ${capitalize(t.priority)}</span>
                        <span>${capitalize(t.category)}${t.location ? ' · ' + capitalize(t.location) : ''}</span>
                        <span>${brandLogo} ${timeAgo}</span>
                        ${t.photos && t.photos.length ? '<span>📷 ' + t.photos.length + '</span>' : ''}
                        ${t.contactPhone ? '<span>📞</span>' : ''}
                        ${staleInProgress ? '<span class="priority-badge p-urgent">⏱️ In Progress 24h+</span>' : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// TICKET DETAIL MODAL
// ============================================================
function openTicketDetail(key, forceModal = true) {
    const t = currentTickets.find(x => x._key === key);
    if (!t) return;

    document.getElementById('modalTicketId').textContent = t.id || key;

    const catIcons = { plumbing:'🚿', equipment:'⚙️', it:'💻', structural:'🧱', safety:'🛡️', other:'📎' };
    const statusLabel = {
        unassigned: 'Unassigned', assigned: 'Assigned', inprogress: 'In Progress',
        waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed'
    };

    const canUpdateStatus = currentUser.role === 'Admin' || currentUser.role === 'Director' || currentUser.role === 'Area Coach' || currentUser.role === 'Technician';
    const canEditTicketMeta = canUpdateStatus || canEditUrgency();

    let html = `
        <div class="detail-section">
            <span class="ticket-status-badge status-${normalizeTicketStatus(t.status)}" style="font-size: 13px; padding: 5px 14px;">
                ${statusLabel[normalizeTicketStatus(t.status)] || t.status}
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
    // Status update
    if (canEditTicketMeta) {
        const normalizedStatus = normalizeTicketStatus(t.status);
        const statuses = STATUS_ORDER.filter(s => canTransitionStatus(normalizedStatus, s, t));
        html += `
        <div class="status-update-section">
            <h4>Update Status</h4>
            <div class="ticket-save-row top" id="saveRowTop">
                <button class="btn btn-primary btn-sm" onclick="saveStatusUpdate('${key}')" id="saveStatusBtnTop">Save Update</button>
            </div>
            <div class="status-select-grid">
                ${statuses.map(s => `
                    <button class="status-option ${normalizedStatus === s ? 'active' : ''}" onclick="updateTicketStatus('${key}', '${s}', this)">
                        ${statusLabel[s]}
                    </button>`).join('')}
            </div>
            ${canAssignTickets() ? `<div style="margin-top:8px"><label class="form-label" style="font-size:12px">Assign / Reassign</label><select class="form-select" id="reassignTo" style="font-size:12px"><option value="">${t.assignedTo ? 'Keep current' : 'Unassigned'}</option></select></div>` : ''}
            ${canEditUrgency() ? `<div style="margin-top:8px"><label class="form-label" style="font-size:12px">Urgency</label><select class="form-select" id="priorityUpdate" style="font-size:12px"><option value="routine" ${t.priority === 'routine' ? 'selected' : ''}>Routine</option><option value="urgent" ${t.priority === 'urgent' ? 'selected' : ''}>Urgent</option><option value="emergency" ${t.priority === 'emergency' ? 'selected' : ''}>Emergency</option></select><textarea class="form-textarea" id="priorityReason" placeholder="Reason for urgency change (required if changed)" style="min-height:56px;font-size:12px;margin-top:6px"></textarea></div>` : ''}
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
            <div class="ticket-save-row" id="saveRowBottom">
                <button class="btn btn-primary btn-sm" onclick="saveStatusUpdate('${key}')" id="saveStatusBtnBottom">Save Update</button>
            </div>
        </div>`;
    }

    // Activity log
    if (t.activity && t.activity.length) {
        html += `
        <div class="activity-log">
            <h4>Activity</h4>
            ${t.activity.slice().reverse().map(a => `
                <div class="activity-item">
                    <div class="activity-dot" style="background: var(--status-${a.action === 'created' ? 'unassigned' : (normalizeTicketStatus(a.newStatus) || 'unassigned')})"></div>
                    <div>
                        <div class="activity-text"><strong>${escHtml(a.by)}</strong> ${getActivityText(a)}</div>
                        ${a.photos && a.photos.length ? '<div style="display:flex;gap:4px;margin-top:4px">' + a.photos.map(url => '<img src="' + url + '" style="width:48px;height:48px;border-radius:6px;object-fit:cover;cursor:pointer;border:1px solid var(--border)" onclick="openLightbox(\'' + url + '\')">').join('') + '</div>' : ''}
                        <div class="activity-time">${formatDate(a.timestamp)}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
    }

    const profile = currentUser ? getExperienceProfile(currentUser.role) : '';
    if (profile.startsWith('tech-') && profile.endsWith('tablet') && !forceModal) {
        renderTechDetailPane(key);
        return;
    }

    document.getElementById('modalBody').innerHTML = html;
    const reassignSel = document.getElementById('reassignTo');
    if (reassignSel && canAssignTickets()) {
        reassignSel.innerHTML = '<option value="">' + (t.assignedTo ? 'Keep current' : 'Unassigned') + '</option>';
        const availTechs = getAvailableTechs(t.storeCode || (selectedStore && selectedStore.code) || '');
        if (availTechs.length) {
            reassignSel.innerHTML += '<optgroup label="Repair Technicians">' + availTechs.map(te => `<option value="tech:${te.email}">🔧 ${escHtml(te.name)}</option>`).join('') + '</optgroup>';
        }
        if (vendorList.length) {
            reassignSel.innerHTML += '<optgroup label="Third-Party Vendors">' + vendorList.map(v => `<option value="vendor:${escHtml(v.name)}">🏢 ${escHtml(v.name)}</option>`).join('') + '</optgroup>';
        }
        if (canManageVendors()) {
            reassignSel.innerHTML += '<optgroup label="Vendor Tools"><option value="__edit_vendors__" class="vendor-manage-option">🛠 Edit Vendors</option></optgroup>';
        }
        reassignSel.onchange = () => {
            if (handleVendorManagerSelection(reassignSel)) {
                setModalSaveVisibility();
                return;
            }
            setModalSaveVisibility();
        };
    }

    // Wire change tracking so save buttons appear only when edits are made
    captureTicketEditBaseline(t);
    wireModalChangeTracking(t);
    setModalSaveVisibility();

    document.getElementById('ticketModal').classList.add('open');
}

let pendingStatusUpdate = null;
let pendingWaitingReason = null;
let statusPhotos = [];
let ticketEditBaseline = null;

// ------------------------------------------------------------
// Ticket detail modal change tracking (for save button visibility)
// ------------------------------------------------------------
function captureTicketEditBaseline(ticket) {
    ticketEditBaseline = {
        status: normalizeTicketStatus(ticket.status),
        priority: ticket.priority || 'routine',
        assignedTo: ticket.assignedTo || '',
        assigneeType: ticket.assigneeType || 'unassigned',
        note: '',
        priorityReason: '',
        waitingReason: ticket.waitingReason || '',
        waitingReasonNote: ticket.waitingReasonNote || ''
    };
}

function hasTicketEditChanges() {
    if (!ticketEditBaseline) return false;
    const nextStatus = pendingStatusUpdate ? pendingStatusUpdate.status : ticketEditBaseline.status;
    const priority = document.getElementById('priorityUpdate')?.value || ticketEditBaseline.priority;
    const reassign = document.getElementById('reassignTo')?.value || '';
    const note = (document.getElementById('statusNote')?.value || '').trim();
    const priorityReason = (document.getElementById('priorityReason')?.value || '').trim();

    return (
        nextStatus !== ticketEditBaseline.status ||
        priority !== ticketEditBaseline.priority ||
        reassign !== '' ||
        note.length > 0 ||
        priorityReason.length > 0 ||
        statusPhotos.length > 0 ||
        !!pendingWaitingReason
    );
}

function setModalSaveVisibility() {
    const visible = hasTicketEditChanges();
    ['saveRowTop', 'saveRowBottom'].forEach(id => {
        const row = document.getElementById(id);
        if (row) row.classList.toggle('visible', visible);
    });
}

function setModalSaveBusy(isBusy) {
    ['saveStatusBtnTop', 'saveStatusBtnBottom'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = isBusy;
        btn.innerHTML = isBusy ? '<span class="spinner"></span>' : 'Save Update';
    });
}

function wireModalChangeTracking() {
    ['statusNote', 'priorityUpdate', 'priorityReason', 'reassignTo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', setModalSaveVisibility);
        el.addEventListener('change', setModalSaveVisibility);
    });
}

function parseAssignmentValue(value) {
    if (!value) return { assignedTo: '', assigneeType: 'unassigned' };
    if (value.startsWith('tech:')) return { assignedTo: value.replace('tech:', ''), assigneeType: 'tech' };
    if (value.startsWith('vendor:')) return { assignedTo: value.replace('vendor:', ''), assigneeType: 'vendor' };
    return { assignedTo: '', assigneeType: 'unassigned' };
}

function promptWaitingReason(existingReason = '', existingNote = '') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `<div class="confirm-box" style="max-width:460px">
            <h4>⏳ What are we waiting on?</h4>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:8px;margin:12px 0">
                <button class="btn btn-secondary waiting-btn" data-reason="parts">Waiting on Parts</button>
                <button class="btn btn-secondary waiting-btn" data-reason="vendor">Waiting on Vendor</button>
                <button class="btn btn-secondary waiting-btn" data-reason="approval">Waiting on Approval</button>
                <button class="btn btn-secondary waiting-btn" data-reason="other">Waiting on Other</button>
            </div>
            <textarea id="waitingOtherReason" class="form-textarea" placeholder="Explain what we are waiting on (required for 'Other')" style="min-height:72px;display:${existingReason === 'other' ? '' : 'none'}">${escHtml(existingNote || '')}</textarea>
            <div class="confirm-btns" style="margin-top:10px">
                <button class="btn btn-ghost" id="waitingCancel">Cancel</button>
                <button class="btn btn-primary" id="waitingSave">Save Waiting Reason</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);

        let selectedReason = existingReason || '';
        const setSelected = () => {
            overlay.querySelectorAll('.waiting-btn').forEach(btn => {
                btn.classList.toggle('btn-primary', btn.dataset.reason === selectedReason);
                btn.classList.toggle('btn-secondary', btn.dataset.reason !== selectedReason);
            });
            const otherBox = overlay.querySelector('#waitingOtherReason');
            if (otherBox) otherBox.style.display = selectedReason === 'other' ? '' : 'none';
        };

        overlay.querySelectorAll('.waiting-btn').forEach(btn => {
            btn.onclick = (e) => { e.preventDefault(); selectedReason = btn.dataset.reason; setSelected(); };
        });
        setSelected();

        overlay.querySelector('#waitingCancel').onclick = () => { overlay.remove(); resolve(null); };
        overlay.querySelector('#waitingSave').onclick = () => {
            if (!selectedReason) { toast('Please select a waiting reason', 'error'); return; }
            const otherText = (overlay.querySelector('#waitingOtherReason')?.value || '').trim();
            if (selectedReason === 'other' && otherText.length < 10) {
                toast('Waiting on Other requires at least 10 characters', 'error');
                return;
            }
            overlay.remove();
            resolve({ reason: selectedReason, note: selectedReason === 'other' ? otherText : '' });
        };
    });
}

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
    setModalSaveVisibility();
}

async function updateTicketStatus(key, status, el) {
    const t = currentTickets.find(x => x._key === key);
    if (!t) return;
    const currentStatus = normalizeTicketStatus(t.status);
    if (!canTransitionStatus(currentStatus, status, t)) {
        toast('You do not have permission for this status change', 'error');
        return;
    }

    if (status === 'waiting') {
        const picked = await promptWaitingReason(t.waitingReason || '', t.waitingReasonNote || '');
        if (!picked) return;
        pendingWaitingReason = picked;
    } else {
        pendingWaitingReason = null;
    }

    document.querySelectorAll('.status-option').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    pendingStatusUpdate = { key, status };
    setModalSaveVisibility();
}

// ------------------------------------------------------------
// Keep list/map views in sync after ticket updates
// ------------------------------------------------------------
function patchTicketLocally(ticketKey, patch) {
    const applyPatch = (arr) => {
        const idx = arr.findIndex(x => x._key === ticketKey || x.id === ticketKey);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...patch };
    };
    applyPatch(currentTickets);
    applyPatch(allTicketsData);
    applyPatch(notifyTickets);
}

function refreshViewsAfterTicketUpdate() {
    if (!document.getElementById('allTicketsScreen').classList.contains('hidden')) {
        filterAllTickets();
    }
    if (!document.getElementById('existingIssuesScreen').classList.contains('hidden')) {
        renderTickets();
    }
    if (!document.getElementById('storeSelection').classList.contains('hidden') && currentMapView === 'list') {
        renderStoreListView();
    }
    loadAdminSummary();
}

async function saveStatusUpdate(key) {
    const t = currentTickets.find(x => x._key === key);
    if (!t) return;

    const currentStatus = normalizeTicketStatus(t.status);
    const newStatus = pendingStatusUpdate ? pendingStatusUpdate.status : currentStatus;
    const note = document.getElementById('statusNote')?.value?.trim() || '';
    const nextPriority = document.getElementById('priorityUpdate')?.value || t.priority;
    const priorityChanged = nextPriority !== (t.priority || 'routine');
    const priorityReason = (document.getElementById('priorityReason')?.value || '').trim();
    const reassignVal = document.getElementById('reassignTo')?.value || '';
    if (reassignVal === '__edit_vendors__') {
        showVendorManager();
        return;
    }
    const assignmentChanged = canAssignTickets() && reassignVal !== '';
    const parsedAssignment = assignmentChanged ? parseAssignmentValue(reassignVal) : null;
    const targetAssignedTo = assignmentChanged ? parsedAssignment.assignedTo : (t.assignedTo || '');
    const targetAssigneeType = assignmentChanged ? parsedAssignment.assigneeType : (t.assigneeType || (t.assignedTo ? 'tech' : 'unassigned'));

    if (!canTransitionStatus(currentStatus, newStatus, t)) {
        toast('You do not have permission for this status change', 'error');
        return;
    }

    if (newStatus === 'waiting' && !pendingWaitingReason) {
        pendingWaitingReason = await promptWaitingReason(t.waitingReason || '', t.waitingReasonNote || '');
        if (!pendingWaitingReason) return;
    }

    if (newStatus === 'assigned' && !targetAssignedTo) {
        toast('Select technician/vendor before marking Assigned', 'error');
        return;
    }

    if (priorityChanged && !canEditUrgency()) {
        toast('Only managers, coaches, directors, and admins can edit urgency', 'error');
        return;
    }

    if (priorityChanged && priorityReason.length < 10) {
        toast('Urgency change reason must be at least 10 characters', 'error');
        return;
    }

    if (newStatus === currentStatus && !note && !priorityChanged && !assignmentChanged && statusPhotos.length === 0) {
        toast('No changes to save', 'error');
        return;
    }

    setModalSaveBusy(true);

    try {
        const updates = {};
        updates[`tickets/${key}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;

        if (newStatus !== currentStatus) {
            updates[`tickets/${key}/status`] = newStatus;
        }

        if (priorityChanged) {
            updates[`tickets/${key}/priority`] = nextPriority;
        }

        if (newStatus === 'waiting' && pendingWaitingReason) {
            updates[`tickets/${key}/waitingReason`] = pendingWaitingReason.reason;
            updates[`tickets/${key}/waitingReasonNote`] = pendingWaitingReason.note || '';
        } else if (newStatus === 'inprogress') {
            updates[`tickets/${key}/waitingReason`] = '';
            updates[`tickets/${key}/waitingReasonNote`] = '';
        }

        if (assignmentChanged) {
            updates[`tickets/${key}/assignedTo`] = parsedAssignment.assignedTo;
            updates[`tickets/${key}/assigneeType`] = parsedAssignment.assigneeType;
            if (newStatus === 'unassigned' && parsedAssignment.assignedTo) {
                updates[`tickets/${key}/status`] = 'assigned';
            }
        }

        const statusPhotoUrls = [];
        for (const f of statusPhotos) {
            const dataUrl = await fileToBase64(f);
            statusPhotoUrls.push(dataUrl);
        }

        const actSnap = await db.ref(`tickets/${key}/activity`).once('value');
        const currentActivity = actSnap.val() || [];

        if (newStatus !== currentStatus) {
            currentActivity.push({
                action: 'status_change',
                by: currentUser.name,
                byEmail: currentUser.email,
                timestamp: Date.now(),
                oldStatus: currentStatus,
                newStatus,
                ...(pendingWaitingReason && newStatus === 'waiting' ? { waitingReason: pendingWaitingReason.reason, waitingReasonNote: pendingWaitingReason.note || '' } : {}),
                ...(note ? { note } : {}),
                ...(statusPhotoUrls.length ? { photos: statusPhotoUrls } : {})
            });
        } else if (note || statusPhotoUrls.length) {
            currentActivity.push({
                action: 'note',
                by: currentUser.name,
                byEmail: currentUser.email,
                timestamp: Date.now(),
                note: note || 'Update added',
                ...(statusPhotoUrls.length ? { photos: statusPhotoUrls } : {})
            });
        }

        if (priorityChanged) {
            currentActivity.push({
                action: 'priority_change',
                by: currentUser.name,
                byEmail: currentUser.email,
                timestamp: Date.now(),
                oldPriority: t.priority || 'routine',
                newPriority: nextPriority,
                note: priorityReason
            });
        }

        let assignmentReminderPayload = null;
        if (assignmentChanged) {
            currentActivity.push({
                action: 'assignment_change',
                by: currentUser.name,
                byEmail: currentUser.email,
                timestamp: Date.now(),
                assignedTo: parsedAssignment.assignedTo,
                assigneeType: parsedAssignment.assigneeType
            });
        }

        const becameAssigned = currentStatus !== 'assigned' && newStatus === 'assigned';
        if ((assignmentChanged || becameAssigned) && targetAssignedTo) {
            assignmentReminderPayload = {
                ticket: {
                    ...t,
                    _key: key,
                    status: newStatus,
                    assignedTo: targetAssignedTo,
                    assigneeType: targetAssigneeType
                },
                party: targetAssignedTo
            };
        }

        updates[`tickets/${key}/activity`] = currentActivity;
        await db.ref().update(updates);

        const mergedPatch = {
            ...(newStatus !== currentStatus ? { status: newStatus } : {}),
            ...(priorityChanged ? { priority: nextPriority } : {}),
            ...(newStatus === 'waiting' && pendingWaitingReason ? {
                waitingReason: pendingWaitingReason.reason,
                waitingReasonNote: pendingWaitingReason.note || ''
            } : {}),
            ...(assignmentChanged ? { assignedTo: parsedAssignment.assignedTo, assigneeType: parsedAssignment.assigneeType, status: (newStatus === 'unassigned' ? 'assigned' : newStatus) } : {}),
            updatedAt: Date.now(),
            activity: currentActivity
        };
        patchTicketLocally(key, mergedPatch);
        refreshViewsAfterTicketUpdate();

        statusPhotos = [];
        pendingWaitingReason = null;
        toast('Ticket updated!', 'success');
        closeModal();

        if (assignmentReminderPayload) {
            await showAssignReminder(assignmentReminderPayload.ticket, assignmentReminderPayload.party);
        }
    } catch (err) {
        console.error('Update error:', err);
        toast('Update failed', 'error');
    } finally {
        setModalSaveBusy(false);
    }
}

function closeModal() {
    document.getElementById('ticketModal').classList.remove('open');
    pendingStatusUpdate = null;
    pendingWaitingReason = null;
    ticketEditBaseline = null;
    statusPhotos = [];
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
    const lower = r.toLowerCase().trim();
    if (lower === 'admin') return 'Admin';
    if (lower === 'director' || lower === 'vp' || lower === 'dev') return 'Director';
    if (lower === 'areacoach' || lower === 'area coach') return 'Area Coach';
    if (lower === 'technician') return 'Technician';
    return 'Manager';
}

function getRoleTitle(user = currentUser) {
    if (!user) return '';
    return user.title || user.role;
}

function isItsupportUser(user = currentUser) {
    return !!user && String(user.email || '').toLowerCase() === 'itsupport@dossaniparadise.com';
}

function canAccessAdminPanel(user = currentUser) {
    return isItsupportUser(user);
}

function getEffectiveRole(user = currentUser) {
    if (!user) return '';
    const role = normalizeRole(user.role || '');
    if (role === 'Admin' || role === 'Director') return role;
    const titleRole = normalizeRole(user.title || '');
    return titleRole;
}

function canManageVendors(user = currentUser) {
    const baseUser = user || currentUser;
    const viaRole = canAssignTickets(baseUser);
    const viaItsupport = isItsupportUser(baseUser);
    return !!baseUser && (viaRole || viaItsupport);
}

function canAssignTickets(user = currentUser) {
    const effective = getEffectiveRole(user);
    return effective === 'Admin' || effective === 'Director';
}

function canEditUrgency(user = currentUser) {
    return !!user && user.role !== 'Technician';
}

function normalizeTicketStatus(status) {
    const val = String(status || '').toLowerCase().trim();
    return val === 'open' ? 'unassigned' : val;
}

function getStatusLabel(status) {
    const key = normalizeTicketStatus(status);
    return {
        unassigned: 'Unassigned',
        assigned: 'Assigned',
        inprogress: 'In Progress',
        waiting: 'Waiting',
        resolved: 'Resolved',
        closed: 'Closed'
    }[key] || capitalize(key || '');
}

function canTransitionStatus(oldStatus, newStatus, ticket) {
    const from = normalizeTicketStatus(oldStatus);
    const to = normalizeTicketStatus(newStatus);
    if (from === to) return true;

    const role = currentUser?.role;
    if (!role) return false;

    if (role === 'Admin' || role === 'Director') return true;

    if (role === 'Area Coach') {
        return (from === 'waiting' && to === 'inprogress') || (from === 'inprogress' && to === 'resolved');
    }

    if (role === 'Technician') {
        if (from === 'unassigned' && to === 'assigned') return false;
        if (to === 'assigned') return false;
        return true;
    }

    return false;
}

function goHome() {
    if (activeTicketListener) { activeTicketListener(); activeTicketListener = null; }
    resetNewIssueForm();
    routeToProfileLanding();
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
        form_photos_hint: '(opcional, hasta 3)',
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
        // Tech dashboard
        tech_my_jobs: '🔧 Mis Trabajos',
        tech_active: 'Activos',
        tech_completed: 'Completados',
        tech_urgent: 'Urgente',
        tech_waiting: 'En Espera',
        tech_clock_in: 'Registrar Entrada',
        tech_clock_out: 'Registrar Salida',
        tech_clocked_in: '⏱️ Registrado',
        tech_view_details: 'Ver Detalles',
        tech_no_active: 'No hay trabajos asignados',
        tech_no_completed: 'No hay trabajos completados',
        // Admin summary
        status_open: 'Sin Asignar',
        status_unassigned: 'Sin Asignar',
        status_assigned: 'Asignados',
        status_inprogress: 'En Progreso',
        status_waiting: 'En Espera',
        status_resolved: 'Resueltos',
        status_closed: 'Cerrados',
        // Action buttons & coach
        report_issue: 'Reportar Problema',
        report_issue_desc: 'Enviar ticket de reparación',
        view_tickets: 'Tickets Existentes',
        view_tickets_desc: 'Ver y seguir problemas abiertos',
        view_all_tickets: '🔍 Ver Todos los Tickets',
        view_all_desc: 'Todas las tiendas por ubicación',
        coach_my_stores: 'Mis Tiendas',
        back_my_stores: '← Volver a Mis Tiendas',
        // Brands
        brand_fastfood: 'Comida Rápida',
        brand_cstore: 'Tienda',
        brand_carwash: 'Lavado de Autos',
        // Tech
        tech_clock_out: 'Registrar Salida',
        tech_loading: 'Cargando trabajos...',
        tech_select_job: 'Selecciona un trabajo para ver detalles.',
        // Tickets / Filters
        tickets_title: 'Tickets',
        filter_all: 'Todos',
        filter_open: 'Sin Asignar',
        filter_assigned: 'Asignados',
        filter_inprogress: 'En Progreso',
        filter_waiting: 'En Espera',
        filter_resolved: 'Resueltos',
        filter_closed: 'Cerrados',
        all_tickets_title: 'Todos los Tickets',
        // Admin
        admin_panel: 'Panel de Administración',
        // Admin panel
        admin_pending: 'Aprobación Pendiente',
        admin_active_users: 'Usuarios Activos',
        admin_add_user: 'Agregar Nuevo Usuario',
        admin_vendors: 'Proveedores Aprobados',
        admin_notify_routing: 'Enrutamiento de Notificaciones',
        admin_db_cleanup: 'Limpieza de Base de Datos',
        // Misc
        with_issues: 'Con Problemas',
        no_open_tickets: 'No hay tickets sin asignar',
        view_as: 'Ver Como',
        admin_panel: 'Panel de Admin',
        sign_out: 'Cerrar Sesión',
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
        const next = getStatusLabel(a.newStatus);
        let text = `changed status to <strong>${next}</strong>`;
        if (a.waitingReason) {
            text += ` (${WAITING_REASONS[a.waitingReason] || a.waitingReason}`;
            if (a.waitingReason === 'other' && a.waitingReasonNote) text += `: ${escHtml(a.waitingReasonNote)}`;
            text += ')';
        }
        if (a.note) text += ` — "${escHtml(a.note)}"`;
        return text;
    }
    if (a.action === 'priority_change') {
        return `changed urgency from <strong>${capitalize(a.oldPriority || 'routine')}</strong> to <strong>${capitalize(a.newPriority || 'routine')}</strong> — "${escHtml(a.note || '')}"`;
    }
    if (a.action === 'assignment_change') {
        const who = a.assignedTo ? escHtml(a.assignedTo) : 'Unassigned';
        return `updated assignment to <strong>${who}</strong>`;
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
