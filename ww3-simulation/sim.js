/*
 * sim.js — fictional strategic command-center simulation.
 * All state is internal and randomly generated; nothing is fetched.
 * Scenario data + message templates live in leaders.js.
 */
(function () {
  'use strict';

  const CFG = window.LEADERS_CFG;
  const SIDES = CFG.SIDES;
  const SIDE_IDS = Object.keys(SIDES);
  const ALL_P = [...SIDE_IDS, 'OBS'];
  const DEFCON_NAMES = { 5: 'FADE OUT', 4: 'DOUBLE TAKE', 3: 'ROUND HOUSE', 2: 'FAST PACE', 1: 'COCKED PISTOL' };
  const PHASE = { boostEnd: 0.12, termStart: 0.85 };
  const FEED_CAP = 100;
  const LOG_CAP = 800;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- helpers ----------
  const $ = (s) => document.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const W = 1000, H = 500;
  const proj = (p) => [((p[0] + 180) / 360) * W, ((90 - p[1]) / 180) * H];
  const f1 = (n) => n.toFixed(1);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtT = (t) => {
    t = Math.max(0, Math.floor(t));
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  };
  const othersOf = (side) => SIDE_IDS.filter((s) => s !== side);
  const truthTo = (side) => [side, 'OBS'];
  const sideTag = (s) => `${SIDES[s].glyph} ${SIDES[s].short}`;

  // ---------- state ----------
  let S;
  let staticDirty = true;

  function initState() {
    const sites = {}, leaders = {}, intel = {}, intelNext = {}, routineNext = {};
    for (const id of SIDE_IDS) {
      for (const [k, s] of Object.entries(SIDES[id].sites)) {
        sites[id + '.' + k] = { ...s, key: id + '.' + k, siteKey: k, side: id, destroyed: false };
      }
      leaders[id] = {
        side: id, ...CFG.initialLeaderState(id),
        move: null, orbit: null, decoys: [], decoyUntil: 0,
        perimeter: false, perimeterFired: false, lastAttacker: null, gen: 0,
      };
      routineNext[id] = rand(...CFG.TIMING.routineOwn) * 0.5;
    }
    for (const o of SIDE_IDS) {
      intel[o] = {};
      for (const s of othersOf(o)) {
        const cap = SIDES[s].sites.capital;
        intel[o][s] = { pos: [cap.lon, cap.lat], conf: CFG.CONFIDENCE.base.capital, location: 'capital', siteName: cap.name, status: 'secure', candidates: [], t: 0 };
        intelNext[o + '>' + s] = rand(...CFG.TIMING.intelRefresh);
      }
    }
    return {
      t: 0, running: true, speed: 1, ai: true,
      perspective: 'US', control: 'US',
      defcon: Object.fromEntries(SIDE_IDS.map((i) => [i, 5])),
      inventory: Object.fromEntries(SIDE_IDS.map((i) => [i, SIDES[i].inventory])),
      interceptors: Object.fromEntries(SIDE_IDS.map((i) => [i, SIDES[i].interceptors])),
      sites, leaders, intel, intelNext, routineNext,
      missiles: [], nextMissile: 1, nextWave: 1, detonations: [],
      timers: [], aiCooldown: {}, readinessSeen: {},
      lastStmt: {}, stmtNext: Object.fromEntries(SIDE_IDS.map((i) => [i, rand(20, 40)])),
      log: [], nextMsg: 1,
    };
  }

  function after(delay, fn) { S.timers.push({ t: S.t + delay, fn }); }

  // ---------- messaging ----------
  function vars(side, extra) {
    const sd = SIDES[side], L = sd.leader;
    return { abbr: L.abbr, title: L.title, airborne: L.airborneCallsign, convoy: L.convoyCallsign, net: L.commsNet, side: sd.short, ...extra };
  }
  function post(type, text, visibleTo, meta) {
    const m = { id: S.nextMsg++, t: S.t, type, text, vis: new Set(visibleTo), conf: meta && meta.conf, side: meta && meta.side, spin: meta && meta.spin };
    S.log.push(m);
    if (S.log.length > LOG_CAP) S.log.splice(0, S.log.length - LOG_CAP);
    Feed.add(m);
  }
  function say(type, key, side, visibleTo, extra, meta) {
    post(type, CFG.fill(key, vars(side, extra || {})), visibleTo, meta);
  }

  /**
   * Public statement from a side's capital, heard by every perspective.
   * `spin(L)` is evaluated when the statement airs: true = the line is false.
   */
  function statement(side, key, extra, spin, force) {
    after(rand(...CFG.TIMING.statementDelay), () => {
      const L = S.leaders[side];
      if (!force && S.t - (S.lastStmt[side] ?? -1e9) < CFG.TIMING.statementGap) return;
      S.lastStmt[side] = S.t;
      const sd = SIDES[side];
      const line = CFG.fill(key, { title: sd.leader.title, side: sd.short, ...extra });
      post('statement', `${sd.leader.spokesperson}, ${sd.sites.capital.name}: \u201C${line}\u201D`, ALL_P,
        { side, spin: spin ? !!spin(L) : false });
    });
  }
  const notInCapital = (L) => L.location !== 'capital' || !!L.move;

  function locLabel(loc) { return CFG.LOCATIONS[loc].label; }
  function statusLabel(st) { return CFG.STATUSES[st].label; }
  function siteNameOf(L) {
    if (L.location === 'airborne') return SIDES[L.side].leader.airborneCallsign;
    if (L.location === 'convoy') return 'IN TRANSIT';
    return SIDES[L.side].sites[L.site] ? SIDES[L.side].sites[L.site].name : 'UNKNOWN';
  }

  // ---------- leader actions ----------
  function canOrder(side) {
    if (S.leaders[side].status === 'unknown') { say('warning', 'orderRejected', side, truthTo(side)); return false; }
    return true;
  }

  function startMove(side, to, dest) {
    const L = S.leaders[side];
    L.gen++;
    L.move = { from: [...L.pos], to, t0: S.t, dur: clamp(dist(L.pos, to) * 4, 18, 55), dest };
    L.orbit = null;
    L.location = 'convoy';
    L.site = null;
    if (L.status !== 'comms-degraded') L.status = 'relocating';
  }

  function sealBunker(side) {
    const L = S.leaders[side], site = SIDES[side].sites.bunker;
    if (!canOrder(side)) return;
    if (L.location === 'bunker') return say('routine', 'alreadyBunker', side, truthTo(side));
    if (L.move && L.move.dest === 'bunker') return say('routine', 'enRoute', side, truthTo(side), { site: site.name });
    const from = siteNameOf(L);
    startMove(side, [site.lon, site.lat], 'bunker');
    say('relocation', 'sealStart', side, truthTo(side), { from, site: site.name });
    if (Math.random() < 0.7) statement(side, 'stmtLeaderInCapital', {}, notInCapital);
    scheduleIntel(side);
  }

  function scrambleAirborne(side) {
    const L = S.leaders[side], ab = S.sites[side + '.airbase'];
    if (!canOrder(side)) return;
    if (L.location === 'airborne') return say('routine', 'alreadyAirborne', side, truthTo(side));
    if (L.move && L.move.dest === 'airbase') return say('routine', 'enRoute', side, truthTo(side), { site: ab.name });
    if (ab.destroyed) return say('warning', 'airbaseDown', side, truthTo(side), { airbase: ab.name });
    startMove(side, [ab.lon, ab.lat], 'airbase');
    say('relocation', 'scrambleStart', side, truthTo(side), { airbase: ab.name });
    if (Math.random() < 0.7) statement(side, 'stmtLeaderInCapital', {}, notInCapital);
    scheduleIntel(side);
  }

  function deployDecoys(side) {
    const L = S.leaders[side];
    if (!canOrder(side)) return;
    if (L.decoys.length) return say('routine', 'decoysActive', side, truthTo(side), { n: L.decoys.length });
    const n = 3;
    const origin = [...L.pos];
    L.decoys = Array.from({ length: n }, (_, i) => {
      const ang = rand(0, Math.PI * 2), d = rand(4, 8);
      return { label: 'D-' + (i + 1), from: origin, to: [origin[0] + Math.cos(ang) * d, origin[1] + Math.sin(ang) * d * 0.6], pos: [...origin], t0: S.t, dur: rand(25, 45) };
    });
    L.decoyUntil = S.t + CFG.TIMING.decoyLifetime;
    say('relocation', 'decoys', side, truthTo(side), { n });
    const near = siteNameOf(L);
    for (const o of othersOf(side)) {
      after(rand(...CFG.TIMING.intelDelay), () => say('warning', 'intelDecoys', side, [o], { n, site: near }, { conf: Math.round(rand(55, 80)) }));
    }
    scheduleIntel(side);
  }

  function togglePerimeter(side) {
    const L = S.leaders[side];
    if (!L.perimeter && !canOrder(side)) return;
    L.perimeter = !L.perimeter;
    if (L.perimeter) {
      L.perimeterFired = false;
      say('warning', 'perimeterArmed', side, truthTo(side));
      for (const o of othersOf(side)) {
        after(rand(8, 16), () => say('warning', 'intelPerimeter', side, [o], {}, { conf: Math.round(rand(35, 65)) }));
      }
      if (L.status === 'unknown') armPerimeterCountdown(side);
    } else {
      say('routine', 'perimeterDisarmed', side, truthTo(side));
    }
  }

  function setDefcon(side, level, silent) {
    level = clamp(level, 1, 5);
    const prev = S.defcon[side];
    if (level === prev) return;
    S.defcon[side] = level;
    if (!silent) say(level <= 2 ? 'warning' : 'routine', 'defconChange', side, truthTo(side), { defcon: level });
    // Observers notice escalation once per new low-water mark, not per click.
    if (level < prev && level <= 3 && level < (S.readinessSeen[side] || 6)) {
      S.readinessSeen[side] = level;
      statement(side, 'stmtReadiness', { defcon: level });
      for (const o of othersOf(side)) {
        after(rand(10, 20), () => say('routine', 'intelReadiness', side, [o], {}, { conf: Math.round(rand(50, 85)) }));
      }
    }
  }

  // ---------- missiles ----------
  function launch(side, targetKey, n, auto) {
    const fields = Object.values(S.sites).filter((s) => s.side === side && s.kind === 'field' && !s.destroyed);
    if (!fields.length) { say('warning', 'noFields', side, truthTo(side)); return 0; }
    const tgt = S.sites[targetKey];
    if (!tgt) return 0;
    n = Math.min(n, S.inventory[side]);
    if (n <= 0) { say('warning', 'noInventory', side, truthTo(side)); return 0; }
    S.inventory[side] -= n;
    const wave = S.nextWave++;
    for (let i = 0; i < n; i++) {
      const f = fields[i % fields.length];
      const from = [f.lon + rand(-0.8, 0.8), f.lat + rand(-0.5, 0.5)];
      const to = [tgt.lon + rand(-0.5, 0.5), tgt.lat + rand(-0.3, 0.3)];
      const t0 = S.t + i * 2.5;
      const dur = 110 + dist(from, to) * 0.9 + rand(-5, 5);
      const m = {
        id: S.nextMissile++, side, target: tgt.side, targetKey, from, to, t0, dur,
        detectT: t0 + dur * 0.05, detected: false, intercept: 'none', state: 'flight',
        endT: null, endP: null, wave, first: i === 0, waveN: n,
      };
      m.g = arcGeom(m);
      S.missiles.push(m);
    }
    setDefcon(side, 1, true);
    say('critical', auto ? 'perimeterFire' : 'launchOwn', side, truthTo(side), { n, field: fields[0].name, target: tgt.name });
    return n;
  }

  function missileName(m) { return 'M-' + String(m.id).padStart(2, '0'); }

  function onDetect(m) {
    for (const o of othersOf(m.side)) setDefcon(o, Math.min(S.defcon[o], 2), true);
    if (!m.first) return;
    for (const o of othersOf(m.side)) say('critical', 'launchDetected', m.side, [o], { n: m.waveN });
    say('warning', 'incoming', m.target, [m.target], { target: S.sites[m.targetKey].name });
    S.leaders[m.target].lastAttacker = m.side;
    statement(m.target, 'stmtCondemn', { enemy: SIDES[m.side].publicName }, null, true);
    statement(m.side, 'stmtOwnLaunch', { enemy: SIDES[m.target].publicName }, null, true);
    for (const o of SIDE_IDS) {
      if (o !== m.side && o !== m.target) statement(o, 'stmtRestraint', { a: SIDES[m.side].short, b: SIDES[m.target].short });
    }
    aiReact(m);
  }

  function aiControlled(side) { return S.ai && side !== S.control; }

  function aiReact(m) {
    const t = m.target;
    // Targeted side's leadership moves.
    if (aiControlled(t)) {
      const L = S.leaders[t];
      after(rand(3, 8), () => {
        if (L.status === 'unknown') return;
        if (L.location === 'capital' && !L.move) (Math.random() < 0.5 ? sealBunker : scrambleAirborne)(t);
        if (!L.decoys.length && Math.random() < 0.65) after(rand(4, 10), () => deployDecoys(t));
        if (!L.perimeter && Math.random() < 0.35) after(rand(6, 14), () => togglePerimeter(t));
      });
      // Retaliation, rate-limited per attacker pair.
      const key = t + '>' + m.side;
      if ((S.aiCooldown[key] || -1) <= S.t) {
        S.aiCooldown[key] = S.t + 90;
        after(rand(15, 30), () => {
          if (!aiControlled(t) || S.leaders[t].status === 'unknown') return;
          setDefcon(t, 2, true);
          const targets = Object.values(S.sites).filter((s) => s.side === m.side && !s.destroyed);
          if (!targets.length) return;
          const fields = targets.filter((s) => s.kind === 'field');
          launch(t, pick(fields.length && Math.random() < 0.6 ? fields : targets).key, Math.ceil(rand(0.01, 2)), false);
        });
      }
    }
    // Uninvolved AI sides take precautions.
    for (const o of SIDE_IDS) {
      if (o === m.side || o === t || !aiControlled(o)) continue;
      const L = S.leaders[o];
      if (L.location === 'capital' && !L.move && Math.random() < 0.45) after(rand(6, 14), () => sealBunker(o));
    }
  }

  function injectAdversaryLaunch() {
    const me = S.control;
    const attacker = pick(othersOf(me));
    const targets = Object.values(S.sites).filter((s) => s.side === me && !s.destroyed);
    if (!targets.length) return;
    setDefcon(attacker, 1, true);
    launch(attacker, pick(targets).key, Math.ceil(rand(0.01, 2)), false);
  }

  function tickMissiles() {
    for (const m of S.missiles) {
      if (m.state !== 'flight') continue;
      const p = (S.t - m.t0) / m.dur;
      if (p < 0) continue;
      if (!m.detected && S.t >= m.detectT) { m.detected = true; onDetect(m); }
      if (m.intercept === 'none' && p >= 0.55) {
        if (S.interceptors[m.target] > 0) {
          S.interceptors[m.target]--;
          m.intercept = 'engaging';
          say('warning', 'interceptEngage', m.target, [m.target, 'OBS'], { id: missileName(m) });
        } else {
          m.intercept = 'unavailable';
        }
      }
      if (m.intercept === 'engaging' && p >= 0.68) {
        if (Math.random() < SIDES[m.target].interceptP) {
          m.intercept = 'killed'; m.state = 'intercepted'; m.endT = S.t; m.endP = p;
          say('warning', 'interceptKill', m.target, ALL_P, { id: missileName(m) });
          statement(m.target, 'stmtIntercept', {});
          continue;
        }
        m.intercept = 'leaker';
        say('critical', 'interceptFail', m.target, [m.target, 'OBS'], { id: missileName(m) });
      }
      if (p >= 1) { m.state = 'detonated'; m.endT = S.t; m.endP = 1; detonate(m); }
    }
    // Drop long-finished tracks.
    S.missiles = S.missiles.filter((m) => m.state === 'flight' || S.t - m.endT < 60);
  }

  function detonate(m) {
    const tgt = S.sites[m.targetKey];
    S.detonations.push({ pos: m.to, t: S.t, rt: performance.now() });
    if (!tgt.destroyed && dist(m.to, [tgt.lon, tgt.lat]) < 2) { tgt.destroyed = true; staticDirty = true; }
    say('critical', 'detonation', tgt.side, ALL_P, { site: tgt.name });
    statement(tgt.side, 'stmtStrikeOnUs', { site: tgt.name }, null, true);
    for (const s of SIDE_IDS) setDefcon(s, 1, true);
    for (const s of SIDE_IDS) {
      const L = S.leaders[s];
      const d = dist(L.pos, m.to);
      if (d < 3) severeHit(s);
      else if (d < 7) degrade(s);
    }
  }

  // ---------- effects on leadership ----------
  function degrade(side) {
    const L = S.leaders[side];
    if (L.location === 'airborne') { say('routine', 'emp', side, truthTo(side)); return; }
    if (L.status === 'unknown' || L.status === 'comms-degraded') return;
    L.status = 'comms-degraded';
    say('warning', 'commsDegraded', side, truthTo(side), { site: siteNameOf(L) });
    scheduleRecovery(side);
    scheduleIntel(side);
  }

  function scheduleRecovery(side) {
    const L = S.leaders[side];
    after(rand(...CFG.TIMING.commsRecovery), () => {
      if (L.status !== 'comms-degraded') return;
      L.status = L.move ? 'relocating' : 'secure';
      say('routine', 'linkRestored', side, truthTo(side), { status: statusLabel(L.status) });
      scheduleIntel(side);
    });
  }

  function severeHit(side) {
    const L = S.leaders[side];
    if (L.location === 'airborne') { say('routine', 'emp', side, truthTo(side)); return; }
    if (L.location === 'bunker' || (L.location === 'convoy' && Math.random() < 0.5)) { degrade(side); return; }
    if (L.status === 'unknown') return;
    L.status = 'unknown';
    say('critical', 'contactLost', side, truthTo(side), { site: siteNameOf(L) });
    statement(side, 'stmtLeaderSafe', {}, (x) => x.status === 'unknown', true);
    scheduleIntel(side);
    if (L.perimeter) armPerimeterCountdown(side);
    after(rand(...CFG.TIMING.unknownRecovery), () => {
      if (L.status !== 'unknown' || Math.random() < 0.5) return;
      L.status = 'comms-degraded';
      say('warning', 'contactRegained', side, truthTo(side));
      scheduleRecovery(side);
      scheduleIntel(side);
    });
  }

  function armPerimeterCountdown(side) {
    const L = S.leaders[side];
    after(CFG.TIMING.perimeterDelay, () => {
      if (L.status !== 'unknown' || !L.perimeter || L.perimeterFired) return;
      L.perimeterFired = true;
      const enemy = L.lastAttacker || pick(othersOf(side));
      const targets = Object.values(S.sites).filter((s) => s.side === enemy && !s.destroyed);
      if (targets.length) launch(side, pick(targets).key, 3, true);
    });
  }

  // ---------- fog of war ----------
  function scheduleIntel(side) {
    for (const o of othersOf(side)) after(rand(...CFG.TIMING.intelDelay), () => intelReport(o, side, false));
  }

  function intelReport(o, side, quiet) {
    const L = S.leaders[side], C = CFG.CONFIDENCE, prev = S.intel[o][side];
    let conf = C.base[L.location] + rand(-C.noise, C.noise);
    if (L.decoys.length) conf -= C.decoyPenalty;
    if (L.status === 'unknown') conf -= C.unknownPenalty;
    conf = Math.round(clamp(conf, C.min, C.max));
    const jit = ((100 - conf) / 100) * 3.5;
    const truth = {
      pos: [L.pos[0] + rand(-jit, jit), L.pos[1] + rand(-jit, jit) * 0.6],
      location: L.location, siteName: siteNameOf(L),
      status: L.status === 'unknown' ? 'unknown' : (conf < 50 ? null : L.status),
    };
    let report;
    const v = { loc: locLabel(L.location) };

    if (L.status === 'unknown') {
      report = { ...truth, pos: prev.pos, siteName: prev.siteName, conf, candidates: [] };
      if (!quiet || prev.status !== 'unknown') say('warning', 'intelSilent', side, [o], { site: prev.siteName }, { conf });
    } else if (L.decoys.length) {
      const d = pick(L.decoys);
      const fake = { pos: [d.pos[0] + rand(-1, 1), d.pos[1] + rand(-0.6, 0.6)], location: 'convoy', siteName: 'CONVOY ' + d.label.replace('D-', 'SIG-'), status: null, decoy: true };
      let cTrue = Math.round(rand(22, 50)), cFake = Math.round(rand(22, 50));
      // Sometimes the decoy is the better-supported report.
      if ((Math.random() < C.decoyMisleadP) !== (cFake > cTrue)) [cTrue, cFake] = [cFake, cTrue];
      const cands = [{ ...truth, conf: cTrue }, { ...fake, conf: cFake }].sort((a, b) => b.conf - a.conf);
      report = { ...cands[0], candidates: cands };
      if (!quiet || Math.random() < 0.35) {
        say('warning', 'intelConflict', side, [o], {
          a: `${locLabel(cands[0].location)} / ${cands[0].siteName}`, ca: cands[0].conf,
          b: `${locLabel(cands[1].location)} / ${cands[1].siteName}`, cb: cands[1].conf,
        }, { conf: cands[0].conf });
      }
    } else {
      report = { ...truth, conf, candidates: [] };
      const changed = prev.location !== report.location || prev.siteName !== report.siteName;
      if (!quiet || changed) {
        const type = L.location === 'convoy' || L.location === 'airborne' ? 'relocation' : 'routine';
        say(type, 'intelLoc', side, [o], { ...v, site: report.siteName }, { conf });
      }
    }
    report.t = S.t;
    S.intel[o][side] = report;
  }

  // ---------- main tick ----------
  function tickLeaders() {
    for (const side of SIDE_IDS) {
      const L = S.leaders[side];
      if (L.move) {
        const k = (S.t - L.move.t0) / L.move.dur;
        if (k >= 1) arrive(side); else L.pos = lerp(L.move.from, L.move.to, k);
      } else if (L.orbit) {
        const a = (S.t - L.orbit.t0) * L.orbit.w;
        L.pos = [L.orbit.c[0] + Math.cos(a) * L.orbit.r, L.orbit.c[1] + Math.sin(a) * L.orbit.r * 0.6];
      }
      for (const d of L.decoys) d.pos = lerp(d.from, d.to, clamp((S.t - d.t0) / d.dur, 0, 1));
      if (L.decoys.length && S.t > L.decoyUntil) {
        L.decoys = [];
        say('routine', 'decoysRecovered', side, truthTo(side));
        scheduleIntel(side);
      }
    }
  }

  function arrive(side) {
    const L = S.leaders[side], dest = L.move.dest, sd = SIDES[side];
    L.pos = [...L.move.to];
    L.move = null;
    if (L.status === 'relocating') L.status = 'secure';
    if (dest === 'bunker') {
      L.location = 'bunker'; L.site = 'bunker';
      if (S.sites[side + '.bunker'].destroyed && L.status === 'secure') { L.status = 'comms-degraded'; scheduleRecovery(side); }
      say('relocation', 'sealDone', side, truthTo(side), { site: sd.sites.bunker.name });
    } else if (dest === 'airbase') {
      L.location = 'airborne'; L.site = null;
      L.orbit = { c: [sd.sites.airbase.lon + rand(-2, 2), sd.sites.airbase.lat + rand(1, 3)], r: 2.4, t0: S.t, w: 0.06 };
      say('relocation', 'airborne', side, truthTo(side));
      const gen = L.gen;
      after(10, () => {
        if (L.gen === gen && L.location === 'airborne') say('routine', 'climbing', side, truthTo(side), { fl: pick([300, 310, 330, 350]) });
      });
    }
    scheduleIntel(side);
  }

  function tickPeriodic() {
    for (const side of SIDE_IDS) {
      if (S.t >= S.stmtNext[side]) {
        S.stmtNext[side] = S.t + rand(...CFG.TIMING.statementCalm);
        if (S.defcon[side] >= 4) statement(side, 'stmtCalm', {});
        else if (Math.random() < 0.5) statement(side, 'stmtLeaderInCapital', {}, notInCapital);
      }
      if (S.t >= S.routineNext[side]) {
        S.routineNext[side] = S.t + rand(...CFG.TIMING.routineOwn);
        const L = S.leaders[side];
        if (L.status !== 'unknown') say('routine', 'routineOwn', side, truthTo(side), { loc: locLabel(L.location), site: siteNameOf(L), status: statusLabel(L.status) });
      }
      for (const o of othersOf(side)) {
        const k = o + '>' + side;
        if (S.t >= S.intelNext[k]) { S.intelNext[k] = S.t + rand(...CFG.TIMING.intelRefresh); intelReport(o, side, true); }
      }
    }
  }

  function step(dt) {
    let rem = dt;
    while (rem > 0) {
      const h = Math.min(rem, 0.25);
      S.t += h; rem -= h;
      if (S.timers.length) {
        const due = S.timers.filter((x) => x.t <= S.t);
        if (due.length) {
          S.timers = S.timers.filter((x) => x.t > S.t);
          due.sort((a, b) => a.t - b.t).forEach((x) => x.fn());
        }
      }
      tickLeaders();
      tickMissiles();
      tickPeriodic();
    }
  }

  // ---------- map rendering ----------
  function ptsToPath(pts) { return pts.map((p, i) => (i ? 'L' : 'M') + proj(p).map(f1).join(' ')).join('') + 'Z'; }

  function renderBase() {
    let g = '';
    for (let lon = -180; lon <= 180; lon += 30) { const x = f1(proj([lon, 0])[0]); g += `<line class="grat" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`; }
    for (let lat = -60; lat <= 90; lat += 30) { const y = f1(proj([0, lat])[1]); g += `<line class="grat" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`; }
    g += `<path class="land" d="${window.WORLD_MAP.LAND.map(ptsToPath).join('')}"/>`;
    g += `<path class="water" d="${window.WORLD_MAP.WATER.map(ptsToPath).join('')}"/>`;
    $('#layerBase').innerHTML = g;
  }

  function renderSites() {
    let g = '';
    for (const s of Object.values(S.sites)) {
      const [x, y] = proj([s.lon, s.lat]);
      const col = SIDES[s.side].color;
      const title = `<title>${esc(s.name)} (${esc(SIDES[s.side].short)} ${s.kind})${s.destroyed ? ' — DESTROYED' : ''}</title>`;
      const X = f1(x), Y = f1(y);
      if (s.destroyed) {
        g += `<g>${title}<path d="M${f1(x - 3)} ${f1(y - 3)}L${f1(x + 3)} ${f1(y + 3)}M${f1(x + 3)} ${f1(y - 3)}L${f1(x - 3)} ${f1(y + 3)}" stroke="#7a8590" stroke-width="1.2"/>`;
      } else if (s.kind === 'capital') {
        g += `<g>${title}<circle class="pulse" cx="${X}" cy="${Y}" r="4" fill="none" stroke="${col}" stroke-width="1"/><circle cx="${X}" cy="${Y}" r="2.6" fill="${col}" stroke="#0a0e14" stroke-width=".8"/>`;
      } else if (s.kind === 'bunker') {
        g += `<g>${title}<rect class="pulse" style="animation-delay:.8s" x="${f1(x - 3)}" y="${f1(y - 3)}" width="6" height="6" fill="none" stroke="${col}" stroke-width=".8"/><rect x="${f1(x - 2.4)}" y="${f1(y - 2.4)}" width="4.8" height="4.8" fill="#0a0e14" stroke="${col}" stroke-width="1.2"/>`;
      } else if (s.kind === 'airbase') {
        g += `<g>${title}<path class="pulse" style="animation-delay:1.6s" d="M${X} ${f1(y - 4)}L${f1(x + 3.6)} ${f1(y + 2.6)}L${f1(x - 3.6)} ${f1(y + 2.6)}Z" fill="none" stroke="${col}" stroke-width=".8"/><path d="M${X} ${f1(y - 3)}L${f1(x + 2.8)} ${f1(y + 2)}L${f1(x - 2.8)} ${f1(y + 2)}Z" fill="#0a0e14" stroke="${col}" stroke-width="1.1"/>`;
      } else {
        g += `<g>${title}<path d="M${X} ${f1(y - 2.4)}L${f1(x + 2.2)} ${f1(y + 1.6)}L${f1(x - 2.2)} ${f1(y + 1.6)}Z" fill="${col}" opacity=".75"/>`;
      }
      if (s.kind !== 'field') {
        const place = s.label || { capital: 'right', bunker: 'below', airbase: 'above' }[s.kind];
        const [dx, dy, anchor] = { left: [-6, 2.5, 'end'], right: [6, 2.5, 'start'], above: [5, -6, 'start'], below: [5, 11, 'start'] }[place];
        g += `<text class="site-lbl${s.destroyed ? ' dead' : ''}" x="${f1(x + dx)}" y="${f1(y + dy)}" text-anchor="${anchor}">${esc(s.name)}</text>`;
      }
      g += '</g>';
    }
    $('#layerSites').innerHTML = g;
    staticDirty = false;
  }

  function arcGeom(m) {
    const a = proj(m.from), b = proj(m.to);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return { a, b, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - d * 0.35] };
  }
  function bez(g, u) {
    const v = 1 - u;
    return [v * v * g.a[0] + 2 * v * u * g.c[0] + u * u * g.b[0], v * v * g.a[1] + 2 * v * u * g.c[1] + u * u * g.b[1]];
  }
  function segPath(g, u0, u1) {
    if (u1 <= u0) return '';
    const n = Math.max(2, Math.ceil((u1 - u0) * 40));
    let d = '';
    for (let i = 0; i <= n; i++) { const p = bez(g, u0 + ((u1 - u0) * i) / n); d += (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); }
    return d;
  }
  function phaseOf(p) { return p < PHASE.boostEnd ? 'boost' : p < PHASE.termStart ? 'mid' : 'term'; }

  function missileVisible(m, p) { return p === 'OBS' || m.side === p || m.detected; }

  function renderDyn(now) {
    const P = S.perspective;
    let g = '';

    // Missile tracks
    for (const m of S.missiles) {
      if (!missileVisible(m, P)) continue;
      const p = m.state === 'flight' ? (S.t - m.t0) / m.dur : m.endP;
      if (p < 0) continue;
      const G = m.g;
      if (m.state === 'flight') {
        g += `<path class="traj" d="M${f1(G.a[0])} ${f1(G.a[1])}Q${f1(G.c[0])} ${f1(G.c[1])} ${f1(G.b[0])} ${f1(G.b[1])}"/>`;
        g += `<path class="seg seg-boost" d="${segPath(G, 0, Math.min(p, PHASE.boostEnd))}"/>`;
        if (p > PHASE.boostEnd) g += `<path class="seg seg-mid" d="${segPath(G, PHASE.boostEnd, Math.min(p, PHASE.termStart))}"/>`;
        if (p > PHASE.termStart) g += `<path class="seg seg-term" d="${segPath(G, PHASE.termStart, p)}"/>`;
        const h = bez(G, p), ph = phaseOf(p);
        const col = ph === 'boost' ? '#ff9a4d' : ph === 'mid' ? '#ff5c5c' : '#ff2a2a';
        g += `<circle cx="${f1(h[0])}" cy="${f1(h[1])}" r="${ph === 'term' ? 2.6 : 2}" fill="#fff" stroke="${col}" stroke-width="1.4" filter="url(#glow)"/>`;
        g += `<text class="m-lbl" x="${f1(h[0] + 4)}" y="${f1(h[1] - 3)}">${missileName(m)}</text>`;
      } else if (S.t - m.endT < 20) {
        g += `<path class="seg seg-dead" d="${segPath(G, 0, p)}" opacity="${f1(1 - (S.t - m.endT) / 20)}"/>`;
        if (m.state === 'intercepted') {
          const h = bez(G, p);
          g += `<path d="M${f1(h[0] - 3)} ${f1(h[1] - 3)}L${f1(h[0] + 3)} ${f1(h[1] + 3)}M${f1(h[0] + 3)} ${f1(h[1] - 3)}L${f1(h[0] - 3)} ${f1(h[1] + 3)}" stroke="#4fd1e0" stroke-width="1.4"/>`;
        }
      }
    }

    // Detonations: expanding rings (real-time animation) + persistent mark
    for (const d of S.detonations) {
      const [x, y] = proj(d.pos);
      const age = (now - d.rt) / 2600;
      if (age < 1 && !reduceMotion) {
        for (const off of [0, 0.25]) {
          const k = age - off;
          if (k <= 0 || k >= 1) continue;
          g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(3 + k * 38)}" fill="none" stroke="#ff3b3b" stroke-width="${f1(2.2 * (1 - k) + 0.3)}" opacity="${f1(1 - k)}"/>`;
        }
        g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(6 * (1 - age))}" fill="#fff4e0" opacity="${f1(1 - age)}"/>`;
      }
      g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="9" fill="none" stroke="#ff3b3b" stroke-width=".6" stroke-dasharray="1.5 2" opacity=".6"/>`;
      g += `<text x="${f1(x)}" y="${f1(y + 3)}" text-anchor="middle" font-size="9" fill="#ff3b3b">✹</text>`;
    }

    // Leaders
    for (const side of SIDE_IDS) {
      const col = SIDES[side].color, abbr = SIDES[side].leader.abbr;
      const L = S.leaders[side];
      if (P === 'OBS' || P === side) {
        for (const d of L.decoys) {
          const [x, y] = proj(d.pos);
          g += `<g opacity=".8"><path d="M${f1(x)} ${f1(y - 3.2)}L${f1(x + 3.2)} ${f1(y)}L${f1(x)} ${f1(y + 3.2)}L${f1(x - 3.2)} ${f1(y)}Z" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="1.5 1"/><text class="ldr-lbl" x="${f1(x + 5)}" y="${f1(y + 2.5)}" fill="${col}" opacity=".8">${d.label} DECOY</text></g>`;
        }
        g += leaderMarker(proj(L.pos), col, `${abbr} ${CFG.STATUSES[L.status].icon}${L.location === 'airborne' ? ' ✈' : ''}`, 100, true, L.status);
      } else {
        const I = S.intel[P][side];
        const cands = I.candidates && I.candidates.length ? I.candidates : [I];
        cands.forEach((c, i) => {
          g += leaderMarker(proj(c.pos), col, `${abbr}? ${c.conf}%${i ? ' (alt)' : ''}`, c.conf, false, c.status || 'unknown');
        });
      }
    }
    $('#layerDyn').innerHTML = g;
  }

  function leaderMarker([x, y], col, label, conf, own, status) {
    const halo = own ? 7 : 6 + (100 - conf) * 0.42;
    const dash = own ? '' : ' stroke-dasharray="3 2"';
    const core = status === 'unknown'
      ? `<text x="${f1(x)}" y="${f1(y + 3)}" text-anchor="middle" font-size="9" font-weight="700" fill="${col}">?</text>`
      : `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.2" fill="${own ? col : '#0a0e14'}" stroke="${col}" stroke-width="1.4"/>`;
    return `<g><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(halo)}" fill="${col}" fill-opacity="${own ? 0.18 : 0.08}" stroke="${col}" stroke-opacity=".7" stroke-width=".8"${dash}/>${core}` +
      `<text class="ldr-lbl" x="${f1(x + 5)}" y="${f1(y - 5)}" fill="${col}" stroke="#0a0e14" stroke-width="2.2" paint-order="stroke">${esc(label)}</text></g>`;
  }

  // ---------- feed ----------
  const TYPE_BADGE = { routine: '· RTN', relocation: '➜ MOV', warning: '▲ WRN', critical: '✹ CRIT', statement: '❝ STMT' };
  const Feed = {
    paused: false, pending: 0, showStmt: true,
    shows(m) { return m.vis.has(S.perspective) && (this.showStmt || m.type !== 'statement'); },
    el: null,
    node(m, fresh) {
      const li = document.createElement('li');
      li.className = 't-' + m.type + (fresh && !reduceMotion ? ' new' : '');
      if (m.side) li.style.setProperty('--side', SIDES[m.side].color);
      // Only the issuing side and the Observer know a public line is false.
      const spin = m.spin && (S.perspective === 'OBS' || S.perspective === m.side)
        ? '<span class="conf spin" title="Contradicts ground truth">SPIN</span>' : '';
      li.innerHTML = `<time>[T+${fmtT(m.t)}]</time><span class="badge">${TYPE_BADGE[m.type]}</span>` +
        `<span class="txt">${esc(m.text)}${spin}${m.conf != null ? `<span class="conf" title="Report confidence">CONF ${m.conf}%</span>` : ''}</span>`;
      return li;
    },
    add(m) {
      if (!this.shows(m)) return;
      if (this.paused) { this.pending++; this.updateBtn(); return; }
      const empty = this.el.querySelector('.feed-empty');
      if (empty) empty.remove();
      this.el.prepend(this.node(m, true));
      while (this.el.children.length > FEED_CAP) this.el.lastElementChild.remove();
      this.updateCount();
    },
    rebuild() {
      const msgs = S.log.filter((m) => this.shows(m)).slice(-FEED_CAP).reverse();
      this.el.innerHTML = '';
      if (!msgs.length) this.el.innerHTML = '<li class="feed-empty">No traffic yet. Try SEAL BUNKER or SCRAMBLE AIRBORNE POST.</li>';
      const frag = document.createDocumentFragment();
      msgs.forEach((m) => frag.appendChild(this.node(m, false)));
      this.el.appendChild(frag);
      this.pending = 0;
      this.updateBtn();
      this.updateCount();
    },
    updateCount() { $('#feedCount').textContent = this.el.querySelectorAll('li:not(.feed-empty)').length + '/' + FEED_CAP; },
    updateBtn() {
      const b = $('#btnFeedPause');
      b.setAttribute('aria-pressed', String(this.paused));
      b.textContent = this.paused ? `▶ RESUME${this.pending ? ` (${this.pending})` : ''}` : '❚❚ HOLD';
    },
    toggle() { this.paused = !this.paused; if (!this.paused) this.rebuild(); else this.updateBtn(); },
  };

  // ---------- panels ----------
  function renderTopbar() {
    const P = S.perspective;
    const lvl = P === 'OBS' ? Math.min(...SIDE_IDS.map((s) => S.defcon[s])) : S.defcon[P];
    const cells = $('#defconCells').children;
    for (let i = 0; i < 5; i++) {
      const n = 5 - i, on = n >= lvl;
      cells[i].className = on ? 'on' + (lvl <= 1 && n === 1 ? ' max' : lvl <= 3 ? ' warn' : '') : '';
    }
    $('#defconText').innerHTML = `DEFCON ${lvl}<small>${P === 'OBS' ? 'HIGHEST · ' : ''}${DEFCON_NAMES[lvl]}</small>`;
    const clk = $('#clock');
    clk.textContent = 'T+' + fmtT(S.t);
    clk.classList.toggle('paused', !S.running);
  }

  function renderLeadership() {
    const P = S.perspective;
    let rows = '';
    for (const side of SIDE_IDS) {
      const sd = SIDES[side];
      let loc, site, status, conf;
      if (P === 'OBS' || P === side) {
        const L = S.leaders[side];
        loc = L.location; site = siteNameOf(L); status = L.status; conf = 100;
        if (L.decoys.length) site += ` · ${L.decoys.length} decoys`;
        if (L.perimeter) site += ' · PERIMETER ARMED';
      } else {
        const I = S.intel[P][side];
        loc = I.location; site = I.siteName + (I.candidates && I.candidates.length > 1 ? ' (conflicting)' : ''); status = I.status; conf = I.conf;
      }
      const LOC = CFG.LOCATIONS[loc];
      const ST = status ? CFG.STATUSES[status] : { icon: '~', label: 'UNCONFIRMED' };
      rows += `<tr><td class="who" style="color:${sd.color}" title="${esc(sd.leader.title)}">${sd.glyph} ${esc(sd.leader.abbr)}</td>` +
        `<td>${LOC.icon} ${LOC.label}<span class="site">${esc(site)}</span></td>` +
        `<td class="st-${status || 'unknown'}">${ST.icon} ${ST.label}</td>` +
        `<td><span class="conf-pill${conf < 50 ? ' low' : ''}">${conf === 100 ? 'TRUTH' : conf + '%'}</span></td></tr>`;
    }
    $('#leadBody').innerHTML = rows;
  }

  function renderTelemetry() {
    const P = S.perspective;
    const list = S.missiles
      .filter((m) => missileVisible(m, P) && S.t >= m.t0)
      .sort((a, b) => {
        const fa = a.state === 'flight', fb = b.state === 'flight';
        if (fa !== fb) return fa ? -1 : 1;
        return (a.t0 + a.dur) - (b.t0 + b.dur);
      })
      .slice(0, 24);
    $('#telCount').textContent = list.filter((m) => m.state === 'flight').length + ' in flight';
    if (!list.length) { $('#telemetry').innerHTML = '<div class="tel-empty">No tracks. Board is quiet.</div>'; return; }
    $('#telemetry').innerHTML = list.map((m) => {
      const p = m.state === 'flight' ? clamp((S.t - m.t0) / m.dur, 0, 1) : m.endP;
      let ph, phLabel;
      if (m.state === 'intercepted') { ph = 'done'; phLabel = '✕ INTERCEPTED'; }
      else if (m.state === 'detonated') { ph = 'done'; phLabel = '✹ DETONATED'; }
      else { ph = phaseOf(p); phLabel = { boost: '▲ BOOST', mid: '◆ MIDCOURSE', term: '▼ TERMINAL' }[ph]; }
      const icpt = {
        none: ['◎ TRACKING', ''], unavailable: ['— NO INTERCEPTORS', ''], engaging: ['⟳ ENGAGING', 'ic-eng'],
        killed: ['✓ KILL CONFIRMED', 'ic-kill'], leaker: ['! LEAKER', 'ic-leak'],
      }[m.intercept];
      const fog = P !== 'OBS' && m.side !== P && m.target !== P && p < 0.5;
      const tgtName = fog ? `${SIDES[m.target].short} (est.)` : S.sites[m.targetKey].name;
      const tti = m.state === 'flight' ? fmtT(m.t0 + m.dur - S.t) : '--:--';
      return `<article class="mcard ph-${ph}" aria-label="${missileName(m)} ${phLabel}">` +
        `<header><span>${missileName(m)}</span><span>${sideTag(m.side)} → ${sideTag(m.target)}</span></header>` +
        `<div class="row"><span class="k">TGT</span><span>${esc(tgtName)}</span></div>` +
        `<div class="row"><span class="k">PHASE</span><span>${phLabel}</span></div>` +
        `<div class="row"><span class="k">TTI</span><span class="tti">${tti}</span></div>` +
        `<div class="row"><span class="k">ICPT</span><span class="${icpt[1]}">${icpt[0]}</span></div>` +
        `<div class="bar" role="progressbar" aria-label="Flight progress" aria-valuenow="${Math.round(p * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${(p * 100).toFixed(0)}%"></i></div>` +
        `</article>`;
    }).join('');
  }

  function setBtnLabel(btn, text) {
    btn.dataset.label = text;
    if (!btn.classList.contains('confirming')) btn.querySelector('.lbl').textContent = text;
  }

  let lastTargetSig = '';
  function renderControls() {
    const c = S.control, L = S.leaders[c];
    const ST = CFG.STATUSES[L.status], LOC = CFG.LOCATIONS[L.location];
    $('#ownLeader').textContent = `${SIDES[c].leader.abbr} · ${LOC.icon} ${LOC.label} · ${ST.icon} ${ST.label}`;
    $('#ownPerimeter').textContent = L.perimeter ? '⚠ ARMED' : '○ SAFE';
    $('#ownDefcon').textContent = `DEFCON ${S.defcon[c]} · ${DEFCON_NAMES[S.defcon[c]]}`;
    $('#invMissiles').textContent = S.inventory[c];
    $('#invInterceptors').textContent = S.interceptors[c];
    $('#controlSide').disabled = S.perspective !== 'OBS';
    $('#btnEscalate').disabled = S.defcon[c] <= 1;
    $('#btnDeescalate').disabled = S.defcon[c] >= 5;

    const silent = L.status === 'unknown';
    const hint = $('#strikeHint');
    const strike = $('#btnStrike');
    let reason = '';
    if (silent) reason = '? Leader silent: no release authority.';
    else if (S.defcon[c] > 2) reason = '▲ Requires DEFCON 2 or lower.';
    else if (S.inventory[c] <= 0) reason = '— Inventory exhausted.';
    strike.disabled = !!reason;
    hint.textContent = reason || 'Two-step confirm required.';
    hint.className = 'hint' + (reason ? ' warn' : '');

    $('#btnSeal').disabled = silent || L.location === 'bunker';
    $('#btnAirborne').disabled = silent || L.location === 'airborne' || S.sites[c + '.airbase'].destroyed;
    $('#btnDecoys').disabled = silent || L.decoys.length > 0;
    setBtnLabel($('#btnDecoys'), L.decoys.length ? `DECOYS ACTIVE (${L.decoys.length})` : 'DEPLOY DECOYS');
    const perim = $('#btnPerimeter');
    setBtnLabel(perim, L.perimeter ? 'DISARM PERIMETER' : 'ARM PERIMETER');
    perim.disabled = !L.perimeter && silent;

    // Target list: rebuild only when options change, keep selection.
    const opts = Object.values(S.sites).filter((s) => s.side !== c);
    const sig = c + opts.map((s) => s.key + s.destroyed).join();
    if (sig !== lastTargetSig) {
      lastTargetSig = sig;
      const sel = $('#targetSel'), prev = sel.value;
      sel.innerHTML = othersOf(c).map((side) =>
        `<optgroup label="${SIDES[side].glyph} ${esc(SIDES[side].name)}">` +
        opts.filter((s) => s.side === side).map((s) => `<option value="${s.key}"${s.destroyed ? ' disabled' : ''}>${esc(s.name)} · ${s.kind}${s.destroyed ? ' (destroyed)' : ''}</option>`).join('') +
        '</optgroup>').join('');
      if (prev && sel.querySelector(`option[value="${prev}"]:not([disabled])`)) sel.value = prev;
      else { const first = sel.querySelector('option:not([disabled])'); if (first) sel.value = first.value; }
    }
  }

  function renderPanels() {
    renderTopbar();
    renderControls();
    renderLeadership();
    renderTelemetry();
    const P = S.perspective;
    $('#mapSub').textContent = P === 'OBS' ? 'Observer · ground truth' : `${SIDES[P].short} view · fog of war on`;
  }

  // ---------- two-step confirm ----------
  function announce(t) { $('#srAnnounce').textContent = t; }
  function disarmConfirm(btn) {
    btn.classList.remove('confirming');
    clearTimeout(btn._confirmTimer);
    btn.querySelector('.lbl').textContent = btn.dataset.label || btn.querySelector('.lbl').textContent;
  }
  function disarmAll() { document.querySelectorAll('button.confirming').forEach(disarmConfirm); }
  /** Wire a button; `needsConfirm()` decides per click whether the 2-step applies. */
  function wire(btn, action, needsConfirm) {
    const lbl = btn.querySelector('.lbl');
    if (lbl && !btn.dataset.label) btn.dataset.label = lbl.textContent;
    btn.addEventListener('click', () => {
      if (btn.dataset.confirm && (!needsConfirm || needsConfirm()) && !btn.classList.contains('confirming')) {
        disarmAll();
        btn.classList.add('confirming');
        lbl.textContent = btn.dataset.confirm;
        announce(btn.dataset.confirm + '. Press Escape to cancel.');
        btn._confirmTimer = setTimeout(() => disarmConfirm(btn), 4000);
        return;
      }
      disarmConfirm(btn);
      action();
      renderPanels();
    });
  }

  // ---------- wiring ----------
  function setPerspective(p) {
    S.perspective = p;
    if (p !== 'OBS') { S.control = p; $('#controlSide').value = p; }
    lastTargetSig = '';
    disarmAll();
    Feed.rebuild();
    renderPanels();
  }

  function setRunning(r) {
    S.running = r;
    const b = $('#btnPlay');
    b.textContent = r ? '❚❚ PAUSE' : '▶ RUN';
    b.setAttribute('aria-label', r ? 'Pause simulation' : 'Run simulation');
    renderTopbar();
  }

  function reset() {
    const keep = { perspective: S.perspective, control: S.control, speed: S.speed, ai: S.ai };
    S = initState();
    Object.assign(S, keep);
    staticDirty = true;
    lastTargetSig = '';
    setRunning(true);
    post('routine', 'Scenario reset. All leadership entities at capital, status SECURE.', ALL_P);
    Feed.rebuild();
    renderPanels();
  }

  function init() {
    S = initState();
    Feed.el = $('#feed');
    renderBase();

    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      S.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (!S.running) setRunning(true);
    }));
    $('#btnPlay').addEventListener('click', () => setRunning(!S.running));
    $('#perspective').addEventListener('change', (e) => setPerspective(e.target.value));
    $('#controlSide').addEventListener('change', (e) => { S.control = e.target.value; lastTargetSig = ''; disarmAll(); renderPanels(); });
    $('#aiToggle').addEventListener('change', (e) => { S.ai = e.target.checked; });

    let salvo = 1;
    document.querySelectorAll('[data-salvo]').forEach((b) => b.addEventListener('click', () => {
      salvo = +b.dataset.salvo;
      document.querySelectorAll('[data-salvo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));

    $('#btnEscalate').addEventListener('click', () => { setDefcon(S.control, S.defcon[S.control] - 1); renderPanels(); });
    $('#btnDeescalate').addEventListener('click', () => { setDefcon(S.control, S.defcon[S.control] + 1); renderPanels(); });
    wire($('#btnStrike'), () => {
      const c = S.control;
      if (!canOrder(c)) return;
      if (S.defcon[c] > 2) return say('warning', 'defconGate', c, truthTo(c), { defcon: S.defcon[c] });
      const key = $('#targetSel').value;
      if (key) launch(c, key, salvo, false);
    });
    wire($('#btnSeal'), () => sealBunker(S.control));
    wire($('#btnAirborne'), () => scrambleAirborne(S.control));
    wire($('#btnDecoys'), () => deployDecoys(S.control));
    wire($('#btnPerimeter'), () => togglePerimeter(S.control), () => !S.leaders[S.control].perimeter);
    wire($('#btnInject'), injectAdversaryLaunch);
    wire($('#btnReset'), reset);
    $('#btnFeedPause').addEventListener('click', () => Feed.toggle());
    $('#btnStmt').addEventListener('click', (e) => {
      Feed.showStmt = !Feed.showStmt;
      e.currentTarget.setAttribute('aria-pressed', String(Feed.showStmt));
      Feed.rebuild();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { disarmAll(); announce('Confirmation cancelled.'); }
      if (e.code === 'Space' && !/^(INPUT|SELECT|BUTTON|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); setRunning(!S.running);
      }
    });

    const sizeVars = () => {
      document.documentElement.style.setProperty('--top-h', $('#topbar').offsetHeight + 'px');
      document.documentElement.style.setProperty('--foot-h', $('#footer').offsetHeight + 'px');
    };
    window.addEventListener('resize', sizeVars);
    sizeVars();

    post('routine', 'Simulation online. All leadership entities at capital, status SECURE.', ALL_P);
    Feed.rebuild();
    renderPanels();

    let last = performance.now(), uiAcc = 0;
    function frame(now) {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (S.running) step(dtReal * S.speed);
      if (staticDirty) renderSites();
      renderDyn(now);
      uiAcc += dtReal;
      if (uiAcc > 0.2) { uiAcc = 0; renderPanels(); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Test hook for automated checks; harmless in normal use.
    window.__sim = { get state() { return S; }, step, sealBunker, scrambleAirborne, deployDecoys, togglePerimeter, launch, setPerspective };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
