// ============================================================
// STORES DATA - Dossani Paradise Management
// id, name, code, type, brand, lat, lng, address
// brand values: bk, sub, pqs, 711, nash, cw
// ============================================================
const stores = [
    // BURGER KING - 29 stores
    {id:"BK22027",name:"Burger King Alvord 22027",code:"BK22027",type:"fastfood",brand:"bk",lat:33.3925543,lng:-97.7297886,address:"8417 N.US Hwy 287, Alvord, TX 76225"},
    {id:"BK27082",name:"Burger King Alliance/TMS 27082",code:"BK27082",type:"fastfood",brand:"bk",lat:33.0252883,lng:-97.2760128,address:"15933 North Freeway, Fort Worth, TX 76177"},
    {id:"BK27083",name:"Burger King Azle 27083",code:"BK27083",type:"fastfood",brand:"bk",lat:32.9103543,lng:-97.5440232,address:"1001 Boyd Road, Azle, TX 76020"},
    {id:"BK28626",name:"Burger King Bailey Boswell 28626",code:"BK28626",type:"fastfood",brand:"bk",lat:32.8804702,lng:-97.3928522,address:"4541 W. Bailey Boswell, Fort Worth, TX 76179"},
    {id:"BK11460",name:"Burger King Bonham 11460",code:"BK11460",type:"fastfood",brand:"bk",lat:33.5930631,lng:-96.192829,address:"1801 North, TX-121, Bonham, TX 75418"},
    {id:"BK26924",name:"Burger King Corinth 26924",code:"BK26924",type:"fastfood",brand:"bk",lat:33.1323896,lng:-97.0414887,address:"8001 S. Interstate 35 E, Corinth, TX 76210"},
    {id:"BK28313",name:"Burger King Cross Roads 28313",code:"BK28313",type:"fastfood",brand:"bk",lat:33.2241299,lng:-96.9820109,address:"11881 US-380, Cross Roads, TX 76227"},
    {id:"BK26183",name:"Burger King Denton 26183",code:"BK26183",type:"fastfood",brand:"bk",lat:33.2292022,lng:-97.159802,address:"2215 West University Drive, Denton, TX 76201"},
    {id:"BK03675",name:"Burger King Denton 3675",code:"BK03675",type:"fastfood",brand:"bk",lat:33.1869188,lng:-97.1066459,address:"2233 S Loop 288, Denton, TX 76205"},
    {id:"BK27028",name:"Burger King Gainesville 27028",code:"BK27028",type:"fastfood",brand:"bk",lat:33.641515,lng:-97.1579193,address:"1711 North I-35, Gainesville, TX 76240"},
    {id:"BK20671",name:"Burger King Greenville 20671",code:"BK20671",type:"fastfood",brand:"bk",lat:33.0953616,lng:-96.1072047,address:"7315 I-30 Frontage Rd, Greenville, TX 75402"},
    {id:"BK26015",name:"Burger King Hooks 26015",code:"BK26015",type:"fastfood",brand:"bk",lat:33.4674733,lng:-94.2366504,address:"580 Lone Star Dr., Hooks, TX 75561"},
    {id:"BK27415",name:"Burger King Kaufman 27415",code:"BK27415",type:"fastfood",brand:"bk",lat:32.6488448,lng:-96.5413512,address:"700 E. Highway 175, Kaufman, TX 75142"},
    {id:"BK06460",name:"Burger King McKinney 6460",code:"BK06460",type:"fastfood",brand:"bk",lat:33.2169105,lng:-96.6320383,address:"1700 W. University Dr, McKinney, TX 75069"},
    {id:"BK28174",name:"Burger King Melissa 28174",code:"BK28174",type:"fastfood",brand:"bk",lat:33.2834364,lng:-96.56246,address:"2651 Sam Rayburn Hwy, Melissa, TX 75454"},
    {id:"BK28312",name:"Burger King Mesquite 28312",code:"BK28312",type:"fastfood",brand:"bk",lat:32.7938775,lng:-96.6116061,address:"2104 N Galloway Ave, Mesquite, TX 75150"},
    {id:"BK28514",name:"Burger King Midlothian 28514",code:"BK28514",type:"fastfood",brand:"bk",lat:32.4600926,lng:-96.9959456,address:"2251 FM 663, Midlothian, TX 76065"},
    {id:"BK10358",name:"Burger King Nash 10358",code:"BK10358",type:"fastfood",brand:"bk",lat:33.4525178,lng:-94.1301793,address:"1970 N. Kings Hwy, Nash, TX 75569"},
    {id:"BK24008",name:"Burger King New Boston 24008",code:"BK24008",type:"fastfood",brand:"bk",lat:33.4763206,lng:-94.4088946,address:"900 N. McCoy Blvd., New Boston, TX 75570"},
    {id:"BK02390",name:"Burger King Paris 2390",code:"BK02390",type:"fastfood",brand:"bk",lat:33.660776,lng:-95.5103595,address:"3590 Lamar, Paris, TX 75460"},
    {id:"BK04851",name:"Burger King Plano (Coit) 4851",code:"BK04851",type:"fastfood",brand:"bk",lat:33.0284064,lng:-96.7706873,address:"2009 Coit Rd, Plano, TX 75075"},
    {id:"BK13192",name:"Burger King Plano (Ohio) 13192",code:"BK13192",type:"fastfood",brand:"bk",lat:33.0978387,lng:-96.7961826,address:"8720 Ohio Dr, Plano, TX 75024"},
    {id:"BK27958",name:"Burger King Quinlan 27958",code:"BK27958",type:"fastfood",brand:"bk",lat:32.9054312,lng:-96.1276293,address:"8909 State Highway 34 South, Quinlan, TX 75474"},
    {id:"BK24875",name:"Burger King Royse City 24875",code:"BK24875",type:"fastfood",brand:"bk",lat:32.9661228,lng:-96.3390095,address:"440 W. Interstate 30, Royse City, TX 75189"},
    {id:"BK27084",name:"Burger King Saginaw 27084",code:"BK27084",type:"fastfood",brand:"bk",lat:32.8681978,lng:-97.341787,address:"6960 N Blue Mound Road, Fort Worth, TX 76131"},
    {id:"BK28683",name:"Burger King Sunnyvale 28683",code:"BK28683",type:"fastfood",brand:"bk",lat:32.7832645,lng:-96.5601677,address:"480 US Hwy 80, Sunnyvale, TX 75182"},
    {id:"BK25198",name:"Burger King Terrell 25198",code:"BK25198",type:"fastfood",brand:"bk",lat:32.739396,lng:-96.2920632,address:"1204 W. Moore Avenue, Terrell, TX 75160"},
    {id:"BK09723",name:"Burger King The Colony 9723",code:"BK09723",type:"fastfood",brand:"bk",lat:33.0674516,lng:-96.8893989,address:"3700 Main St, The Colony, TX 75056"},
    {id:"BK23086",name:"Burger King Atlanta 23086",code:"BK23086",type:"fastfood",brand:"bk",lat:33.1178617,lng:-94.181756,address:"299 U.S. 59, Atlanta, TX 75551"},
    // SUBWAY
    {id:"SUB22",name:"Subway Texarkana 22411",code:"SUB22",type:"fastfood",brand:"sub",lat:33.4190104,lng:-94.0941756,address:"4103 W, 7th St., Texarkana, TX 75503"},
    // PARADISE QS - 16 stores
    {id:"PQS01",name:"Paradise QS #01 - Sun Valley",code:"PQS01",type:"cstore",brand:"pqs",lat:32.6795074,lng:-97.2398344,address:"5401 Sun Valley Dr., Fort Worth, TX 76119"},
    {id:"PQS02",name:"Paradise QS #02 - Lewisville",code:"PQS02",type:"cstore",brand:"pqs",lat:32.9906715,lng:-96.9780407,address:"521 E. Hwy 121, Lewisville, TX 75057"},
    {id:"PQS03",name:"Paradise QS #03 - Grapevine",code:"PQS03",type:"cstore",brand:"pqs",lat:32.9413343,lng:-97.0731222,address:"513 E. Northwest Hwy, Grapevine, TX 76051"},
    {id:"PQS04",name:"Paradise QS #04 - Alvord",code:"PQS04",type:"cstore",brand:"pqs",lat:33.3927543,lng:-97.7297886,address:"8417 N. US Hwy 287, Alvord, TX 76225"},
    {id:"PQS05",name:"Paradise QS #05 - Hope",code:"PQS05",type:"cstore",brand:"pqs",lat:33.6646746,lng:-93.6003814,address:"901 W. 3rd St., Hope, AR 71801"},
    {id:"PQS06",name:"Paradise QS #06 - Nash",code:"PQS06",type:"cstore",brand:"pqs",lat:33.4521178,lng:-94.1301793,address:"1970 N. Kings Hwy, Nash, TX 75569"},
    {id:"PQS07",name:"Paradise QS #07 - 7th St",code:"PQS07",type:"cstore",brand:"pqs",lat:33.4184104,lng:-94.0941756,address:"4103 W, 7th St., Texarkana, TX 75501"},
    {id:"PQS08",name:"Paradise QS #08 - Ashdown",code:"PQS08",type:"cstore",brand:"pqs",lat:33.6625838,lng:-94.1192361,address:"950 S. Constitution Avenue, Ashdown, AR 71822"},
    {id:"PQS09",name:"Paradise QS #09 - New Boston Rd",code:"PQS09",type:"cstore",brand:"pqs",lat:33.4403875,lng:-94.0875947,address:"3400 New Boston Rd., Texarkana, TX 75501"},
    {id:"PQS10",name:"Paradise QS #10 - Texas Blvd",code:"PQS10",type:"cstore",brand:"pqs",lat:33.448522,lng:-94.0527795,address:"3300 Texas Blvd, Texarkana, TX 75503"},
    {id:"PQS11",name:"Paradise QS #11 - New Boston City",code:"PQS11",type:"cstore",brand:"pqs",lat:33.4757206,lng:-94.4088946,address:"900 N. McCoy Blvd., New Boston, TX 75570"},
    {id:"PQS12",name:"Paradise QS #12 - Summerhill",code:"PQS12",type:"cstore",brand:"pqs",lat:33.4630376,lng:-94.0661119,address:"4621 Summerhill Rd., Texarkana, TX 75503"},
    {id:"PQS13",name:"Paradise QS #13 - Hooks",code:"PQS13",type:"cstore",brand:"pqs",lat:33.4668733,lng:-94.2366504,address:"580 Lone Star Dr., Hooks, TX 75561"},
    {id:"PQS14",name:"Paradise QS #14 - White Settlement",code:"PQS14",type:"cstore",brand:"pqs",lat:32.7589535,lng:-97.4917004,address:"9913 White Settlement Rd., Fort Worth, TX 76108"},
    {id:"PQS15",name:"Paradise QS #15 - Pittsburg",code:"PQS15",type:"cstore",brand:"pqs",lat:33.0094559,lng:-94.9644747,address:"635 Mt Pleasant Street, Pittsburg, TX 75686"},
    {id:"PQS16",name:"Paradise QS #16 - MT Pleasant",code:"PQS16",type:"cstore",brand:"pqs",lat:33.1772915,lng:-94.9708888,address:"2011 North Jefferson Ave., Mt. Pleasant, TX 75455"},
    // 7-ELEVEN
    {id:"7EL01",name:"7-Eleven Riverfront",code:"7EL01",type:"cstore",brand:"711",lat:32.7654016,lng:-96.8034512,address:"1005 S. Riverfront Blvd., Dallas, TX 75207"},
    // NASHVILLE
    {id:"NASH01",name:"Nashville Store",code:"NASH01",type:"cstore",brand:"nash",lat:33.9450,lng:-93.8400,address:"502 E. Mine, Nashville, AR 71852"},
    // CAR WASH
    {id:"CW001",name:"Scarborough Car Wash",code:"CW001",type:"carwash",brand:"cw",lat:32.3741146,lng:-96.8662758,address:"1448 FM 66, Waxahachie, TX 75167"},
    {id:"CW002",name:"Scarborough Travel Stop",code:"CW002",type:"cstore",brand:"pqs",lat:32.3782774,lng:-96.7708138,address:"3298 S Interstate Hwy 35 E, Waxahachie, TX 75165"},
];
