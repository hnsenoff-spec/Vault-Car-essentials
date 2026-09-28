/*
 * leaders.js — editable scenario data for the fictional command-center sim.
 *
 * Everything here is invented. Leaders are ROLE TITLES only (never real
 * names), site names are fictional codenames, and coordinates are coarse
 * regional anchors used only to place markers on a stylized map.
 *
 * Edit freely:
 *   SIDES       — per-side leader entity, sites, inventories
 *   TEMPLATES   — radio-chatter lines ({placeholders} are filled at runtime;
 *                 when a key has several lines one is picked at random)
 *   CONFIDENCE  — fog-of-war model for the opposing-perspective feed
 *   TIMING      — delays in SIM seconds
 *
 * Site `label` (optional): 'left' | 'right' | 'above' | 'below' map label placement.
 */
(function () {
  'use strict';

  const SIDES = {
    US: {
      name: 'United States',
      short: 'US',
      glyph: '▲',
      color: '#6fa8ff',
      leader: {
        title: 'US National Command Authority',
        abbr: 'NCA',
        airborneCallsign: 'NIGHTWATCH-1',
        convoyCallsign: 'MOTORCADE SIERRA',
        commsNet: 'CROSSBOW NET',
      },
      sites: {
        capital: { name: 'CAPITAL EAST',    kind: 'capital', lon: -77.0,  lat: 38.9 },
        bunker:  { name: 'SITE GRANITE',    kind: 'bunker',  lon: -80.8,  lat: 36.4 },
        airbase: { name: 'AIRBASE HALCYON', kind: 'airbase', lon: -96.0,  lat: 41.2, label: 'left' },
        fieldA:  { name: 'FIELD NORTH-1',   kind: 'field',   lon: -103.0, lat: 47.5 },
        fieldB:  { name: 'FIELD PLAINS-2',  kind: 'field',   lon: -106.0, lat: 42.0 },
      },
      inventory: 10,
      interceptors: 6,
      interceptP: 0.5,
    },
    RU: {
      name: 'Russian Federation',
      short: 'RU',
      glyph: '■',
      color: '#c49bff',
      leader: {
        title: 'Russian Supreme Command',
        abbr: 'RSC',
        airborneCallsign: 'SKYPOST-7',
        convoyCallsign: 'COLUMN VOLGA',
        commsNet: 'BIRCH NET',
      },
      sites: {
        capital: { name: 'CAPITAL NORTH',  kind: 'capital', lon: 37.6, lat: 55.8 },
        bunker:  { name: 'SITE BASALT',    kind: 'bunker',  lon: 58.5, lat: 52.5 },
        airbase: { name: 'AIRBASE TUNDRA', kind: 'airbase', lon: 50.0, lat: 62.5 },
        fieldA:  { name: 'FIELD TAIGA-1',  kind: 'field',   lon: 65.0, lat: 57.5 },
        fieldB:  { name: 'FIELD STEPPE-2', kind: 'field',   lon: 84.0, lat: 53.5 },
      },
      inventory: 10,
      interceptors: 4,
      interceptP: 0.45,
    },
    CN: {
      name: "People's Republic of China",
      short: 'PRC',
      glyph: '◆',
      color: '#6fe0a4',
      leader: {
        title: 'PRC Central Military Commission',
        abbr: 'CMC',
        airborneCallsign: 'CRANE-3',
        convoyCallsign: 'CONVOY JADE',
        commsNet: 'LOTUS NET',
      },
      sites: {
        capital: { name: 'CAPITAL CENTRAL',  kind: 'capital', lon: 116.4, lat: 39.9 },
        bunker:  { name: 'SITE CELADON',     kind: 'bunker',  lon: 111.5, lat: 37.0 },
        airbase: { name: 'AIRBASE PLATEAU',  kind: 'airbase', lon: 104.0, lat: 29.5, label: 'left' },
        fieldA:  { name: 'FIELD GOBI-1',     kind: 'field',   lon: 101.0, lat: 40.5 },
        fieldB:  { name: 'FIELD HIGHLAND-2', kind: 'field',   lon: 97.0,  lat: 35.0 },
      },
      inventory: 6,
      interceptors: 3,
      interceptP: 0.4,
    },
  };

  /* Leader entity state vocabulary (icons keep meaning off colour alone). */
  const LOCATIONS = {
    capital:  { icon: '⌂', label: 'CAPITAL' },
    bunker:   { icon: '▣', label: 'BUNKER' },
    airborne: { icon: '✈', label: 'AIRBORNE' },
    convoy:   { icon: '⇢', label: 'CONVOY' },
  };
  const STATUSES = {
    secure:           { icon: '✓', label: 'SECURE' },
    relocating:       { icon: '↻', label: 'RELOCATING' },
    'comms-degraded': { icon: '≈', label: 'COMMS-DEGRADED' },
    unknown:          { icon: '?', label: 'UNKNOWN' },
  };

  /* Initial state for every leader entity. */
  function initialLeaderState(side) {
    const cap = SIDES[side].sites.capital;
    return { location: 'capital', site: 'capital', status: 'secure', pos: [cap.lon, cap.lat] };
  }

  /*
   * Message templates. Available placeholders:
   *   {abbr} {title} {airborne} {convoy} {net} {side}  — from SIDES[side]
   *   plus per-event values noted beside each key.
   */
  const TEMPLATES = {
    // --- own-side (truth) relocation traffic ---
    sealStart: [                                             // {from} {site}
      '{abbr} departing {from}. {convoy} rolling for {site}.',
      '{convoy} wheels up from {from}, {abbr} aboard. Destination {site}.',
    ],
    sealDone: [                                              // {site}
      '{abbr} inside {site}. Blast doors sealed. Status: SECURE.',
      '{site} reports principal aboard, doors sealed, {net} up.',
    ],
    alreadyBunker: ['{abbr} already sealed in bunker. No action.'],
    enRoute:       ['{abbr} already en route to {site}. Order acknowledged, no change.'],
    scrambleStart: [                                         // {airbase}
      '{abbr} moving to {airbase}. {airborne} on alert, engines turning.',
      'Scramble order received. {convoy} escorting {abbr} to {airbase}.',
    ],
    airborne: [
      '{airborne} airborne, {abbr} aboard.',
      '{airborne} wheels up. {abbr} confirmed aboard, climbing out.',
    ],
    climbing: ['{airborne} climbing through FL{fl}. Link via {net} nominal.'], // {fl}
    alreadyAirborne: ['{abbr} already airborne aboard {airborne}. No action.'],
    airbaseDown: ['{airbase} not available. Airborne post cannot launch.'],     // {airbase}
    decoys: ['Decoy convoys dispatched: {n} vectors. True position: CLASSIFIED.'], // {n}
    decoysActive: ['Decoy screen already active ({n} vectors). No action.'],
    decoysRecovered: ['Decoy vectors recalled. Screen collapsed.'],
    routineOwn: [                                            // {loc} {site} {status}
      '{abbr} check-in: {loc} / {site}. Status: {status}.',
      '{net} roll call complete. {abbr} {status} at {site}.',
    ],
    orderRejected: ['Order not acknowledged. No authenticated link to {abbr}.'],

    // --- readiness / strikes ---
    defconChange: ['Readiness set to DEFCON {defcon}.'],     // {defcon}
    defconGate: ['Launch refused: DEFCON {defcon}. Escalate to DEFCON 2 or lower first.'],
    noFields: ['Launch refused: no surviving launch fields.'],
    noInventory: ['Launch refused: inventory exhausted.'],
    launchOwn: ['Launch order authenticated. {n} vehicle(s) away from {field}. Target: {target}.'], // {n} {field} {target}
    launchDetected: [                                        // {n}; {side} = launcher
      'Launch detected: {n} track(s) rising from {side} territory. Boost phase.',
      'Space-based sensors: {n} plume(s), {side} launch area. Tracking.',
    ],
    incoming: ['Inbound track(s) assessed on {target}. Recommend immediate relocation of {abbr}.'], // {target}
    interceptEngage: ['Interceptors away against {id}. Engaging.'],       // {id}
    interceptKill:   ['{id}: intercept confirmed. Track terminated.'],
    interceptFail:   ['{id}: intercept FAILED. Leaker entering terminal phase.'],
    detonation: ['DETONATION at {site} ({side}).'],          // {site}; {side} = target
    perimeterArmed:    ['PERIMETER ARMED. Automated retaliation will fire if {abbr} goes silent.'],
    perimeterDisarmed: ['Perimeter disarmed. Manual release authority restored.'],
    perimeterFire: ['PERIMETER: command link silent. Automated retaliation launched: {n} vehicle(s) from {field}.'],

    // --- effects on leadership ---
    commsDegraded: [                                         // {site}
      'Link to {site} intermittent. Status: COMMS-DEGRADED.',
      '{net} carrier lost to {site}; falling back to HF. Status: COMMS-DEGRADED.',
    ],
    linkRestored: ['Link to {abbr} restored via {net}. Status: {status}.'],
    contactLost: ['Contact lost with {abbr} at {site}. Status: UNKNOWN.'],
    contactRegained: ['Weak signal from {abbr} on backup net. Status: COMMS-DEGRADED.'],
    emp: ['{airborne}: EMP transient observed, systems nominal.'],

    // --- opposing-perspective intel (fog of war) ---
    intelLoc: [                                              // {loc} {site}
      '[INTEL] {abbr} assessed {loc} near {site}.',
      '[SIGINT] {abbr} emissions consistent with {loc}, vicinity {site}.',
    ],
    intelConflict: [                                         // {a} {ca} {b} {cb}
      '[INTEL] Conflicting reports: {abbr} at {a} ({ca}%) OR {b} ({cb}%).',
      '[IMINT] Multiple convoy signatures. {abbr} possibly {a} ({ca}%); alt {b} ({cb}%).',
    ],
    intelSilent: ['[SIGINT] {abbr} emissions silent. Last fix {site}. Location unresolved.'],
    intelDecoys: ['[IMINT] {n}+ convoy signatures dispersing from {site}. Principal position ambiguous.'],
    intelPerimeter: ['[INTEL] Indicators {side} has placed automated retaliation on hair trigger.'],
    intelReadiness: ['[INTEL] {side} force readiness indicators rising.'],
  };

  /* Fog-of-war model: how sure the OTHER sides are about this leader. */
  const CONFIDENCE = {
    base: { capital: 84, bunker: 70, convoy: 46, airborne: 36 },
    decoyPenalty: 22,     // subtracted while a decoy screen is active
    unknownPenalty: 25,   // leader silent: observers lose the track too
    noise: 8,             // ± random jitter
    min: 8,
    max: 95,
    decoyMisleadP: 0.45,  // chance the TOP report points at a decoy
  };

  const TIMING = {
    intelDelay: [4, 12],        // sim s before observers get a report on a change
    intelRefresh: [22, 38],     // periodic silent re-assessment
    routineOwn: [45, 70],       // own-side roll call
    decoyLifetime: 200,
    commsRecovery: [40, 70],
    unknownRecovery: [80, 120],
    perimeterDelay: 20,
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* Fill a template by key: fill('sealDone', {abbr:'NCA', site:'SITE GRANITE'}) */
  function fill(key, vars) {
    const lines = TEMPLATES[key];
    if (!lines) return key;
    return pick(lines).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  }

  window.LEADERS_CFG = { SIDES, LOCATIONS, STATUSES, TEMPLATES, CONFIDENCE, TIMING, initialLeaderState, fill };
})();
