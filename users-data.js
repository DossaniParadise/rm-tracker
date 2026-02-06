// USER PERMISSIONS - Edit this file when users change roles/stores
// This is a REFERENCE file - actual permissions are in Firebase Database
// Use this to track who should have what access, then update Firebase accordingly

const userPermissions = {
    // ADMINS - See everything
    admins: [
        "itsupport@dossaniparadise.com",
        "armaan@dossaniparadise.com", 
        "karim@dossaniparadise.com",
        "sam@dossaniparadise.com"
    ],

    // AREA COACHES - See multiple stores
    areaCoaches: {
        "rick@dossaniparadise.com": ["PQS05", "PQS06", "PQS07", "PQS08", "PQS09", "PQS10", "PQS11", "PQS12", "PQS13", "PQS15", "PQS16", "NASH01"],
        "paul@dossaniparadise.com": ["BK22027", "BK27082", "BK27083", "BK28626", "BK28514", "BK27084", "BK26183", "BK03675", "BK27028", "BK26924", "BK28313", "BK04851", "BK09723", "BK13192", "BK06460", "BK28174", "BK24875", "BK27958", "BK25198", "BK20671", "BK28312", "BK28683", "BK27415", "BK23086", "BK11460", "BK02390", "BK24008", "BK10358", "BK26015", "SUB22"],
        "vishal@dossaniparadise.com": ["7EL01", "PQS01", "PQS02", "PQS03", "PQS04", "PQS14", "CW001", "CW002"],
        "jennifer@dossaniparadise.com": ["PQS05", "PQS06", "PQS07", "PQS08", "PQS09", "PQS10", "PQS11", "PQS13", "PQS15", "PQS16"],
        "dane@dossaniparadise.com": ["BK23086", "BK11460", "BK26015", "BK10358", "BK24008", "BK02390", "SUB22"],
        "steve@dossaniparadise.com": ["BK28174", "BK04851", "BK09723"],
        "claudia@dossaniparadise.com": ["BK20671", "BK06460", "BK13192", "BK27958", "BK24875", "BK25198"],
        "elizabeth@dossaniparadise.com": ["BK27415", "BK28312", "BK28683"],
        "waleska@dossaniparadise.com": ["BK26924", "BK28313", "BK26183", "BK03675", "BK27028", "BK27084"],
        "pedro@dossaniparadise.com": ["BK22027", "BK27082", "BK27083", "BK28626", "BK28514"]
    },

    // MANAGERS - See only 1 store
    managers: {
        // Burger King Managers
        "BKAlliance27082@dossaniparadise.com": "BK27082",
        "BKAzle27083@dossaniparadise.com": "BK27083",
        "BKBaileyBoswell28626@dossaniparadise.com": "BK28626",
        "BKAlvord22027@dossaniparadise.com": "BK22027",
        "BKAtlanta23086@dossaniparadise.com": "BK23086",
        "BKBonham11460@dossaniparadise.com": "BK11460",
        "BKCorinth26924@dossaniparadise.com": "BK26924",
        "BKCrossroads28313@dossaniparadise.com": "BK28313",
        "BKDenton26183@dossaniparadise.com": "BK26183",
        "BKDenton3675@dossaniparadise.com": "BK03675",
        "BKGainesville27028@dossaniparadise.com": "BK27028",
        "BKGreenville20671@dossaniparadise.com": "BK20671",
        "BKHooks26015@dossaniparadise.com": "BK26015",
        "BKKaufman27415@dossaniparadise.com": "BK27415",
        "BKMcKinney6460@dossaniparadise.com": "BK06460",
        "BKMelissa28174@dossaniparadise.com": "BK28174",
        "BKMesquite28312@dossaniparadise.com": "BK28312",
        "BKMidlothian28514@dossaniparadise.com": "BK28514",
        "BKNash10358@dossaniparadise.com": "BK10358",
        "BKNB24008@dossaniparadise.com": "BK24008",
        "BKParis2390@dossaniparadise.com": "BK02390",
        "BKPlano4851@dossaniparadise.com": "BK04851",
        "BKPlano13192@dossaniparadise.com": "BK13192",
        "BKQuinlan27958@dossaniparadise.com": "BK27958",
        "BKRoysecity24875@dossaniparadise.com": "BK24875",
        "BKSaginaw27084@dossaniparadise.com": "BK27084",
        "BKSunnyvale28683@dossaniparadise.com": "BK28683",
        "BKTerrell25198@dossaniparadise.com": "BK25198",
        "BKColony9723@dossaniparadise.com": "BK09723",
        
        // Subway Manager
        "Subway22411@dossaniparadise.com": "SUB22",
        
        // Paradise QS Managers
        "PQS1@dossaniparadise.com": "PQS01",
        "PQS2@dossaniparadise.com": "PQS02",
        "PQS3@dossaniparadise.com": "PQS03",
        "PQS4@dossaniparadise.com": "PQS04",
        "PQS5@dossaniparadise.com": "PQS05",
        "PQS6@dossaniparadise.com": "PQS06",
        "PQS7@dossaniparadise.com": "PQS07",
        "PQS8@dossaniparadise.com": "PQS08",
        "PQS9@dossaniparadise.com": "PQS09",
        "PQS10@dossaniparadise.com": "PQS10",
        "PQS11@dossaniparadise.com": "PQS11",
        "PQS12@dossaniparadise.com": "PQS12",
        "betty@dossaniparadise.com": "PQS12", // Betty also manager of PQS12
        "PQS13@dossaniparadise.com": "PQS13",
        "PQS14@dossaniparadise.com": "PQS14",
        "PQS15@dossaniparadise.com": "PQS15",
        "PQS16@dossaniparadise.com": "PQS16",
        
        // Other Managers
        "711RF@dossaniparadise.com": "7EL01",
        "scroadmart@att.net": "NASH01",
        "ScarboroughCW@dossaniparadise.com": "CW001",
        "ScarboroughTS@dossaniparadise.com": "CW002"
    }
};

// NOTE: This file is for reference only
// To actually update permissions, go to Firebase Console → Realtime Database → /users
// See MAINTENANCE-GUIDE.md for instructions
