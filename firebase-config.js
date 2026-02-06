// Firebase Configuration
// EDIT THIS FILE: When Firebase credentials change

const firebaseConfig = {
    apiKey: "AIzaSyDf0W5a8UPpuZbo873nWfed6VvNExL4BjM",
    authDomain: "dossani-paradise-rm-tracker.firebaseapp.com",
    databaseURL: "https://dossani-paradise-rm-tracker-default-rtdb.firebaseio.com",
    projectId: "dossani-paradise-rm-tracker",
    storageBucket: "dossani-paradise-rm-tracker.firebasestorage.app",
    messagingSenderId: "328034984226",
    appId: "1:328034984226:web:2b2ddb58d935bec201857b"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const storage = firebase.storage();
