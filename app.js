/* ═══════════════════════════════════════════════════════════
   ALERT DEFINITIONS
   Each entry: label, base color, PDS solid color (or null),
   PDS flash pair (or null), fill opacity.
═══════════════════════════════════════════════════════════ */
const DEFS = {
  TOR_WARN:  { label: 'Tornado Warning',             color: '#ff0000', pdsColor: '#7e22ce', pdsFlash: null,                   fillOp: .35 },
  TOR_WATCH: { label: 'Tornado Watch',               color: '#ffd700', pdsColor: null,      pdsFlash: ['#ffd700', '#7e22ce'], fillOp: .25 },
  SVR_WARN:  { label: 'Severe Thunderstorm Warning', color: '#ff7a00', pdsColor: null,      pdsFlash: ['#ff7a00', '#7e22ce'], fillOp: .35 },
  SVR_WATCH: { label: 'Severe Thunderstorm Watch',   color: '#ffb36b', pdsColor: null,      pdsFlash: ['#ffb36b', '#7e22ce'], fillOp: .25 },
  WWA:       { label: 'Winter Weather Advisory',     color: '#9bdcff', pdsColor: null,      pdsFlash: null,                   fillOp: .28 },
  WS_WATCH:  { label: 'Winter Storm Watch',          color: '#00ffff', pdsColor: null,      pdsFlash: null,                   fillOp: .25 },
  WS_WARN:   { label: 'Winter Storm Warning',        color: '#ffffff', pdsColor: null,      pdsFlash: null,                   fillOp: .30 },
  BLIZZ:     { label: 'Blizzard Warning',            color: '#2255ff', pdsColor: null,      pdsFlash: null,                   fillOp: .30 },
  FFW:       { label: 'Flash Flood Warning',         color: '#1e4ab8', pdsColor: null,      pdsFlash: null,                   fillOp: .35 },
  SMW:       { label: 'Special Marine Warning',      color: '#001a99', pdsColor: null,      pdsFlash: null,                   fillOp: .35 },
};

function alertColors(type, pds) {
  const d = DEFS[type] || DEFS.TOR_WARN;
  if (pds) {
    if (d.pdsColor) return { color: d.pdsColor, flash: null };
    if (d.pdsFlash) return { color: d.pdsFlash[0], flash: d.pdsFlash };
  }
  return { color: d.color, flash: null };
}

function chipFlashClass(type, pds) {
  if (!pds) return '';
  const d = DEFS[type];
  if (!d?.pdsFlash) return '';
  if (type === 'TOR_WATCH') return 'fl-yp';
  if (type === 'SVR_WARN')  return 'fl-op';
  if (type === 'SVR_WATCH') return 'fl-lop';
  return '';
}

/* ── Swatch + PDS pill reactivity ── */
function refreshSwatch() {
  const { color } = alertColors(
    document.getElementById('alertType').value,
    document.getElementById('pds').checked
  );
  document.getElementById('swatch').style.background = color;
}
document.getElementById('alertType').addEventListener('change', refreshSwatch);
document.getElementById('pds').addEventListener('change', () => {
  document.getElementById('pdsPill').classList.toggle('on', document.getElementById('pds').checked);
  refreshSwatch();
});
refreshSwatch();


/* ═══════════════════════════════════════════════════════════
   LEAFLET MAP + BASEMAP TILE LAYERS
═══════════════════════════════════════════════════════════ */
const map = L.map('map', { zoomControl: true }).setView([38, -96], 4);

/* Bing Maps quadkey encoder */
function bingQK(c) {
  let q = '';
  for (let i = c.z; i > 0; i--) {
    let d = 0, m = 1 << (i - 1);
    if (c.x & m) d++;
    if (c.y & m) d += 2;
    q += d;
  }
  return q;
}

class BingLayer extends L.TileLayer {
  getTileUrl(c) {
    return `https://ecn.t3.tiles.virtualearth.net/tiles/a${bingQK(c)}.jpeg?g=1`;
  }
}

class GmapsSat extends L.TileLayer {
  getTileUrl(c) {
    return `https://mt1.google.com/vt/lyrs=y&x=${c.x}&y=${c.y}&z=${c.z}`;
  }
}

class AppleLayer extends L.TileLayer {
  constructor(style, opts) {
    super('', opts);
    this._style = style;
  }
  getTileUrl(c) {
    return `https://cdn.apple-mapkit.com/tile?style=${this._style}&size=1&scale=1&z=${c.z}&x=${c.x}&y=${c.y}&v=9&lang=en`;
  }
}

const TILES = {
  'osm':         L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                   { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  'carto-light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                   { maxZoom: 20, attribution: '&copy; OSM &copy; CARTO' }),
  'carto-dark':  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                   { maxZoom: 20, attribution: '&copy; OSM &copy; CARTO' }),
  'apple-light': new AppleLayer(4,  { maxZoom: 18, attribution: '&copy; Apple' }),
  'apple-dark':  new AppleLayer(46, { maxZoom: 18, attribution: '&copy; Apple' }),
  'esri-sat':    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                   { maxZoom: 19, attribution: 'Tiles &copy; Esri' }),
  'bing-sat':    new BingLayer('', { maxZoom: 19, attribution: '&copy; Microsoft Bing' }),
  'gmaps-sat':   new GmapsSat('',  { maxZoom: 20, attribution: '&copy; Google' }),
};

