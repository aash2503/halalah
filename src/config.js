/* ==========================================================================
   CONFIG — every constant in one place.
   --------------------------------------------------------------------------
   The Supabase anon key is a PUBLISHABLE key and is meant to ship in client
   code: RLS allows reads and rejects writes (an anon INSERT fails with
   Postgres 42501). Never put a service_role / sb_secret_ key here.
   Source: MUIS, Singapore's official halal certification authority.
   ========================================================================== */

export const SUPABASE_URL = "https://svnagkwvpenklcgbwrvc.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_mjSnbuRQx_Wm9vTCTLjFzA_MZXbdMpz";
export const SB_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
export const PAGE_SIZE = 1000;   // PostgREST silently caps at 1000 — must page with Range

export const SELECT_COLS = "id,name,cert_number,scheme,sub_scheme,scheme_text,sub_scheme_text," +
                    "est_type,address,postal,logo,lat,lng,last_synced_at";

export const DB_NAME = 'halalah', STORE = 'cache', CACHE_KEY = 'establishments';

export const SUB_SCHEME = {
  103:{ label:"HAWKER", color:"#78C850" }, 106:{ label:"RESTAURANT", color:"#F08030" },
  108:{ label:"BAKERY", color:"#F85888" }, 202:{ label:"CATERER", color:"#7038F8" },
  201:{ label:"KITCHEN", color:"#6890F0" }, 109:{ label:"CANTEEN", color:"#A040A0" },
  105:{ label:"FOOD STN", color:"#d8b310" }, 101:{ label:"CANTEEN", color:"#C03028" },
  104:{ label:"KIOSK", color:"#E0C068" }, 102:{ label:"HALAL SECT", color:"#8f8fa8" },
};

export const SCHEME_EAT = 100, SCHEME_PREP = 200;

export const GENERIC_NAMES = new Set([
  'CHICKEN RICE','YONG TAU FOO','MALAY KITCHEN','MALAY CUISINE','STAFF CANTEEN',
  'STAFF CANTEEN STALL','MIXED RICE','NASI PADANG','MUSLIM FOOD','HALAL FOOD',
  'FOOD COURT','MINI MART','DRINKS STALL','MUSLIM STALL','INDIAN MUSLIM FOOD',
  'FUSION WESTERN CUISINE','WESTERN FOOD','NOODLE HOUSE','ECONOMIC RICE',
]);

export const GAZETTEER = [
  ["ANG MO KIO",1.3691,103.8454],["BEDOK",1.3236,103.9273],["BISHAN",1.3526,103.8352],
  ["BOON LAY",1.3382,103.7060],["BUKIT BATOK",1.3590,103.7637],["BUKIT MERAH",1.2819,103.8239],
  ["BUKIT PANJANG",1.3774,103.7719],["BUKIT TIMAH",1.3294,103.8021],["CITY / CBD",1.2870,103.8510],
  ["CHANGI",1.3450,103.9832],["CHANGI AIRPORT",1.3592,103.9894],["CHOA CHU KANG",1.3840,103.7470],
  ["CLEMENTI",1.3162,103.7649],["GEYLANG",1.3180,103.8870],["HOUGANG",1.3612,103.8863],
  ["JURONG EAST",1.3329,103.7436],["JURONG WEST",1.3404,103.7090],["KALLANG",1.3100,103.8710],
  ["MARINE PARADE",1.3020,103.8970],["NOVENA",1.3203,103.8438],["PASIR RIS",1.3721,103.9474],
  ["PAYA LEBAR",1.3175,103.8926],["PUNGGOL",1.3984,103.9072],["QUEENSTOWN",1.2946,103.7860],
  ["SEMBAWANG",1.4491,103.8185],["SENGKANG",1.3868,103.8914],["SERANGOON",1.3554,103.8679],
  ["TAMPINES",1.3496,103.9568],["TOA PAYOH",1.3343,103.8563],["WOODLANDS",1.4382,103.7890],
  ["YISHUN",1.4304,103.8354],["ORCHARD",1.3048,103.8318],["MARINA BAY",1.2830,103.8600],
  ["BUGIS",1.3006,103.8555],["CHINATOWN",1.2838,103.8434],["LITTLE INDIA",1.3067,103.8494],
  ["HARBOURFRONT",1.2653,103.8220],["SENTOSA",1.2494,103.8303],["TANJONG PAGAR",1.2764,103.8449],
  ["RAFFLES PLACE",1.2836,103.8515],["CITY HALL",1.2931,103.8520],["SOMERSET",1.3006,103.8386],
  ["DHOBY GHAUT",1.2993,103.8455],["EAST COAST",1.3010,103.9260],["KATONG",1.3050,103.9020],
  ["JOO CHIAT",1.3120,103.9020],["TIONG BAHRU",1.2860,103.8270],["HOLLAND VILLAGE",1.3110,103.7960],
  ["BUONA VISTA",1.3070,103.7900],["ONE NORTH",1.2990,103.7870],["TUAS",1.3210,103.6530],
  ["SELETAR",1.4130,103.8690],["ADMIRALTY",1.4406,103.8010],["MARSILING",1.4327,103.7740],
  ["KRANJI",1.4250,103.7620],["LAVENDER",1.3070,103.8630],["ROCHOR",1.3030,103.8520],
  ["NEWTON",1.3120,103.8380],["MACPHERSON",1.3266,103.8898],["UBI",1.3300,103.8990],
  ["EUNOS",1.3197,103.9030],["KEMBANGAN",1.3210,103.9130],["SIMEI",1.3434,103.9530],
  ["TANAH MERAH",1.3272,103.9464],["EXPO",1.3345,103.9615],["WEST COAST",1.2960,103.7620],
  ["PIONEER",1.3375,103.6970],["LAKESIDE",1.3444,103.7208],["REDHILL",1.2897,103.8168],
  ["COMMONWEALTH",1.3025,103.7983],["FARRER PARK",1.3125,103.8540],["BOON KENG",1.3196,103.8615],
  ["POTONG PASIR",1.3313,103.8687],["BRADDELL",1.3404,103.8467],["MARYMOUNT",1.3491,103.8395],
  ["BOTANIC GARDENS",1.3222,103.8157],["BEAUTY WORLD",1.3415,103.7758],["HILLVIEW",1.3625,103.7676],
].map(([name,lat,lng]) => ({ name, lat, lng, kind:'area' }));

