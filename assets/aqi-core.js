/**
 * Hawa — aqi-core.js  (v3)
 * Pure logic only: CPCB categories, PM sub-index conversion, verdicts,
 * decisions, plus v3 helpers — multi-city compare sorting, 7-day outlook
 * aggregation, 24-hour history shaping, day-over-day change, and family
 * profile (de)serialisation. No DOM, no fetch, no storage access here —
 * everything is unit-testable (see tests.js). Exposed as window.HawaCore.
 *
 * Architecture:
 *   aqi-core.js → pure maths & data shaping (this file)
 *   app.js      → DOM wiring, Open-Meteo fetch, localStorage, rendering
 *   tests.js    → assertion suite over this file (HawaTests.run())
 *   styles.css  → design tokens & components (light + dark themes)
 */
(function (global) {
  'use strict';

  // --- CPCB categories (India National AQI) ---
  var CATEGORIES = [
    { max: 50,  name: 'Good',         color: '#22a14b', health: 'Minimal health impact', verdict: "Go — it's a clean-air day.", verdictText: 'Enjoy the outdoors fully. Ventilate the whole home and get everyone outside.' },
    { max: 100, name: 'Satisfactory', color: '#8aa80e', health: 'Minor breathing discomfort for very sensitive people', verdict: 'Go, with light awareness.', verdictText: 'Normal day for almost everyone. Sensitive family members should notice any symptoms.' },
    { max: 200, name: 'Moderate',     color: '#d9a406', health: 'Discomfort for people with lung or heart conditions', verdict: 'Mostly go — protect the sensitive.', verdictText: 'Shorten heavy outdoor activity for kids, grandparents and anyone with asthma. Ventilate in the afternoon.' },
    { max: 300, name: 'Poor',         color: '#f97316', health: 'Health effects increase for everyone', verdict: 'Stay in by default today.', verdictText: 'Keep outdoor time short and essential-only. Move play and exercise indoors.' },
    { max: 400, name: 'Very Poor',    color: '#dc2626', health: 'Respiratory illness risk on prolonged exposure', verdict: 'Indoors day — treat it seriously.', verdictText: 'Cancel outdoor sport and long walks. Seal the home, run purifiers, N95 for any essential trip.' },
    { max: 500, name: 'Severe',       color: '#7e0023', health: 'Serious effects even for healthy people', verdict: 'Seal and stay in. Essential trips only.', verdictText: 'No outdoor exertion for anyone. Keep the home sealed and the purifier running; check on elderly neighbours.' }
  ];

  function clampAQI(v) { return Math.max(0, Math.min(500, Math.round(Number(v) || 0))); }

  /** Band index 0–5 for an AQI value. */
  function categoryIndex(aqi) {
    var v = clampAQI(aqi);
    for (var i = 0; i < CATEGORIES.length; i++) { if (v <= CATEGORIES[i].max) return i; }
    return 5;
  }
  function categoryFor(aqi) { return CATEGORIES[categoryIndex(aqi)]; }

  // --- CPCB breakpoint tables: [concLow, concHigh, indexLow, indexHigh] ---
  var PM25_BREAKPOINTS = [
    [0, 30, 0, 50], [31, 60, 51, 100], [61, 90, 101, 200],
    [91, 120, 201, 300], [121, 250, 301, 400], [251, 500, 401, 500]
  ];
  var PM10_BREAKPOINTS = [
    [0, 50, 0, 50], [51, 100, 51, 100], [101, 250, 101, 200],
    [251, 350, 201, 300], [351, 430, 301, 400], [431, 1000, 401, 500]
  ];

  /** Linear interpolation inside the matching CPCB bracket. */
  function subIndex(conc, table) {
    var c = Number(conc);
    if (!isFinite(c) || c <= 0) return 0;
    for (var i = 0; i < table.length; i++) {
      var b = table[i];
      if (c <= b[1] || i === table.length - 1) {
        var val = ((b[3] - b[2]) / (b[1] - b[0])) * (c - b[0]) + b[2];
        return Math.max(0, Math.min(500, Math.round(val)));
      }
    }
    return 500;
  }
  function pm25SubIndex(conc) { return subIndex(conc, PM25_BREAKPOINTS); }
  function pm10SubIndex(conc) { return subIndex(conc, PM10_BREAKPOINTS); }

  /** CPCB AQI = max of pollutant sub-indices. US AQI is never used here. */
  function computeCPCBaqi(pm25, pm10) {
    var a = pm25 == null ? 0 : pm25SubIndex(pm25);
    var b = pm10 == null ? 0 : pm10SubIndex(pm10);
    return Math.max(a, b);
  }

  /**
   * Best (lowest) and worst (highest) hours from [{time, aqi}] series.
   * Hours with no reading (aqi == null) are ignored — a missing hour must
   * never win "best" by looking like AQI 0. Null when no hour has data.
   */
  function bestWorstWindows(hourly) {
    var best = null, worst = null;
    (hourly || []).forEach(function (h) {
      if (!h || h.aqi == null || !isFinite(h.aqi)) return;
      if (!best || h.aqi < best.aqi) best = h;
      if (!worst || h.aqi > worst.aqi) worst = h;
    });
    return best ? { best: best, worst: worst } : null;
  }

  /* ================= v3 helpers ================= */

  /**
   * Multi-city compare: sort [{name, aqi}] cleanest → dirtiest.
   * Entries with no reading (aqi == null) sink to the end. Input not mutated.
   */
  function sortCompare(cities) {
    return (cities || []).slice().sort(function (a, b) {
      var av = a.aqi == null ? Infinity : a.aqi;
      var bv = b.aqi == null ? Infinity : b.aqi;
      return av - bv;
    });
  }

  /**
   * 7-day outlook: group an hourly [{time, aqi}] series by calendar date
   * (first 10 chars of the ISO time) → [{date, avg, max, min, hours}],
   * sorted by date. avg is the day's mean CPCB AQI, rounded.
   * Missing data is never a value: an hour with aqi == null contributes
   * nothing (not even to the min/max range), and a date whose hours are
   * ALL missing still appears — with avg/max/min = null and hours = 0 —
   * so the UI can show it as unavailable instead of inventing AQI 0.
   */
  function dailyOutlook(hourly) {
    var byDate = {};
    (hourly || []).forEach(function (h) {
      if (!h || typeof h.time !== 'string' || h.time.length < 10) return;
      var d = h.time.slice(0, 10);
      if (!byDate[d]) byDate[d] = { date: d, sum: 0, max: -Infinity, min: Infinity, hours: 0 };
      if (h.aqi == null || !isFinite(h.aqi)) return; // no reading this hour
      var g = byDate[d];
      g.sum += h.aqi; g.hours += 1;
      if (h.aqi > g.max) g.max = h.aqi;
      if (h.aqi < g.min) g.min = h.aqi;
    });
    return Object.keys(byDate).sort().map(function (d) {
      var g = byDate[d];
      if (!g.hours) return { date: d, avg: null, max: null, min: null, hours: 0 };
      return { date: d, avg: Math.round(g.sum / g.hours), max: g.max, min: g.min, hours: g.hours };
    });
  }

  /**
   * Best / worst day of an outlook by daily average. Days with no data
   * (avg == null) are ignored — they can never be "best" or "worst".
   * Null when no day has data.
   */
  function bestWorstDays(days) {
    var best = null, worst = null;
    (days || []).forEach(function (d) {
      if (!d || d.avg == null || !isFinite(d.avg)) return;
      if (!best || d.avg < best.avg) best = d;
      if (!worst || d.avg > worst.avg) worst = d;
    });
    return best ? { best: best, worst: worst } : null;
  }

  /**
   * History strip data: take the last `count` entries of a time-ordered
   * [{time, aqi}] series and add a bar height (4–100% of the 500 scale)
   * plus the CPCB colour, ready for rendering as a bar chart.
   * When `nowMs` (epoch ms) is given, entries timestamped after it are
   * dropped first — a history chart must never show future hours.
   * Timestamps come from entry.ms when numeric, else Date.parse(entry.time);
   * entries with no readable timestamp are kept (they cannot be proven
   * to be in the future).
   */
  function historySeries(hourly, count, nowMs) {
    var n = count || 24;
    var rows = (hourly || []).filter(function (h) { return h && h.aqi != null && isFinite(h.aqi); });
    if (nowMs != null && isFinite(nowMs)) {
      rows = rows.filter(function (h) {
        var t = typeof h.ms === 'number' ? h.ms : Date.parse(h.time);
        return !isFinite(t) || t <= nowMs;
      });
    }
    rows = rows.slice(Math.max(0, rows.length - n));
    return rows.map(function (h) {
      var aqi = clampAQI(h.aqi);
      return { time: h.time, aqi: aqi, heightPct: Math.max(4, Math.round(aqi / 500 * 100)), color: categoryFor(aqi).color };
    });
  }

  /**
   * "What changed today": compare today's AQI with yesterday's same-hour
   * reading. Returns null when either side is missing — never guessed.
   */
  function dayChange(today, yesterday) {
    if (today == null || yesterday == null || !isFinite(today) || !isFinite(yesterday)) return null;
    var delta = Math.round(today) - Math.round(yesterday);
    var direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    var text = direction === 'same'
      ? 'Same as yesterday at this hour (' + Math.round(today) + ').'
      : Math.abs(delta) + ' points ' + (direction === 'up' ? 'worse' : 'better') +
        ' than yesterday at this hour (' + Math.round(yesterday) + ' → ' + Math.round(today) + ').';
    return { delta: delta, direction: direction, text: text };
  }

  // --- Family profiles: validated (de)serialisation for localStorage ---
  var MEMBER_KEYS = ['kids', 'elderly', 'asthma', 'pregnant', 'pets', 'wfh'];
  var HOME_TYPES = ['apartment', 'independent', 'hostel'];
  var TRAVEL_MODES = ['walk', 'auto', 'metro', 'none'];

  /** Normalise any object into a safe profile, or null if unusable. */
  function sanitizeProfile(p) {
    if (!p || typeof p !== 'object') return null;
    var members = {};
    MEMBER_KEYS.forEach(function (k) { members[k] = !!(p.members && p.members[k]); });
    return {
      members: members,
      purifier: p.purifier === 'no' ? 'no' : 'yes',
      home: HOME_TYPES.indexOf(p.home) >= 0 ? p.home : 'apartment',
      travel: TRAVEL_MODES.indexOf(p.travel) >= 0 ? p.travel : 'walk'
    };
  }
  function encodeProfile(p) {
    var clean = sanitizeProfile(p);
    return clean ? JSON.stringify(clean) : null;
  }
  function decodeProfile(json) {
    if (!json || typeof json !== 'string') return null;
    try { return sanitizeProfile(JSON.parse(json)); } catch (e) { return null; }
  }

  // --- Decision cards per category: [label, value, note, dotColor] ---
  var DECISIONS = [
    [['School run','Walk or cycle','Fresh air all the way','#22a14b'],['Morning walk','Go — full route','Best part of the day','#22a14b'],['Kids\' outdoor play','Unlimited','Let them run','#22a14b'],['Exercise','Outdoors, any intensity','Make the most of it','#22a14b'],['Ventilation','Open everything','Flush the home for 30+ min','#22a14b'],['Mask','Not needed','—','#22a14b']],
    [['School run','Walk or cycle','Normal routine','#22a14b'],['Morning walk','Go','Sensitive? Keep it gentle','#8aa80e'],['Kids\' outdoor play','Full play','Watch sensitive kids','#8aa80e'],['Exercise','Outdoors is fine','Ease off if coughing','#8aa80e'],['Ventilation','Open freely','Morning or afternoon','#22a14b'],['Mask','Optional','Only for the very sensitive','#8aa80e']],
    [['School run','Walk, shorter route','Avoid main-road sidewalks','#d9a406'],['Morning walk','Shift to afternoon','Air usually improves after noon','#d9a406'],['Kids\' outdoor play','Cap at ~1 hour','No heavy exertion for asthmatic kids','#d9a406'],['Exercise','Light outdoors / indoors','Move intense workouts inside','#d9a406'],['Ventilation','Afternoon only, 10–15 min','Pick the day\'s cleanest window','#d9a406'],['Mask','For sensitive members','N95 for asthma / elderly','#d9a406']],
    [['School run','Metro / car, windows up','Mask for the walk to the stop','#f97316'],['Morning walk','Skip — walk indoors','Or a short afternoon stroll','#f97316'],['Kids\' outdoor play','Indoors today','Board games, indoor sport','#dc2626'],['Exercise','Indoors only','Home workout / gym with purifier','#f97316'],['Ventilation','Stay sealed','5 min max, only if AQI dips','#dc2626'],['Mask','N95 outside','For everyone, every trip','#f97316']],
    [['School run','Car/metro only, N95','No waiting at busy gates','#dc2626'],['Morning walk','Cancelled','Indoor steps instead','#dc2626'],['Kids\' outdoor play','Indoors only','No exceptions for sport day','#dc2626'],['Exercise','Indoors, low intensity','Skip heavy breathing workouts','#dc2626'],['Ventilation','Sealed all day','Purifier does the work','#dc2626'],['Mask','N95, well-fitted','Check the seal every time','#dc2626']],
    [['School run','Essential only — ask about closure','N95 + shortest route','#7e0023'],['Morning walk','Cancelled','Stay in','#7e0023'],['Kids\' outdoor play','Indoors only','Keep windows shut in their room','#7e0023'],['Exercise','Rest or gentle indoor movement','No exertion','#7e0023'],['Ventilation','Fully sealed','Tape gaps if needed','#7e0023'],['Mask','N95 always outside','Essential trips only','#7e0023']]
  ];
  function decisionsFor(aqi) { return DECISIONS[categoryIndex(aqi)]; }

  // --- Example (fallback) city values: typical winter mornings, NOT live ---
  var EXAMPLE_CITIES = [
    { name: 'Delhi', aqi: 412 }, { name: 'Lucknow', aqi: 284 }, { name: 'Mumbai', aqi: 168 },
    { name: 'Hyderabad', aqi: 142 }, { name: 'Bengaluru', aqi: 96 }, { name: 'Kochi', aqi: 38 }
  ];

  global.HawaCore = {
    CATEGORIES: CATEGORIES, DECISIONS: DECISIONS, EXAMPLE_CITIES: EXAMPLE_CITIES,
    PM25_BREAKPOINTS: PM25_BREAKPOINTS, PM10_BREAKPOINTS: PM10_BREAKPOINTS,
    MEMBER_KEYS: MEMBER_KEYS, HOME_TYPES: HOME_TYPES, TRAVEL_MODES: TRAVEL_MODES,
    clampAQI: clampAQI, categoryIndex: categoryIndex, categoryFor: categoryFor,
    pm25SubIndex: pm25SubIndex, pm10SubIndex: pm10SubIndex,
    computeCPCBaqi: computeCPCBaqi, bestWorstWindows: bestWorstWindows, decisionsFor: decisionsFor,
    sortCompare: sortCompare, dailyOutlook: dailyOutlook, bestWorstDays: bestWorstDays,
    historySeries: historySeries, dayChange: dayChange,
    sanitizeProfile: sanitizeProfile, encodeProfile: encodeProfile, decodeProfile: decodeProfile
  };
})(typeof window !== 'undefined' ? window : this);