TILES['carto-dark'].addTo(map);

document.getElementById('basemap').addEventListener('change', e => {
  Object.values(TILES).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
  (TILES[e.target.value] || TILES['carto-dark']).addTo(map);
});


/* ═══════════════════════════════════════════════════════════
   FAKE RADAR
   Procedurally generated per-tile using seeded RNG.
   dBZ color bands from green (light) → magenta (extreme).
═══════════════════════════════════════════════════════════ */
const RBANDS = [
  [.08, [20,  100, 20,  .18]],  // very light green
  [.18, [40,  185, 40,  .26]],  // light green
  [.30, [130, 215, 30,  .30]],  // yellow-green
  [.44, [240, 210, 10,  .34]],  // yellow
  [.58, [255, 145, 10,  .38]],  // orange
  [.70, [235, 50,  30,  .42]],  // red
  [.83, [185, 0,   185, .46]],  // purple
  [1.0, [255, 70,  240, .52]],  // magenta (extreme)
];

function rRgba(v) {
  for (const [t, c] of RBANDS) if (v <= t) return c;
  return RBANDS[RBANDS.length - 1][1];
}

let rLayer = null, rTimer = null, rSeed = 0;

function makeRadar(seed) {
  const gl = L.gridLayer({ opacity: .9, zIndex: 350 });

  gl.createTile = c => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');

    // Seeded XOR-shift RNG — deterministic per tile + seed
    let s = ((c.x * 374761393) ^ (c.y * 668265263) ^ (c.z * 1442695041) ^ (seed * 2246822519)) >>> 0;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967295; };

    // Large radial blobs (precipitation areas)
    for (let b = 0; b < 8 + Math.floor(rnd() * 14); b++) {
      const bx = rnd() * 256, by = rnd() * 256;
      const bw = 14 + rnd() * 60, bh = 10 + rnd() * 44;
      const v  = .05 + rnd() * .95;
      const [r, g, bl, a] = rRgba(v), mx = Math.max(bw, bh);

      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(bw / mx, bh / mx);
      const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, mx);
      grd.addColorStop(0,   `rgba(${r},${g},${bl},${a})`);
      grd.addColorStop(.5,  `rgba(${r},${g},${bl},${a * .5})`);
      grd.addColorStop(1,   `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(0, 0, mx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // High-dBZ speckles
    for (let i = 0; i < 280; i++) {
      const v2 = rnd();
      if (v2 < .64) continue;
      const [r, g, bl, a] = rRgba(v2);
      ctx.fillStyle = `rgba(${r},${g},${bl},${Math.min(a * 1.5, .7)})`;
      ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 5, 1 + rnd() * 4);
    }

    // Sweep scanlines artifact
    ctx.globalAlpha = .05;
    ctx.fillStyle = '#fff';
    for (let y = (seed * 5) % 8; y < 256; y += 8) ctx.fillRect(0, y, 256, 1);
    ctx.globalAlpha = 1;

    return cv;
  };

  return gl;
}

function stopRadar() {
  if (rTimer) { clearInterval(rTimer); rTimer = null; }
  if (rLayer && map.hasLayer(rLayer)) { map.removeLayer(rLayer); rLayer = null; }
}

document.getElementById('radarMode').addEventListener('change', e => {
  stopRadar();
  if (e.target.value === 'off') return;

  rSeed = Math.floor(Math.random() * 999999);
  rLayer = makeRadar(rSeed);
  rLayer.addTo(map);

  if (e.target.value === 'animate') {
    rTimer = setInterval(() => {
      const old = rLayer;
      rSeed++;
      rLayer = makeRadar(rSeed);
      rLayer.addTo(map);
      setTimeout(() => { if (map.hasLayer(old)) map.removeLayer(old); }, 90);
    }, 280);
  }
});


/* ═══════════════════════════════════════════════════════════
   STATE FIPS + ABBREVIATION LOOKUPS
═══════════════════════════════════════════════════════════ */
const FIPS = {
  'Alabama': '01', 'Alaska': '02', 'Arizona': '04', 'Arkansas': '05',
  'California': '06', 'Colorado': '08', 'Connecticut': '09', 'Delaware': '10',
  'District Of Columbia': '11', 'Florida': '12', 'Georgia': '13', 'Hawaii': '15',
  'Idaho': '16', 'Illinois': '17', 'Indiana': '18', 'Iowa': '19',
  'Kansas': '20', 'Kentucky': '21', 'Louisiana': '22', 'Maine': '23',
  'Maryland': '24', 'Massachusetts': '25', 'Michigan': '26', 'Minnesota': '27',
  'Mississippi': '28', 'Missouri': '29', 'Montana': '30', 'Nebraska': '31',
  'Nevada': '32', 'New Hampshire': '33', 'New Jersey': '34', 'New Mexico': '35',
  'New York': '36', 'North Carolina': '37', 'North Dakota': '38', 'Ohio': '39',
  'Oklahoma': '40', 'Oregon': '41', 'Pennsylvania': '42', 'Rhode Island': '44',
  'South Carolina': '45', 'South Dakota': '46', 'Tennessee': '47', 'Texas': '48',
  'Utah': '49', 'Vermont': '50', 'Virginia': '51', 'Washington': '53',
  'West Virginia': '54', 'Wisconsin': '55', 'Wyoming': '56', 'Puerto Rico': '72',
};

const ABBR = {
  AL: 'Alabama',        AK: 'Alaska',         AZ: 'Arizona',       AR: 'Arkansas',
  CA: 'California',     CO: 'Colorado',       CT: 'Connecticut',   DE: 'Delaware',
  DC: 'District Of Columbia', FL: 'Florida',  GA: 'Georgia',       HI: 'Hawaii',
  ID: 'Idaho',          IL: 'Illinois',       IN: 'Indiana',       IA: 'Iowa',
  KS: 'Kansas',         KY: 'Kentucky',       LA: 'Louisiana',     ME: 'Maine',
  MD: 'Maryland',       MA: 'Massachusetts',  MI: 'Michigan',      MN: 'Minnesota',
  MS: 'Mississippi',    MO: 'Missouri',       MT: 'Montana',       NE: 'Nebraska',
  NV: 'Nevada',         NH: 'New Hampshire',  NJ: 'New Jersey',    NM: 'New Mexico',
  NY: 'New York',       NC: 'North Carolina', ND: 'North Dakota',  OH: 'Ohio',
  OK: 'Oklahoma',       OR: 'Oregon',         PA: 'Pennsylvania',  RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota',   TN: 'Tennessee',     TX: 'Texas',
  UT: 'Utah',           VT: 'Vermont',        VA: 'Virginia',      WA: 'Washington',
  WV: 'West Virginia',  WI: 'Wisconsin',      WY: 'Wyoming',       PR: 'Puerto Rico',
};

function resolveState(s) {
  const t = (s || '').trim().replace(/\./g, '');
  if (!t) return '';
  const up = t.toUpperCase();
  if (ABBR[up]) return ABBR[up];
  const tc = t.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  for (const v of Object.values(ABBR)) {
    if (v.toLowerCase() === tc.toLowerCase()) return v;
  }
  return tc;
}

function isKnownState(n) {
  return Object.values(ABBR).some(v => v.toLowerCase() === String(n || '').toLowerCase());
}


/* ═══════════════════════════════════════════════════════════
   CENSUS TIGER GeoJSON FETCH
   Source priority (each has a 10 s timeout):
     1. ArcGIS Living Atlas — small per-state GeoJSON, very fast CDN
     2. Census CB 2023 per-state JSON
     3. TIGERweb ArcGIS REST GeoJSON
     4. Plotly all-US (~24 MB, filtered + name-enriched, cached globally)
═══════════════════════════════════════════════════════════ */
const geoCache = new Map();  // fips → FeatureCollection
const inFlight = new Map();  // fips → Promise

/* Fetch with a hard timeout — returns rejected promise after ms */
function fetchTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const tid   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

async function getStateFC(stateName) {
  const fips = FIPS[stateName];
  if (!fips) throw new Error(`Unknown state "${stateName}"`);
  if (geoCache.has(fips)) return geoCache.get(fips);
  if (inFlight.has(fips)) return inFlight.get(fips);

  const p = (async () => {

    const sources = [
      /* ── 1. ArcGIS Living Atlas — fast CDN, small files, good CORS ── */
      {
        name:    'ArcGIS Living Atlas',
        timeout: 10000,
        url:     `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Counties/FeatureServer/0/query`
                 + `?where=${encodeURIComponent(`STATE_FIPS='${fips}'`)}`
                 + `&outFields=NAME,STATE_FIPS,FIPS`
                 + `&returnGeometry=true&geometryPrecision=4&outSR=4326&resultRecordCount=200&f=geojson`,
      },
      /* ── 2. Census Cartographic Boundary 2023 — official, ~1–3 MB ── */
      {
        name:    'Census CB 2023',
        timeout: 15000,
        url:     `https://www2.census.gov/geo/tiger/GENZ2023/json/cb_2023_${fips}_county_500k.json`,
      },
      /* ── 3. TIGERweb REST — official, CORS, per-state ── */
      {
        name:    'TIGERweb REST',
        timeout: 12000,
        url:     `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer/86/query`
                 + `?where=${encodeURIComponent(`STATEFP='${fips}'`)}`
                 + `&outFields=NAME,STATEFP,COUNTYFP`
                 + `&returnGeometry=true&geometryPrecision=4&outSR=4326&resultRecordCount=200&f=geojson`,
      },
    ];

    let lastErr;

    for (const src of sources) {
      try {
        log(`[${stateName}] Trying ${src.name}...`);
        setProgress(20);
        const r = await fetchTimeout(src.url, src.timeout);
        setProgress(65);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (j.error) throw new Error(j.error.message || 'API error');
        const fc = toFC(j);
        if (!fc?.features?.length) throw new Error('Empty result');
        setProgress(100);
        geoCache.set(fips, fc);
        inFlight.delete(fips);
        log(`[${stateName}] Loaded ${fc.features.length} counties via ${src.name}`, 'ok');
        setTimeout(() => setProgress(0), 500);
        return fc;
      } catch(e) {
        lastErr = e;
        const reason = e.name === 'AbortError' ? 'timed out' : e.message;
        log(`[${stateName}] ${src.name} failed: ${reason}`, 'err');
        setProgress(0);
      }
    }

    /* ── 4. Plotly all-US fallback (~24 MB, cached, name-enriched) ── */
    try {
      log(`[${stateName}] Trying Plotly all-US fallback (large file)...`, 'warn');
      setProgress(10);
      if (!window.__pAllUS) {
        const r = await fetchTimeout(
          'https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json',
          30000
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        window.__pAllUS = await r.json();
      }
      setProgress(50);

      const feats = (window.__pAllUS.features || []).filter(f => {
        return String(f.id || '').padStart(5, '0').slice(0, 2) === fips;
      });
      if (!feats.length) throw new Error('No features for FIPS ' + fips);

      /* Plotly features have empty properties — enrich via Census ACS name API */
      let fipsToName = {};
      try {
        const nameUrl = `https://api.census.gov/data/2022/acs/acs5?get=NAME&for=county:*&in=state:${fips}`;
        const nr = await fetchTimeout(nameUrl, 8000);
        if (nr.ok) {
          const rows = await nr.json();
          for (const row of rows.slice(1)) {
            const key     = fips + String(row[2]).padStart(3, '0');
            fipsToName[key] = String(row[0]).split(',')[0].trim();
          }
        }
      } catch(ne) {
        log(`[${stateName}] Name enrichment failed: ${ne.message}`, 'warn');
      }

      const enriched = feats.map(f => {
        const id   = String(f.id || '').padStart(5, '0');
        const name = fipsToName[id] || '';
        return { ...f, properties: { ...(f.properties || {}), NAME: name, NAMELSAD: name } };
      });

      setProgress(100);
      const fc = { type: 'FeatureCollection', features: enriched };
      geoCache.set(fips, fc);
      inFlight.delete(fips);
      log(`[${stateName}] Loaded ${fc.features.length} counties via Plotly fallback`, 'ok');
      setTimeout(() => setProgress(0), 500);
      return fc;
    } catch(e) {
      lastErr = e;
      log(`[${stateName}] Plotly fallback failed: ${e.message}`, 'err');
      setProgress(0);
    }

    inFlight.delete(fips);
    throw lastErr || new Error('All sources failed for ' + stateName);
  })();

  inFlight.set(fips, p);
  return p;
}

