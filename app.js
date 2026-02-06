// Main Application Logic - SIMPLIFIED VERSION

let currentUser = null;
let selectedStore = null;

// Auth State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        console.log('User signed in:', user.email);
        await loadUserData(user);
    } else {
        // Check if returning from email link
        if (auth.isSignInWithEmailLink(window.location.href)) {
            handleEmailLinkSignIn();
        } else {
            showLoginScreen();
        }
    }
});

// Send passwordless sign-in email
async function sendSignInLink() {
    const email = document.getElementById('loginEmail').value;
    
    if (!email) {
        showError('Please enter your email address');
        return;
    }
    
    // Validate email domain
    if (!email.endsWith('@dossaniparadise.com') && email !== 'scroadmart@att.net') {
        showError('Only @dossaniparadise.com emails are allowed');
        return;
    }
    
    const actionCodeSettings = {
        url: window.location.href, // This page
        handleCodeInApp: true
    };
    
    try {
        await auth.sendSignInLinkToEmail(email, actionCodeSettings);
        // Save email to localStorage to complete sign-in
        window.localStorage.setItem('emailForSignIn', email);
        
        // Show success message
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('emailSentMessage').classList.remove('hidden');
        document.getElementById('sentToEmail').textContent = email;
    } catch (error) {
        console.error('Error sending email:', error);
        if (error.code === 'auth/invalid-email') {
            showError('Invalid email address');
        } else {
            showError('Error sending sign-in email. Please try again.');
        }
    }
}

// Handle sign-in from email link
async function handleEmailLinkSignIn() {
    // Get email from localStorage
    let email = window.localStorage.getItem('emailForSignIn');
    
    if (!email) {
        // User opened link on different device or cleared storage
        // Use browser prompt as fallback
        email = window.prompt('Please confirm your email address:');
    }
    
    if (!email) {
        showError('Email required to complete sign-in');
        showLoginScreen();
        return;
    }
    
    try {
        const result = await auth.signInWithEmailLink(email, window.location.href);
        
        // Clear saved email and URL params
        window.localStorage.removeItem('emailForSignIn');
        window.history.replaceState({}, document.title, window.location.pathname);
        
        console.log('Email link sign-in successful:', result.user.email);
        
        // loadUserData will be called by onAuthStateChanged
    } catch (error) {
        console.error('Error signing in with email link:', error);
        
        // Show appropriate error
        if (error.code === 'auth/invalid-action-code') {
            showError('This sign-in link has expired or has already been used. Please request a new one.');
        } else if (error.code === 'auth/invalid-email') {
            showError('Invalid email address. Please try again.');
        } else if (error.code === 'auth/user-disabled') {
            showError('This account has been disabled. Contact IT Support.');
        } else {
            showError('Error completing sign-in: ' + error.message);
        }
        
        // Clear the URL and show login form
        window.history.replaceState({}, document.title, window.location.pathname);
        showLoginScreen();
    }
}

// Resend email link
function resendEmail() {
    document.getElementById('emailSentMessage').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
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
    // Show error for 10 seconds (longer for important messages)
    setTimeout(() => errorEl.classList.add('hidden'), 10000);
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
