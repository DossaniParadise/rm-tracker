// ============================================================
// USER DIRECTORY - Dossani Paradise Management
// ============================================================
// This file serves TWO purposes:
// 1. Reference doc for who should have what access
// 2. Auto-lookup table used by the admin panel when approving new users
//    (matches email → pre-fills name, role, stores)
//
// When someone signs in for the first time, they land in the pending queue.
// The admin panel checks this file to auto-fill their info. One click to approve.
//
// ROLES:
//   "Admin"       → sees all stores, can update ticket status, access admin panel
//   "Area Coach"  → sees assigned stores, can update ticket status
//   "Manager"     → sees their store only, can create tickets but NOT update status
//
// STORES:
//   "all"         → every store in stores-data.js (Admins only)
//   ["BK27082"]   → array of store codes (Area Coaches / multi-store Managers)
//   "BK27082"     → single store code string (single-store Managers)
// ============================================================

const USER_DIRECTORY = {
    // ADMINS
    "itsupport@dossaniparadise.com": { name: "IT Support", role: "Admin", stores: "all" },
    "armaan@dossaniparadise.com": { name: "Armaan Dossani", role: "Director", title: "VP", stores: "all" },
    "karim@dossaniparadise.com": { name: "Karim Dossani", role: "Director", title: "Dev", stores: "all" },
    "sam@dossaniparadise.com": { name: "Sam Merchant", role: "Director", title: "VP", stores: "all" },

    // REPAIR TECHNICIANS
    "rmtech1@dossaniparadise.com": { name: "Ronny Gossett", role: "Technician", stores: "all" },
    "rmtech2@dossaniparadise.com": { name: "Ravay Wickware", role: "Technician", stores: "all" },
    "rmtech3@dossaniparadise.com": { name: "Zamir Rios", role: "Technician", stores: "all" },

    // AREA COACHES
    "rick@dossaniparadise.com": { name: "Rick Tharani", role: "Director", title: "Director", stores: ["PQS05","PQS06","PQS07","PQS08","PQS09","PQS10","PQS11","PQS12","PQS13","PQS15","PQS16","NASH01"] },
    "paul@dossaniparadise.com": { name: "Paul Fernandez", role: "Director", title: "Director", stores: ["BK22027","BK27082","BK27083","BK28626","BK28514","BK27084","BK26183","BK03675","BK27028","BK26924","BK28313","BK04851","BK09723","BK13192","BK06460","BK28174","BK24875","BK27958","BK25198","BK20671","BK28312","BK28683","BK27415","BK23086","BK11460","BK02390","BK24008","BK10358","BK26015","SUB22"] },
    "vishal@dossaniparadise.com": { name: "Vishal Chhetri", role: "Area Coach", stores: ["7EL01","PQS01","PQS02","PQS03","PQS04","PQS14","CW001","CW002"] },
    "jennifer@dossaniparadise.com": { name: "Jennifer Sanders", role: "Area Coach", stores: ["PQS05","PQS06","PQS07","PQS08","PQS09","PQS10","PQS11","PQS13","PQS15","PQS16"] },
    "dane@dossaniparadise.com": { name: "Dane Martin", role: "Area Coach", stores: ["BK23086","BK11460","BK26015","BK10358","BK24008","BK02390","SUB22"] },
    "steve@dossaniparadise.com": { name: "Steve Cardone", role: "Area Coach", stores: ["BK28174","BK04851","BK09723"] },
    "claudia@dossaniparadise.com": { name: "Claudia Fernandez", role: "Area Coach", stores: ["BK20671","BK06460","BK13192","BK27958","BK24875","BK25198"] },
    "elizabeth@dossaniparadise.com": { name: "Elizabeth Cruz", role: "Area Coach", stores: ["BK27415","BK28312","BK28683"] },
    "waleska@dossaniparadise.com": { name: "Waleska Rios", role: "Area Coach", stores: ["BK26924","BK28313","BK26183","BK03675","BK27028","BK27084"] },
    "pedro@dossaniparadise.com": { name: "Pedro Alcantar", role: "Area Coach", stores: ["BK22027","BK27082","BK27083","BK28626","BK28514"] },

    // MANAGERS - Burger King
    "BKAlvord22027@dossaniparadise.com": { name: "BK Alvord Manager", role: "Manager", stores: "BK22027" },
    "BKAlliance27082@dossaniparadise.com": { name: "BK Alliance Manager", role: "Manager", stores: "BK27082" },
    "BKAzle27083@dossaniparadise.com": { name: "BK Azle Manager", role: "Manager", stores: "BK27083" },
    "BKBaileyBoswell28626@dossaniparadise.com": { name: "BK Bailey Boswell Manager", role: "Manager", stores: "BK28626" },
    "BKBonham11460@dossaniparadise.com": { name: "BK Bonham Manager", role: "Manager", stores: "BK11460" },
    "BKCorinth26924@dossaniparadise.com": { name: "BK Corinth Manager", role: "Manager", stores: "BK26924" },
    "BKCrossroads28313@dossaniparadise.com": { name: "BK Crossroads Manager", role: "Manager", stores: "BK28313" },
    "BKDenton26183@dossaniparadise.com": { name: "BK Denton 26183 Manager", role: "Manager", stores: "BK26183" },
    "BKDenton3675@dossaniparadise.com": { name: "BK Denton 3675 Manager", role: "Manager", stores: "BK03675" },
    "BKGainesville27028@dossaniparadise.com": { name: "BK Gainesville Manager", role: "Manager", stores: "BK27028" },
    "BKGreenville20671@dossaniparadise.com": { name: "BK Greenville Manager", role: "Manager", stores: "BK20671" },
    "BKHooks26015@dossaniparadise.com": { name: "BK Hooks Manager", role: "Manager", stores: "BK26015" },
    "BKKaufman27415@dossaniparadise.com": { name: "BK Kaufman Manager", role: "Manager", stores: "BK27415" },
    "BKMcKinney6460@dossaniparadise.com": { name: "BK McKinney Manager", role: "Manager", stores: "BK06460" },
    "BKMelissa28174@dossaniparadise.com": { name: "BK Melissa Manager", role: "Manager", stores: "BK28174" },
    "BKMesquite28312@dossaniparadise.com": { name: "BK Mesquite Manager", role: "Manager", stores: "BK28312" },
    "BKMidlothian28514@dossaniparadise.com": { name: "BK Midlothian Manager", role: "Manager", stores: "BK28514" },
    "BKNash10358@dossaniparadise.com": { name: "BK Nash Manager", role: "Manager", stores: "BK10358" },
    "BKNB24008@dossaniparadise.com": { name: "BK New Boston Manager", role: "Manager", stores: "BK24008" },
    "BKParis2390@dossaniparadise.com": { name: "BK Paris Manager", role: "Manager", stores: "BK02390" },
    "BKPlano4851@dossaniparadise.com": { name: "BK Plano Coit Manager", role: "Manager", stores: "BK04851" },
    "BKPlano13192@dossaniparadise.com": { name: "BK Plano Ohio Manager", role: "Manager", stores: "BK13192" },
    "BKQuinlan27958@dossaniparadise.com": { name: "BK Quinlan Manager", role: "Manager", stores: "BK27958" },
    "BKRoysecity24875@dossaniparadise.com": { name: "BK Royse City Manager", role: "Manager", stores: "BK24875" },
    "BKSaginaw27084@dossaniparadise.com": { name: "BK Saginaw Manager", role: "Manager", stores: "BK27084" },
    "BKSunnyvale28683@dossaniparadise.com": { name: "BK Sunnyvale Manager", role: "Manager", stores: "BK28683" },
    "BKTerrell25198@dossaniparadise.com": { name: "BK Terrell Manager", role: "Manager", stores: "BK25198" },
    "BKColony9723@dossaniparadise.com": { name: "BK Colony Manager", role: "Manager", stores: "BK09723" },
    "BKAtlanta23086@dossaniparadise.com": { name: "BK Atlanta Manager", role: "Manager", stores: "BK23086" },

    // MANAGERS - Subway
    "Subway22411@dossaniparadise.com": { name: "Subway Manager", role: "Manager", stores: "SUB22" },

    // MANAGERS - Paradise QS
    "PQS1@dossaniparadise.com": { name: "PQS 01 Manager", role: "Manager", stores: "PQS01" },
    "PQS2@dossaniparadise.com": { name: "PQS 02 Manager", role: "Manager", stores: "PQS02" },
    "PQS3@dossaniparadise.com": { name: "PQS 03 Manager", role: "Manager", stores: "PQS03" },
    "PQS4@dossaniparadise.com": { name: "PQS 04 Manager", role: "Manager", stores: "PQS04" },
    "PQS5@dossaniparadise.com": { name: "PQS 05 Manager", role: "Manager", stores: "PQS05" },
    "PQS6@dossaniparadise.com": { name: "PQS 06 Manager", role: "Manager", stores: "PQS06" },
    "PQS7@dossaniparadise.com": { name: "PQS 07 Manager", role: "Manager", stores: "PQS07" },
    "PQS8@dossaniparadise.com": { name: "PQS 08 Manager", role: "Manager", stores: "PQS08" },
    "PQS9@dossaniparadise.com": { name: "PQS 09 Manager", role: "Manager", stores: "PQS09" },
    "PQS10@dossaniparadise.com": { name: "PQS 10 Manager", role: "Manager", stores: "PQS10" },
    "PQS11@dossaniparadise.com": { name: "PQS 11 Manager", role: "Manager", stores: "PQS11" },
    "PQS12@dossaniparadise.com": { name: "PQS 12 Manager", role: "Manager", stores: "PQS12" },
    "betty@dossaniparadise.com": { name: "Betty Wilson", role: "Manager", stores: "PQS12" },
    "PQS13@dossaniparadise.com": { name: "PQS 13 Manager", role: "Manager", stores: "PQS13" },
    "PQS14@dossaniparadise.com": { name: "PQS 14 Manager", role: "Manager", stores: "PQS14" },
    "PQS15@dossaniparadise.com": { name: "PQS 15 Manager", role: "Manager", stores: "PQS15" },
    "PQS16@dossaniparadise.com": { name: "PQS 16 Manager", role: "Manager", stores: "PQS16" },

    // MANAGERS - Other
    "711RF@dossaniparadise.com": { name: "7-Eleven Manager", role: "Manager", stores: "7EL01" },
    "scroadmart@att.net": { name: "Nashville Store Manager", role: "Manager", stores: "NASH01" },
    "ScarboroughCW@dossaniparadise.com": { name: "Car Wash Manager", role: "Manager", stores: "CW001" },
    "ScarboroughTS@dossaniparadise.com": { name: "Travel Stop Manager", role: "Manager", stores: "CW002" }
};

function getDirectoryProfileByEmail(email) {
    if (!email) return null;
    return USER_DIRECTORY[String(email).toLowerCase()] || null;
}

function getDirectoryTitleByEmail(email, fallback = '') {
    const profile = getDirectoryProfileByEmail(email);
    return (profile && profile.title) ? profile.title : fallback;
}