/* Normalize various response shapes → standard FeatureCollection */
function toFC(j) {
  let f;
  if      (j.type === 'FeatureCollection' && Array.isArray(j.features)) f = j.features;
  else if (Array.isArray(j.features))  f = j.features;  // TIGERweb omits "type"
  else if (j.type === 'Feature')       f = [j];
  else throw new Error('Unknown shape: ' + JSON.stringify(Object.keys(j).slice(0, 5)));
  f = f.filter(x => x?.geometry?.coordinates?.length);
  if (!f.length) throw new Error('No valid geometry');
  return { type: 'FeatureCollection', features: f };
}


/* ═══════════════════════════════════════════════════════════
   COUNTY MATCHING
   Three-pass: exact → starts-with → substring
═══════════════════════════════════════════════════════════ */
const SFX = /\s+(county|parish|borough|census area|municipality|city and borough|city|area|division|district)\s*$/i;

function cNames(p) {
  return [p.NAME, p.name, p.NAMELSAD, p.BASENAME, p.county_name, p.GEO_NAME]
    .filter(Boolean)
    .map(n => String(n).replace(SFX, '').trim().toLowerCase());
}

function findCounty(fc, needle) {
  const n = needle.trim().toLowerCase();

  // Pass 1: exact match
  for (const f of fc.features) {
    if (cNames(f.properties || {}).includes(n)) return f;
  }

  // Pass 2: starts-with or high similarity
  let best = null, bs = -1;
  for (const f of fc.features) {
    for (const cn of cNames(f.properties || {})) {
      if (cn === n) return f;
      if (cn.startsWith(n) || n.startsWith(cn)) {
        const sc = 1 - Math.abs(cn.length - n.length) / (Math.max(cn.length, n.length) + 1);
        if (sc > bs) { bs = sc; best = f; }
      }
    }
  }
  if (bs >= 0.5) return best;

  // Pass 3: any substring (Miami-Dade, De Kalb, etc.)
  for (const f of fc.features) {
    for (const cn of cNames(f.properties || {})) {
      if (cn.includes(n) || n.includes(cn)) {
        const sc = 0.4 * (1 - Math.abs(cn.length - n.length) / (Math.max(cn.length, n.length) + 1));
        if (sc > bs) { bs = sc; best = f; }
      }
    }
  }
  return bs > 0.1 ? best : null;
}