export const REGIONS = [
  { key:"CENTRAL", icon:"🏙", label:"CENTRAL" }, { key:"EAST", icon:"🌊", label:"EAST" },
  { key:"WEST", icon:"🏭", label:"WEST" },       { key:"NORTH", icon:"🌳", label:"NORTH" },
];

export const BADGE_REQ = 5;

export const RANKS = [[0,'NEW IN TOWN'],[5,'MAKAN SCOUT'],[15,'KAKI EXPLORER'],[30,'HAWKER VETERAN'],
               [60,'MAKAN MASTER'],[120,'HALAL LEGEND']];

export const QUEST_POOL = [
  { cat:'103', text:'VISIT A HAWKER STALL' }, { cat:'106', text:'VISIT A RESTAURANT' },
  { cat:'108', text:'VISIT A BAKERY' },       { cat:null,  text:'LOG 3 NEW SPOTS' },
  { cat:null,  text:'CLEAR ANY 2 SPOTS IN ONE VENUE' },
];

export const SAVE_KEY = "halalah.save.v3";

export const ZONE_BOXES = {
  NORTH:{ bounds:[[1.400,103.630],[1.470,103.999]], color:"#10B981" },
  EAST:{ bounds:[[1.235,103.900],[1.400,104.010]], color:"#3B82F6" },
  WEST:{ bounds:[[1.235,103.600],[1.400,103.750]], color:"#FBBF24" },
  CENTRAL:{ bounds:[[1.235,103.750],[1.400,103.900]], color:"#EF4444" },
};

export const HOTSPOT_MIN = 5;
export const VENUE_CHIP_ZOOM = 16;

/* Treat "inside a venue" generously: our own fix is ~19 m uncertain, so
   arguing about a bearing to a building we're already standing in is noise. */
export const INDOOR_RADIUS_M = 35;
export const ENCOUNTER_RADIUS_M = 120;
/* Minimum gap between proximity alerts. Without it a dense building fires one
   per GPS tick. */
export const ENCOUNTER_COOLDOWN_MS = 90 * 1000;

export const STALE_DAYS = 7;            // cache age before we warn about being offline
export const REVALIDATE_MS = 24*60*60*1000;   // refresh from the network once a day
export const UPSTREAM_OLD_DAYS = 14, UPSTREAM_STALE_DAYS = 45;

export const SLICES = 8;                      // most picks we'll ever put on the wheel
export const SLICE_COLORS = ["#EF4444","#FBBF24","#10B981","#3B82F6","#F08030","#A040A0","#6890F0","#78C850"];

export const AR_FOV = 70;                     // horizontal degrees mapped across the screen
export const AR_RADII = [300, 500, 1000, 2000];
