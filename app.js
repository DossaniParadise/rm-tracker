// Main Application Logic - SIMPLIFIED VERSION

let currentUser = null;
let selectedStore = null;

// Auth State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log('User signed in:', user.email);
        await loadUserData(user);
    } else {
        showLoginScreen();
    }
});

// Simple Microsoft Login - Let Firebase handle everything
async function loginWithMicrosoft() {
    try {
        const provider = new firebase.auth.OAuthProvider('microsoft.com');
        
        // Use popup for simplicity
        const result = await auth.signInWithPopup(provider);
        console.log('Login successful:', result.user.email);
    } catch (error) {
        console.error('Login error:', error);
        
        // If popup blocked, provide helpful message
        if (error.code === 'auth/popup-blocked') {
            showError('Popup was blocked! Please allow popups for this site and try again.');
        } else if (error.code === 'auth/cancelled-popup-request') {
            showError('Login cancelled. Please try again.');
        } else {
            showError(error.message);
        }
    }
}

// Load User Data from Firebase
async function loadUserData(user) {
    try {
        const userRef = db.ref(`users/${user.uid}`);
        const snapshot = await userRef.once('value');
        const userData = snapshot.val();

        if (!userData) {
            showError('Your account has not been set up yet. Contact IT Support at itsupport@dossaniparadise.com');
            auth.signOut();
            return;
        }

        // Check email domain (allow @dossaniparadise.com and one exception)
        const validDomains = ['@dossaniparadise.com', 'scroadmart@att.net'];
        const isValidEmail = validDomains.some(domain => 
            user.email.endsWith(domain) || user.email === domain
        );
        
        if (!isValidEmail) {
            showError('Only @dossaniparadise.com emails are allowed.');
            auth.signOut();
            return;
        }

        currentUser = {
            uid: user.uid,
            email: user.email,
            name: userData.name,
            role: userData.role,
            stores: userData.stores
        };

        showAppScreen();
    } catch (error) {
        console.error('Error loading user data:', error);
        showError('Error loading your account. Please try again.');
    }
}

// Logout
function logout() {
    auth.signOut();
}

// Show/Hide Screens
function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    
    // Update header
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userRole').textContent = currentUser.role;
}

function showError(message) {
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 8000);
}

// Store Selection
function filterStores() {
    const storeType = document.getElementById('storeType').value;
    const storeSelect = document.getElementById('storeSelect');
    
    storeSelect.innerHTML = '<option value="">Select a store...</option>';
    
    if (!storeType) return;

    // Filter stores by type
    const filteredStores = stores.filter(s => s.type === storeType);

    // Further filter by user permissions
    let userStores = filteredStores;
    if (currentUser.role !== 'Admin' && currentUser.stores !== 'all') {
        userStores = filteredStores.filter(s => currentUser.stores.includes(s.code));
    }

    // Sort alphabetically
    userStores.sort((a, b) => a.name.localeCompare(b.name));

    // Populate dropdown
    userStores.forEach(store => {
        const option = document.createElement('option');
        option.value = store.id;
        option.textContent = store.name;
        storeSelect.appendChild(option);
    });
}

function selectStore() {
    const storeId = document.getElementById('storeSelect').value;
    if (!storeId) {
        document.getElementById('actionButtons').classList.add('hidden');
        return;
    }

    selectedStore = stores.find(s => s.id === storeId);
    document.getElementById('actionButtons').classList.remove('hidden');
}

// Actions
function reportNewIssue() {
    if (!selectedStore) return;
    console.log('Report new issue at:', selectedStore.name);
    alert('Phase 2: New Issue Form - Coming Soon!\n\nSelected store: ' + selectedStore.name);
}

function checkExistingIssues() {
    if (!selectedStore) return;
    console.log('Check existing issues at:', selectedStore.name);
    alert('Phase 2: Existing Issues List - Coming Soon!\n\nSelected store: ' + selectedStore.name);
}