function toRings(feat) {
  const rings = [];
  const ap = c => {
    const o = c[0];
    if (!o || o.length < 4) return;
    rings.push(o.map(([ln, la]) => L.latLng(la, ln)));
  };
  const g = feat.geometry;
  if      (g.type === 'Polygon')      ap(g.coordinates);
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => ap(p));
  return rings;
}


/* ═══════════════════════════════════════════════════════════
   TEXT PARSING
   Handles: "Fulton County, GA" | "north harris, TX" |
            "Cook County Illinois" | "Miami-Dade, FL"
═══════════════════════════════════════════════════════════ */
const DIR_RE = /^(?:the\s+)?(?:(?:far|upper|lower|central|mid|inner|outer)\s+)?(?:north(?:ern|east(?:ern)?|west(?:ern)?)?|south(?:ern|east(?:ern)?|west(?:ern)?)?|east(?:ern)?|west(?:ern)?|n\.?|s\.?|e\.?|w\.?|ne|nw|se|sw)\s+/i;

function stripDir(s) {
  let r = String(s || '').trim().replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim(), p;
  do { p = r; r = r.replace(DIR_RE, '').trim(); } while (r !== p);
  return r.replace(/\b(area|region|portion|half|side|section)\b/ig, ' ').replace(/\s+/g, ' ').trim();
}

function tc(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function parseLine(line, fb) {
  let s = line.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  let cRaw = '', stRaw = '';

  if (s.includes(',')) {
    const i = s.indexOf(',');
    cRaw  = s.slice(0, i).trim();
    stRaw = s.slice(i + 1).trim();
  } else {
    const toks = s.split(' ');
    let ok = false;
    for (let len = 3; len >= 1; len--) {
      if (toks.length <= len) continue;
      const cand = toks.slice(-len).join(' ');
      const res  = resolveState(cand);
      if (isKnownState(res)) { stRaw = cand; cRaw = toks.slice(0, -len).join(' '); ok = true; break; }
    }
    if (!ok) cRaw = s;
  }

  const stateName  = resolveState(stRaw || fb || '');
  const countyBase = tc(
    stripDir(cRaw)
      .replace(/\s+county$/i, '')
      .replace(/\s+parish$/i, '')
      .replace(/\s+borough$/i, '')
      .trim()
  );
  return { countyBase, stateName };
}


/* ═══════════════════════════════════════════════════════════
   SELECTION STATE
═══════════════════════════════════════════════════════════ */
const selected = new Map();  // key → { displayName, countyBase, stateName, rings, selLayer }
const selFG    = L.featureGroup().addTo(map);
const alertFG  = L.featureGroup().addTo(map);

function cKey(cb, st) {
  return `${cb.toLowerCase()}|${st.toLowerCase()}`;
}

function addSelLayer(item) {
  if (item.selLayer) selFG.removeLayer(item.selLayer);
  const lys = item.rings.map(r =>
    L.polygon(r, {
      color: '#64748b', weight: 1.5, fillColor: '#334155',
      fillOpacity: .12, dashArray: '5,4', interactive: false,
    })
  );
  item.selLayer = L.featureGroup(lys);
  selFG.addLayer(item.selLayer);
}

function renderCList() {
  const el = document.getElementById('cList');
  document.getElementById('cCount').textContent = selected.size;
  el.innerHTML = '';

  if (!selected.size) {
    el.innerHTML = '<div style="font-size:10.5px;color:var(--muted);padding:2px 0">No counties selected.</div>';
    return;
  }

  for (const [k, it] of selected) {
    const ch = document.createElement('div');
    ch.className = 'chip';
    ch.innerHTML = `
      <div class="info">
        <b>${esc(it.displayName)}</b>
        <small>${esc(it.stateName)}</small>
      </div>
      <div class="acts">
        <button class="btn-ghost btn-sm" data-act="zoom" data-k="${esc(k)}">Zoom</button>
        <button class="btn-red btn-sm"   data-act="rm"   data-k="${esc(k)}">X</button>
      </div>`;
    ch.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const it2 = selected.get(b.dataset.k);
      if (!it2) return;
      if (b.dataset.act === 'zoom') {
        map.fitBounds(L.featureGroup(it2.rings.map(r => L.polygon(r))).getBounds(), { padding: [40, 40] });
      } else {
        if (it2.selLayer) selFG.removeLayer(it2.selLayer);
        selected.delete(b.dataset.k);
        renderCList();
        log(`Removed: ${it2.displayName}, ${it2.stateName}`);
      }
    }));
    el.appendChild(ch);
  }
}


/* ═══════════════════════════════════════════════════════════
   ACTIVE ALERTS STATE
═══════════════════════════════════════════════════════════ */
const activeAlerts = [];
let alertIdSeq = 0;

function renderAList() {
  const el = document.getElementById('aList');
  document.getElementById('aCount').textContent = activeAlerts.length;
  el.innerHTML = '';

  if (!activeAlerts.length) {
    el.innerHTML = '<div style="font-size:10.5px;color:var(--muted);padding:2px 0">No active alerts.</div>';
    return;
  }

  for (const al of activeAlerts) {
    const flashCls = chipFlashClass(al.type, al.pds);
    const ch = document.createElement('div');
    ch.className = `a-chip${flashCls ? ' ' + flashCls : ''}`;
    ch.style.borderColor = al.color;

    const countyPreview = al.counties.slice(0, 3).join(', ')
      + (al.counties.length > 3 ? ` +${al.counties.length - 3} more` : '');

    ch.innerHTML = `
      <div class="ainfo">
        <b style="color:${al.color}">${esc(al.label)}${al.pds ? ' (PDS)' : ''}</b>
        <small>${esc(countyPreview)}</small>
        ${al.headline ? `<small style="color:${al.color};opacity:.8">${esc(al.headline)}</small>` : ''}
      </div>
      <div class="acts">
        <button class="btn-ghost btn-sm" data-id="${al.id}" data-act="zoom">Zoom</button>
        <button class="btn-red btn-sm"   data-id="${al.id}" data-act="rm">X</button>
      </div>`;

    ch.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      const id = parseInt(b.dataset.id);
      if (b.dataset.act === 'zoom') {
        const al2 = activeAlerts.find(a => a.id === id);
        if (al2?.layers.length) {
          map.fitBounds(L.featureGroup(al2.layers).getBounds(), { padding: [30, 30] });
        }
      } else {
        removeAlert(id);
      }
    }));

    el.appendChild(ch);
  }
}

function removeAlert(id) {
  const idx = activeAlerts.findIndex(a => a.id === id);
  if (idx < 0) return;
  const al = activeAlerts[idx];
  if (al.timer) clearInterval(al.timer);
  al.layers.forEach(l => { if (alertFG.hasLayer(l)) alertFG.removeLayer(l); });
  activeAlerts.splice(idx, 1);
  renderAList();
}

function clearAllAlerts() {
  [...activeAlerts].forEach(al => removeAlert(al.id));
}


/* ═══════════════════════════════════════════════════════════
   ADD COUNTIES BUTTON
═══════════════════════════════════════════════════════════ */
document.getElementById('btnAdd').addEventListener('click', async () => {
  const raw   = document.getElementById('countyBox').value;
  const fb    = resolveState(document.getElementById('defState').value);
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (!lines.length) { alert('Enter at least one county.'); return; }

  const btn = document.getElementById('btnAdd');
  btn.innerHTML = '<span class="spin"></span>Loading...';
  btn.disabled = true;

  log(`Processing ${lines.length} line(s)...`);

  for (const line of lines) {
    try {
      const p = parseLine(line, fb);

      if (!p?.countyBase) {
        log(`Skip (empty): "${line}"`, 'warn');
        continue;
      }
      if (!isKnownState(p.stateName)) {
        log(`Skip (no state): "${line}" -- add ", ST" or set Default State`, 'warn');
        continue;
      }

      log(`Looking up: ${p.countyBase} County, ${p.stateName}`);

      const fc   = await getStateFC(p.stateName);
      const feat = findCounty(fc, p.countyBase);

      if (!feat) {
        const avail = fc.features.slice(0, 6).map(f => f.properties?.NAME || '?').join(', ');
        log(`NOT FOUND: "${p.countyBase}" in ${p.stateName}. Sample: ${avail}...`, 'err');
        continue;
      }

      const rings = toRings(feat);
      if (!rings.length) { log(`No polygon for ${p.countyBase}`, 'err'); continue; }

      const rawName     = feat.properties?.NAME || feat.properties?.name || p.countyBase;
      const displayName = /county|parish|borough/i.test(rawName) ? rawName : rawName + ' County';
      const k           = cKey(p.countyBase, p.stateName);

      const item = selected.get(k) || { countyBase: p.countyBase, stateName: p.stateName, rings, selLayer: null };
      item.displayName = displayName;
      item.rings = rings;
      selected.set(k, item);
      addSelLayer(item);
      log(`OK: ${displayName}, ${p.stateName}`, 'ok');

    } catch(e) {
      log(`ERROR "${line}": ${e.message}`, 'err');
    }
  }

  renderCList();
  btn.innerHTML = '+ Add Counties';
  btn.disabled = false;
});


/* ═══════════════════════════════════════════════════════════
   ISSUE ALERT BUTTON
═══════════════════════════════════════════════════════════ */
document.getElementById('btnIssue').addEventListener('click', () => {
  const type     = document.getElementById('alertType').value;
  const pds      = document.getElementById('pds').checked;
  const headline = document.getElementById('headline').value.trim();
  const def      = DEFS[type] || DEFS.TOR_WARN;
  const { color, flash } = alertColors(type, pds);

  const layers  = [];
  let   counties = [];

  /* ── Polygon mode ── */
  if (shapeMode === 'polygon') {
    if (drawVerts.length < 3) {
      alert('Draw a polygon first (at least 3 points). Use "Start Drawing" then double-click to close.');
      return;
    }
    // If still drawing, close it now
    if (drawActive) closePolygon();

    const poly = L.polygon(drawVerts, {
      color, fillColor: color,
      fillOpacity: def.fillOp || .32,
      weight: 3, interactive: true,
    });
    const tipHTML = `<b>${def.label}${pds ? ' (PDS)' : ''}</b>`
      + (headline ? `<br/><span style="color:${color}">${headline}</span>` : '');
    poly.bindTooltip(tipHTML, { sticky: true });
    alertFG.addLayer(poly);
    layers.push(poly);
    counties = ['Custom polygon'];

    // Clear the draw canvas so a new polygon can be started
    clearDrawPreview();
    drawVerts = [];
    document.getElementById('btnDrawUndo').disabled  = true;
    document.getElementById('btnDrawClear').disabled = true;
    document.getElementById('drawVertexCount').style.display = 'none';
    updateDrawHint();

  /* ── County mode ── */
  } else {
    if (!selected.size) { alert('Add at least one county first.'); return; }

    for (const it of selected.values()) {
      counties.push(it.displayName);
      it.rings.forEach(ring => {
        const poly = L.polygon(ring, {
          color, fillColor: color,
          fillOpacity: def.fillOp || .32,
          weight: 3, interactive: true,
        });
        const tipHTML = `<b>${def.label}${pds ? ' (PDS)' : ''}</b>`
          + (headline ? `<br/><span style="color:${color}">${headline}</span>` : '');
        poly.bindTooltip(tipHTML, { sticky: true });
        alertFG.addLayer(poly);
        layers.push(poly);
      });
    }
  }

  if (layers.length) map.fitBounds(alertFG.getBounds(), { padding: [30, 30] });

  let timer = null;
  if (flash) {
    let ph = true;
    timer = setInterval(() => {
      ph = !ph;
      const c = flash[ph ? 0 : 1];
      layers.forEach(l => l.setStyle({ color: c, fillColor: c }));
    }, 450);
  }

  const id = ++alertIdSeq;
  activeAlerts.push({ id, type, pds, label: def.label, color, flash, layers, timer, counties, headline });
  renderAList();
  const shapeDesc = shapeMode === 'polygon' ? 'custom polygon' : `${counties.length} county/counties`;
  log(`Issued: ${def.label}${pds ? ' (PDS)' : ''} * ${shapeDesc}${headline ? ' * ' + headline : ''}`, 'ok');
});


/* ═══════════════════════════════════════════════════════════
   SHAPE MODE — Counties vs Draw Polygon
═══════════════════════════════════════════════════════════ */
let shapeMode = 'county';  // 'county' | 'polygon'

document.querySelectorAll('.mode-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    shapeMode = btn.dataset.mode;
    document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b === btn));

    const countySection = document.getElementById('countyBox').closest('.col');
    const countyRow     = document.getElementById('defState').closest('.row');
    const hintEl        = countySection.nextElementSibling;  // .hint below textarea
    const selectedCol   = document.getElementById('cList').closest('.col');
    const drawSection   = document.getElementById('drawSection');

    if (shapeMode === 'county') {
      countySection.style.display  = '';
      countyRow.style.display      = '';
      hintEl.style.display         = '';
      selectedCol.style.display    = '';
      drawSection.style.display    = 'none';
      stopDrawing();
    } else {
      countySection.style.display  = 'none';
      countyRow.style.display      = 'none';
      hintEl.style.display         = 'none';
      selectedCol.style.display    = 'none';
      drawSection.style.display    = '';
    }
  });
});


/* ═══════════════════════════════════════════════════════════
   POLYGON DRAW ENGINE
   Click to place vertices, double-click to close.
   Live preview line follows the cursor.
═══════════════════════════════════════════════════════════ */
let drawActive    = false;   // currently placing points?
let drawVerts     = [];      // array of L.LatLng
let drawPolyline  = null;    // live preview polyline
let drawPolygon   = null;    // completed/preview polygon fill
let drawGhostLine = null;    // rubber-band line cursor→last vert
let drawFG        = L.featureGroup().addTo(map);

function updateDrawHint() {
  const hint  = document.getElementById('drawHint');
  const count = document.getElementById('drawVertexCount');
  const n     = drawVerts.length;

  if (!drawActive) {
    hint.textContent  = 'Click on the map to place polygon points. Double-click to close.';
    count.style.display = 'none';
    return;
  }

  if (n === 0) {
    hint.textContent = 'Click anywhere on the map to place the first point.';
  } else if (n < 3) {
    hint.textContent = `${n} point${n > 1 ? 's' : ''} placed — keep clicking to add more.`;
  } else {
    hint.textContent = `${n} points — click to continue, double-click to close polygon.`;
  }

  count.style.display = '';
  count.textContent   = `${n} vertex${n !== 1 ? 'es' : ''}`;
}

function redrawPreview() {
  // Remove old preview layers
  if (drawPolyline) { drawFG.removeLayer(drawPolyline); drawPolyline = null; }
  if (drawPolygon)  { drawFG.removeLayer(drawPolygon);  drawPolygon  = null; }

  if (drawVerts.length < 2) return;

  // Dashed outline polyline
  drawPolyline = L.polyline(drawVerts, {
    color: '#60a5fa', weight: 2, dashArray: '6,4', interactive: false,
  });
  drawFG.addLayer(drawPolyline);

  // Filled polygon preview (when 3+ points)
  if (drawVerts.length >= 3) {
    drawPolygon = L.polygon(drawVerts, {
      color: '#60a5fa', weight: 2, fillColor: '#60a5fa', fillOpacity: .12,
      dashArray: '6,4', interactive: false,
    });
    drawFG.addLayer(drawPolygon);
  }
}

function updateGhostLine(mouseLatLng) {
  if (drawGhostLine) { drawFG.removeLayer(drawGhostLine); drawGhostLine = null; }
  if (!drawActive || drawVerts.length === 0) return;

  drawGhostLine = L.polyline([drawVerts[drawVerts.length - 1], mouseLatLng], {
    color: '#60a5fa', weight: 1.5, dashArray: '4,4', opacity: .6, interactive: false,
  });
  drawFG.addLayer(drawGhostLine);
}

function startDrawing() {
  drawActive = true;
  drawVerts  = [];
  clearDrawPreview();
  map.getContainer().classList.add('leaflet-draw-active');
  document.getElementById('btnDrawUndo').disabled  = true;
  document.getElementById('btnDrawClear').disabled = true;
  document.getElementById('btnDrawStart').textContent = '⏹ Stop Drawing';
  updateDrawHint();
  log('Draw mode active — click map to place points, double-click to close.', 'ok');
}

function stopDrawing() {
  drawActive = false;
  if (drawGhostLine) { drawFG.removeLayer(drawGhostLine); drawGhostLine = null; }
  map.getContainer().classList.remove('leaflet-draw-active');
  const btn = document.getElementById('btnDrawStart');
  if (btn) btn.textContent = '✎ Start Drawing';
  updateDrawHint();
}

function clearDrawPreview() {
  if (drawPolyline) { drawFG.removeLayer(drawPolyline); drawPolyline = null; }
  if (drawPolygon)  { drawFG.removeLayer(drawPolygon);  drawPolygon  = null; }
  if (drawGhostLine){ drawFG.removeLayer(drawGhostLine);drawGhostLine= null; }
}

function clearDraw() {
  stopDrawing();
  drawVerts = [];
  clearDrawPreview();
  document.getElementById('btnDrawUndo').disabled  = true;
  document.getElementById('btnDrawClear').disabled = true;
  document.getElementById('drawVertexCount').style.display = 'none';
  updateDrawHint();
  log('Polygon cleared.');
}

function closePolygon() {
  if (drawVerts.length < 3) {
    log('Need at least 3 points to close a polygon.', 'warn');
    return false;
  }
  stopDrawing();
  redrawPreview();
  document.getElementById('btnDrawClear').disabled = false;
  log(`Polygon closed with ${drawVerts.length} vertices.`, 'ok');
  updateDrawHint();
  return true;
}

/* Map click — place a vertex */
map.on('click', e => {
  if (!drawActive) return;
  drawVerts.push(e.latlng);
  redrawPreview();
  if (drawGhostLine) { drawFG.removeLayer(drawGhostLine); drawGhostLine = null; }
  document.getElementById('btnDrawUndo').disabled  = false;
  document.getElementById('btnDrawClear').disabled = false;
  updateDrawHint();
});

/* Map double-click — close polygon */
map.on('dblclick', e => {
  if (!drawActive) return;
  L.DomEvent.stop(e);  // prevent map zoom
  // The click before dblclick already added a point — remove the duplicate
  if (drawVerts.length > 1) drawVerts.pop();
  closePolygon();
});

/* Mouse move — rubber-band ghost line */
map.on('mousemove', e => {
  if (!drawActive) return;
  updateGhostLine(e.latlng);
});

/* Draw toolbar buttons */
document.getElementById('btnDrawStart').addEventListener('click', () => {
  if (drawActive) {
    // Stop was clicked — close if enough points, otherwise just stop
    if (drawVerts.length >= 3) {
      closePolygon();
    } else {
      stopDrawing();
      log('Drawing stopped.');
    }
  } else {
    startDrawing();
  }
});

document.getElementById('btnDrawUndo').addEventListener('click', () => {
  if (!drawVerts.length) return;
  drawVerts.pop();
  redrawPreview();
  updateDrawHint();
  if (!drawVerts.length) document.getElementById('btnDrawUndo').disabled = true;
  log(`Undid last point. ${drawVerts.length} remaining.`);
});

document.getElementById('btnDrawClear').addEventListener('click', clearDraw);


/* ═══════════════════════════════════════════════════════════
   REMAINING BUTTON HANDLERS
═══════════════════════════════════════════════════════════ */
document.getElementById('btnRemAll').addEventListener('click', () => {
  selected.clear();
  selFG.clearLayers();
  renderCList();
  log('Removed all counties.');
});

document.getElementById('btnClearAll').addEventListener('click', () => {
  clearAllAlerts();
  renderAList();
  log('Cleared all alerts.');
});

document.getElementById('btnFit').addEventListener('click', () => {
  if (!selected.size) { alert('No counties selected.'); return; }
  if (selFG.getLayers().length) map.fitBounds(selFG.getBounds(), { padding: [30, 30] });
});


/* ═══════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════ */
const logEl = document.getElementById('log');

function log(msg, type = '') {
  const t   = new Date().toLocaleTimeString('en-US', { hour12: false });
  const cls = type === 'ok' ? 'log-ok' : type === 'err' ? 'log-err' : type === 'warn' ? 'log-warn' : '';
  const span = cls
    ? `<span class="${cls}">[${t}] ${esc(msg)}</span>`
    : `[${t}] ${esc(msg)}`;
  logEl.innerHTML = span + '\n' + logEl.innerHTML;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

const progEl = document.getElementById('prog');
function setProgress(pct) { progEl.style.width = pct + '%'; }

/* Initial render */
renderCList();
renderAList();
