/**
 * Hawa — app.js (v3)
 * UI wiring only: theme toggle, gauge, live Open-Meteo fetch (with a
 * localStorage cache so repeat visits render instantly), 24-hour history,
 * day-over-day change, 7-day outlook, multi-city compare, family plan +
 * saved profiles (localStorage), room hacks, print sheet and tests.
 * All pure maths lives in aqi-core.js; assertions live in tests.js.
 */
(function () {
  'use strict';
  var Core = window.HawaCore;
  var currentAQI = 284;
  var currentCity = 'Lucknow';
  var isLive = false;

  /* ---------- Safe storage (sandboxed frames may block it) ---------- */
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable — app still works in-memory */ } },
    remove: function (k) { try { window.localStorage.removeItem(k); } catch (e) { } }
  };
  var KEY_THEME = 'hawa-theme', KEY_CACHE = 'hawa-cache-v3', KEY_CURRENT = 'hawa-current-v3', KEY_PROFILES = 'hawa-profiles-v3';

  /* ---------- Theme toggle (remembered; OS preference by default) ---------- */
  var themeBtn = document.getElementById('themeToggle');
  function applyThemeLabel() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
      (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      themeBtn.innerHTML = '<span class="tt-icon" aria-hidden="true">' + (dark ? '☀️' : '🌙') + '</span>' + (dark ? 'Light mode' : 'Dark mode');
    }
  }
  (function initTheme() {
    var saved = store.get(KEY_THEME);
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  })();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store.set(KEY_THEME, next);
      applyThemeLabel();
    });
    applyThemeLabel();
  }

  /* ---------- Live AQI via Open-Meteo (no API key) ---------- */
  var liveBadge = document.getElementById('liveBadge');
  var liveMeta = document.getElementById('liveMeta');
  var forecastBox = document.getElementById('forecastBox');
  var changedEl = document.getElementById('changedLine');
  var historyBox = document.getElementById('historyBox');
  var outlookBox = document.getElementById('outlookBox');
  var outlookNote = document.getElementById('outlookNote');

  function setLiveState(state, text) {
    liveBadge.className = 'live-badge' + (state ? ' ' + state : '');
    liveBadge.textContent = state === 'live' ? '● Live reading' : state === 'loading' ? 'Fetching live…' : state === 'cached' ? 'Cached · updating…' : 'Example values';
    if (text) liveMeta.textContent = text;
  }
  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return iso; }
  }
  function fmtHour(iso) {
    try { return new Date(iso).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' }); }
    catch (e) { return iso; }
  }
  function fmtDay(dateStr) {
    try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
    catch (e) { return dateStr; }
  }
  function fmtDow(dateStr) {
    try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' }); }
    catch (e) { return dateStr; }
  }

  // Geocode a city once, then reuse coordinates for every data call.
  function geocode(cityName) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(cityName) + '&count=1&language=en&format=json';
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('geocode ' + r.status); return r.json(); })
      .then(function (geo) {
        if (!geo.results || !geo.results.length) throw new Error('city not found');
        return geo.results[0];
      });
  }
  function fetchAQ(place, extra) {
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + place.latitude + '&longitude=' + place.longitude +
      '&current=pm2_5,pm10&hourly=pm2_5,pm10&timezone=auto' + (extra || '');
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('aq ' + r.status); return r.json(); });
  }
  function hourlySeries(aq) {
    var times = aq.hourly.time, p25 = aq.hourly.pm2_5, p10 = aq.hourly.pm10, out = [];
    for (var i = 0; i < times.length; i++) out.push({ time: times[i], ms: new Date(times[i]).getTime(), aqi: Core.computeCPCBaqi(p25[i], p10[i]) });
    return out;
  }

  /* ----- Renderers for the v3 data views ----- */
  function renderHistory(series) {
    if (!historyBox) return;
    var past = series.filter(function (h) { return h.ms <= Date.now() + 3600000; });
    var hist = Core.historySeries(past, 24);
    if (!hist.length) { historyBox.innerHTML = '<div class="history-empty">History appears here after a live reading loads.</div>'; return; }
    var bars = hist.map(function (h) {
      return '<div class="h-bar" style="height:' + h.heightPct + '%;background:' + h.color + '" title="AQI ' + h.aqi + ' · ' + fmtHour(h.time) + '" role="img" aria-label="AQI ' + h.aqi + ' at ' + fmtHour(h.time) + '"></div>';
    }).join('');
    historyBox.innerHTML = '<div class="history-title">Last 24 hours · ' + currentCity + ' (CPCB AQI, hourly)</div>' +
      '<div class="history-chart" role="group" aria-label="Bar chart of hourly AQI for the last 24 hours. Lowest ' + Math.min.apply(null, hist.map(function (h) { return h.aqi; })) + ', highest ' + Math.max.apply(null, hist.map(function (h) { return h.aqi; })) + '.">' + bars + '</div>' +
      '<div class="history-axis"><span>' + fmtHour(hist[0].time) + '</span><span>Now</span></div>';
  }
  function renderChanged(series, nowAqi) {
    if (!changedEl) return;
    // Yesterday's reading at (as close as possible to) the same hour.
    var target = Date.now() - 24 * 3600000, best = null, bestDiff = Infinity;
    series.forEach(function (h) {
      var d = Math.abs(h.ms - target);
      if (d < bestDiff) { bestDiff = d; best = h; }
    });
    var chg = best && bestDiff <= 90 * 60000 ? Core.dayChange(nowAqi, best.aqi) : null;
    if (!chg) { changedEl.hidden = true; return; }
    changedEl.hidden = false;
    var arrow = chg.direction === 'up' ? '▲' : chg.direction === 'down' ? '▼' : '●';
    var colour = chg.direction === 'up' ? 'var(--red)' : chg.direction === 'down' ? 'var(--teal)' : 'var(--muted)';
    changedEl.innerHTML = '<span class="cl-arrow" style="color:' + colour + '">' + arrow + '</span> What changed today: ' + chg.text;
  }
  function renderOutlook(series) {
    if (!outlookBox) return;
    var todayStr = new Date().toISOString().slice(0, 10);
    var days = Core.dailyOutlook(series).filter(function (d) { return d.date >= todayStr; }).slice(0, 7);
    if (!days.length) { outlookBox.innerHTML = '<p class="outlook-note">The 7-day outlook appears here after a live reading loads for a city above.</p>'; if (outlookNote) outlookNote.textContent = ''; return; }
    var bw = Core.bestWorstDays(days);
    outlookBox.innerHTML = days.map(function (d) {
      var c = Core.categoryFor(d.avg);
      var tag = bw && days.length > 1 && d === bw.best ? '<span class="day-tag best">Best day</span>' : bw && days.length > 1 && d === bw.worst ? '<span class="day-tag worst">Worst day</span>' : '';
      var cls = bw && d === bw.best ? ' best' : bw && d === bw.worst ? ' worst' : '';
      return '<div class="day-card' + cls + '"><div class="dow">' + fmtDow(d.date) + '</div><div class="d-aqi" style="color:' + c.color + '">' + d.avg + '</div><div class="d-cat">' + c.name + '</div><div class="d-range">' + fmtDay(d.date) + '<br>Range ' + d.min + '–' + d.max + '</div>' + tag + '</div>';
    }).join('');
    if (outlookNote && bw) {
      outlookNote.innerHTML = 'For <b>' + currentCity + '</b>: cleanest day ahead is <b>' + fmtDay(bw.best.date) + '</b> (average AQI ' + bw.best.avg + ', ' + Core.categoryFor(bw.best.avg).name + ') — plan outdoor events then. Toughest is <b>' + fmtDay(bw.worst.date) + '</b> (average AQI ' + bw.worst.avg + ', ' + Core.categoryFor(bw.worst.avg).name + '). Daily averages from Open-Meteo hourly forecasts, converted to CPCB AQI.';
    }
  }

  function fetchLiveAQI(cityName) {
    setLiveState('loading', 'Contacting Open-Meteo for ' + cityName + '…');
    forecastBox.innerHTML = '';
    return geocode(cityName)
      .then(function (place) { return fetchAQ(place, '&past_days=2&forecast_days=7').then(function (aq) { return { place: place, aq: aq }; }); })
      .then(function (data) {
        var cur = data.aq.current;
        if (!cur || (cur.pm2_5 == null && cur.pm10 == null)) throw new Error('no current data');
        // Convert to CPCB AQI — US AQI from the API is deliberately ignored.
        var aqi = Core.computeCPCBaqi(cur.pm2_5, cur.pm10);
        isLive = true;
        setAQI(aqi);
        setLiveState('live',
          data.place.name + ' — PM2.5 ' + Math.round(cur.pm2_5 || 0) + ' µg/m³ · PM10 ' + Math.round(cur.pm10 || 0) +
          ' µg/m³ → CPCB AQI ' + aqi + '. Reading: ' + fmtTime(cur.time) + ' · Source: Open-Meteo Air Quality API (CAMS). US AQI not used.');
        // Cache the reading so the next visit renders instantly.
        store.set(KEY_CACHE, JSON.stringify({ city: cityName, aqi: aqi, time: cur.time, pm25: cur.pm2_5, pm10: cur.pm10 }));
        var series = hourlySeries(data.aq);
        // Next-24h best / worst windows
        var now = Date.now(), next24 = series.filter(function (h) { return h.ms >= now - 3600000; }).slice(0, 24);
        var bw = Core.bestWorstWindows(next24);
        if (bw) {
          forecastBox.innerHTML =
            '<div class="forecast-card"><b style="color:var(--teal)">Best window · next 24 h</b><div class="f-val">AQI ' + bw.best.aqi + ' — ' + Core.categoryFor(bw.best.aqi).name + '</div><p>' + fmtHour(bw.best.time) + ' · Best time for walks, play &amp; ventilation.</p></div>' +
            '<div class="forecast-card"><b style="color:var(--red)">Worst window · next 24 h</b><div class="f-val">AQI ' + bw.worst.aqi + ' — ' + Core.categoryFor(bw.worst.aqi).name + '</div><p>' + fmtHour(bw.worst.time) + ' · Stay in, keep the home sealed.</p></div>';
        }
        renderHistory(series);
        renderChanged(series, aqi);
        renderOutlook(series);
      })
      .catch(function () {
        // Honest fallback: labelled example values, never fake "live" data.
        isLive = false;
        var ex = Core.EXAMPLE_CITIES.filter(function (c) { return c.name === cityName; })[0];
        if (ex) setAQI(ex.aqi);
        setLiveState('', 'Live fetch failed (offline or API unavailable). Showing the typical winter-morning example for ' + cityName + ' — not a live reading. Confirm on CPCB\u2019s live dashboard.');
        if (changedEl) changedEl.hidden = true;
      });
  }

  /* ---------- Multi-city compare ---------- */
  var compareBtn = document.getElementById('compareBtn');
  var compareGrid = document.getElementById('compareGrid');
  var compareStatus = document.getElementById('compareStatus');
  var compareSelection = ['Delhi', 'Lucknow'];
  function fetchCityCurrent(name) {
    return geocode(name).then(function (place) {
      return fetchAQ(place, '&forecast_days=1').then(function (aq) {
        var cur = aq.current;
        if (!cur || (cur.pm2_5 == null && cur.pm10 == null)) throw new Error('no data');
        return { name: place.name || name, aqi: Core.computeCPCBaqi(cur.pm2_5, cur.pm10), time: cur.time, live: true };
      });
    }).catch(function () {
      var ex = Core.EXAMPLE_CITIES.filter(function (c) { return c.name === name; })[0];
      return { name: name, aqi: ex ? ex.aqi : null, time: null, live: false };
    });
  }
  function runCompare() {
    if (!compareGrid) return;
    if (compareSelection.length < 2) { compareStatus.textContent = 'Pick at least 2 cities to compare.'; return; }
    compareBtn.disabled = true;
    compareStatus.textContent = 'Fetching live AQI for ' + compareSelection.join(', ') + '…';
    Promise.all(compareSelection.map(fetchCityCurrent)).then(function (rows) {
      var sorted = Core.sortCompare(rows);
      compareGrid.innerHTML = sorted.map(function (r, i) {
        if (r.aqi == null) return '<div class="compare-card"><h3>' + r.name + '</h3><p>No reading available right now.</p></div>';
        var c = Core.categoryFor(r.aqi);
        var rank = i === 0 ? '<span class="rank">Cleanest</span>' : i === sorted.length - 1 ? '<span class="rank worst">Dirtiest</span>' : '';
        return '<div class="compare-card">' + rank + '<h3>' + r.name + '</h3><div class="c-aqi" style="color:' + c.color + '">' + r.aqi + '</div><div class="c-cat">' + c.name + '</div><p>' +
          (r.live ? 'Live · ' + fmtTime(r.time) + ' · Open-Meteo' : 'Example winter value — live fetch failed') +
          '<br>' + (r.aqi <= 100 ? 'Outdoors is fine for most people.' : r.aqi <= 200 ? 'Sensitive members: shorten heavy outdoor time.' : r.aqi <= 300 ? 'Move play & exercise indoors; N95 outside.' : 'Stay indoors; essential trips only, N95.') + '</p></div>';
      }).join('');
      var anyLive = sorted.some(function (r) { return r.live; });
      compareStatus.textContent = anyLive ? 'Sorted cleanest → dirtiest. Live rows show their reading time; any example row is labelled.' : 'Live fetch failed for all selected cities — showing labelled example values, sorted cleanest → dirtiest.';
      compareBtn.disabled = false;
    });
  }
  document.querySelectorAll('#compareToggles .toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-compare');
      var on = b.getAttribute('aria-pressed') === 'true';
      if (on) { compareSelection = compareSelection.filter(function (n) { return n !== name; }); b.setAttribute('aria-pressed', 'false'); }
      else if (compareSelection.length >= 3) { compareStatus.textContent = 'Compare holds up to 3 cities — switch one off first.'; return; }
      else { compareSelection.push(name); b.setAttribute('aria-pressed', 'true'); }
    });
  });
  if (compareBtn) compareBtn.addEventListener('click', runCompare);

  /* ---------- Gauge & decisions ---------- */
  var range = document.getElementById('aqiRange');
  var input = document.getElementById('aqiInput');
  var gaugeNum = document.getElementById('gaugeNum');
  var gaugeCat = document.getElementById('gaugeCat');
  var gaugeHealth = document.getElementById('gaugeHealth');
  var gaugeWrap = document.getElementById('gaugeWrap');
  var verdictBox = document.getElementById('verdictBox');
  var verdictTitle = document.getElementById('verdictTitle');
  var verdictText = document.getElementById('verdictText');
  var decisionsEl = document.getElementById('decisions');
  var displayedAQI = 284;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function renderDecisions(idx) {
    decisionsEl.innerHTML = Core.DECISIONS[idx].map(function (d) {
      return '<div class="decision"><div class="d-label">' + d[0] + '</div><div class="d-val"><span class="dot" style="background:' + d[3] + '"></span>' + d[1] + '</div><div class="d-note">' + d[2] + '</div></div>';
    }).join('');
  }
  function tweenGauge(from, to) {
    if (reduceMotion || from === to) { gaugeNum.textContent = to; displayedAQI = to; return; }
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / 400);
      gaugeNum.textContent = Math.round(from + (to - from) * p);
      if (p < 1) requestAnimationFrame(step); else displayedAQI = to;
    }
    requestAnimationFrame(step);
  }
  function setAQI(v, source) {
    var aqi = Core.clampAQI(v);
    currentAQI = aqi;
    if (source !== 'range') range.value = aqi;
    if (source !== 'input') input.value = aqi;
    var idx = Core.categoryIndex(aqi), c = Core.CATEGORIES[idx];
    document.documentElement.style.setProperty('--aqi-color', c.color);
    tweenGauge(displayedAQI, aqi);
    gaugeCat.textContent = c.name;
    gaugeHealth.textContent = c.health;
    if (gaugeWrap) { gaugeWrap.setAttribute('aria-label', 'Current AQI ' + aqi + ', category ' + c.name + '. ' + c.health); gaugeWrap.setAttribute('aria-valuenow', aqi); }
    verdictTitle.textContent = c.verdict;
    verdictText.textContent = c.verdictText;
    if (!reduceMotion) {
      gaugeNum.classList.remove('pulse'); void gaugeNum.offsetWidth; gaugeNum.classList.add('pulse');
      verdictBox.classList.remove('flash'); void verdictBox.offsetWidth; verdictBox.classList.add('flash');
    }
    renderDecisions(idx);
    buildPlan();
  }
  range.addEventListener('input', function () { isLive = false; setLiveState('', 'Manual value — drag, type, tap a city for live data, or use the examples. Source for live readings: Open-Meteo.'); setAQI(range.value, 'range'); });
  input.addEventListener('input', function () { setAQI(input.value, 'input'); });
  document.querySelectorAll('.city-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.city-btn').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      currentCity = b.getAttribute('data-city');
      fetchLiveAQI(currentCity);
      document.getElementById('aqi-lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.getElementById('refreshLive').addEventListener('click', function () { fetchLiveAQI(currentCity); });

  /* ---------- Family plan builder + saved profiles ---------- */
  var members = { kids: true, elderly: false, asthma: false, pregnant: false, pets: false, wfh: false };
  var purifier = 'yes';
  var homeSel = document.getElementById('homeType');
  var travelSel = document.getElementById('travelMode');

  function currentProfile() {
    return { members: members, purifier: purifier, home: homeSel.value, travel: travelSel.value };
  }
  function persistCurrent() { store.set(KEY_CURRENT, Core.encodeProfile(currentProfile()) || ''); }
  function applyProfile(p) {
    if (!p) return;
    members = p.members; purifier = p.purifier;
    document.querySelectorAll('#memberToggles .toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', members[b.getAttribute('data-member')] ? 'true' : 'false');
    });
    document.querySelectorAll('#purifierToggles .toggle').forEach(function (x) {
      x.setAttribute('aria-pressed', x.getAttribute('data-purifier') === purifier ? 'true' : 'false');
    });
    homeSel.value = p.home; travelSel.value = p.travel;
    buildPlan();
  }
  document.querySelectorAll('#memberToggles .toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-member');
      members[k] = !members[k];
      b.setAttribute('aria-pressed', members[k] ? 'true' : 'false');
      persistCurrent(); buildPlan();
    });
  });
  document.querySelectorAll('#purifierToggles .toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      purifier = b.getAttribute('data-purifier');
      document.querySelectorAll('#purifierToggles .toggle').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      persistCurrent(); buildPlan();
    });
  });
  homeSel.addEventListener('change', function () { persistCurrent(); buildPlan(); });
  travelSel.addEventListener('change', function () { persistCurrent(); buildPlan(); });

  // Named profiles, stored in this browser only.
  var profileName = document.getElementById('profileName');
  var profileSelect = document.getElementById('profileSelect');
  var profileStatus = document.getElementById('profileStatus');
  function loadProfiles() {
    try { return JSON.parse(store.get(KEY_PROFILES) || '{}') || {}; } catch (e) { return {}; }
  }
  function refreshProfileSelect(keep) {
    var profiles = loadProfiles();
    var names = Object.keys(profiles).sort();
    profileSelect.innerHTML = names.length
      ? names.map(function (n) { return '<option value="' + n.replace(/"/g, '&quot;') + '">' + n.replace(/</g, '&lt;') + '</option>'; }).join('')
      : '<option value="">No saved profiles yet</option>';
    if (keep && names.indexOf(keep) >= 0) profileSelect.value = keep;
  }
  document.getElementById('saveProfile').addEventListener('click', function () {
    var name = (profileName.value || '').trim();
    if (!name) { profileStatus.textContent = 'Type a profile name first — e.g. "Home with kids" or "Parents\u2019 house".'; profileName.focus(); return; }
    var profiles = loadProfiles();
    profiles[name] = currentProfile();
    store.set(KEY_PROFILES, JSON.stringify(profiles));
    refreshProfileSelect(name);
    profileStatus.textContent = 'Saved "' + name + '" in this browser. It will be here next visit.';
  });
  document.getElementById('loadProfile').addEventListener('click', function () {
    var name = profileSelect.value;
    var p = name ? Core.sanitizeProfile(loadProfiles()[name]) : null;
    if (!p) { profileStatus.textContent = 'Nothing to load yet — save a profile first.'; return; }
    applyProfile(p); persistCurrent();
    profileStatus.textContent = 'Loaded "' + name + '". The plan above now uses it.';
  });
  document.getElementById('deleteProfile').addEventListener('click', function () {
    var name = profileSelect.value;
    if (!name) { profileStatus.textContent = 'No profile selected to delete.'; return; }
    var profiles = loadProfiles();
    delete profiles[name];
    store.set(KEY_PROFILES, JSON.stringify(profiles));
    refreshProfileSelect();
    profileStatus.textContent = 'Deleted "' + name + '".';
  });

  var planOut = document.getElementById('planOut');
  var lastPlanText = '';
  function buildPlan() {
    var idx = Core.categoryIndex(currentAQI), c = Core.CATEGORIES[idx];
    var home = homeSel.value;
    var travel = travelSel.value;
    var lines = [];
    lines.push('Headline: AQI ' + currentAQI + ' (' + c.name + ') — ' + c.verdict + (isLive ? ' [Live reading for ' + currentCity + ' via Open-Meteo]' : ' [Example/manual value]'));
    if (idx <= 1) { lines.push('Open windows wide this morning and get outdoor time in — days like this are for using.'); }
    else if (idx === 2) { lines.push('Ventilate once, in the early afternoon for 10–15 minutes. Keep the rest of the day comfortably normal.'); }
    else { lines.push('Keep windows and doors sealed. ' + (purifier === 'yes' ? 'Run the purifier in the living room by day and the bedroom at night.' : 'Make the bedroom your clean room: door shut, gaps covered, damp-dust daily.')); }
    if (members.kids) {
      if (idx >= 3) lines.push('Kids: indoor play today. If school is on, N95/KN95 (child size) for the commute and no outdoor PT or sport.');
      else if (idx === 2) lines.push('Kids: outdoor play is fine for about an hour — move it to the afternoon and skip main-road routes.');
      else lines.push('Kids: full outdoor play. Great day for the park.');
    }
    if (members.elderly) lines.push('Grandparents: ' + (idx >= 2 ? 'no morning walk today; gentle indoor movement and an afternoon check of the AQI before any stroll. Keep inhalers/medication within reach.' : 'morning walk is fine — a park route away from traffic is best.'));
    if (members.asthma) lines.push('Asthma care: reliever inhaler carried at all times, peak-flow/symptom check morning and evening, and no outdoor exertion above AQI 200.');
    if (members.pregnant) lines.push('Pregnancy: treat yourself as a sensitive member today — mask above AQI 150, prefer indoor rest over outdoor errands when AQI is 200+.');
    if (members.pets) lines.push('Pets: ' + (idx >= 3 ? 'short toilet walks only, wipe paws and coat after, and keep them in the cleanest room.' : 'normal walks — shift to the afternoon on moderate days.'));
    if (members.wfh) lines.push('Work from home: desk away from the road-facing window' + (purifier === 'yes' ? ', purifier in the work room on auto.' : ', door closed while working to hold cleaner air in.'));
    if (home === 'apartment') lines.push('Apartment: seal the balcony door gap, keep the bathroom/kitchen exhaust for cooking only, and avoid opening windows facing the main road.');
    if (home === 'independent') lines.push('Independent house: no leaf/waste burning in the garden, wet-mop the entrance daily — dust walks in on shoes, so keep a shoe rack at the door.');
    if (home === 'hostel') lines.push('Shared room: agree a windows-closed pact on poor days, keep your bed zone dusted, and a small desk fan angled away helps comfort without stirring dust.');
    if (travel === 'walk') lines.push('Travel: ' + (idx >= 3 ? 'switch walking/cycling to metro or cab today — breathing rate makes exposure multiply.' : 'walk/cycle on side streets and park paths, not arterial roads.'));
    if (travel === 'auto') lines.push('Travel: windows up, AC on recirculate, no idling — switch off at long signals.');
    if (travel === 'metro') lines.push('Travel: metro/bus is a low-exposure choice today' + (idx >= 3 ? ' — N95 for the walk to and from the station.' : '.'));
    if (travel === 'none') lines.push('Travel: staying in — use the saved trip to batch tomorrow\u2019s errands into the afternoon window.');
    lines.push('Tonight: damp-mop, shower/change after any outdoor trip, and re-check AQI before bed to set tomorrow\u2019s plan.');
    planOut.innerHTML = '<h3>Today\u2019s plan — AQI ' + currentAQI + ' · ' + c.name + '</h3><ul>' + lines.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>';
    lastPlanText = 'URBAN AIR QUALITY ASSISTANT — TODAY\u2019S FAMILY PLAN\nAQI ' + currentAQI + ' (' + c.name + ')\n\n- ' + lines.join('\n- ') + '\n\nGeneral information only — not medical advice. Live AQI: https://airquality.cpcb.gov.in/AQI_India/';
  }

  var toast = document.getElementById('toast');
  document.getElementById('copyPlan').addEventListener('click', function () {
    function done() { toast.textContent = 'Plan copied — paste it into WhatsApp or Notes.'; setTimeout(function () { toast.textContent = ''; }, 3500); }
    function fallback() { var ta = document.createElement('textarea'); ta.value = lastPlanText; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast.textContent = 'Copy not available here — use Download instead.'; } document.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(lastPlanText).then(done).catch(fallback); } else { fallback(); }
  });
  document.getElementById('downloadPlan').addEventListener('click', function () {
    var blob = new Blob([lastPlanText], { type: 'text/plain' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'family-air-plan-aqi-' + currentAQI + '.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast.textContent = 'Plan downloaded.'; setTimeout(function () { toast.textContent = ''; }, 3000);
  });
  // Print: show a clean sheet (the browser's own Print then prints only it).
  var printSheet = document.getElementById('printSheet');
  document.getElementById('printPlan').addEventListener('click', function () {
    printSheet.textContent = lastPlanText + '\n\nTip: screenshot this sheet to pin it on the fridge, or use Download plan above to keep it as a file.';
    document.body.classList.add('show-print');
    printSheet.setAttribute('tabindex', '-1');
    printSheet.focus();
    printSheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.textContent = 'Fridge poster ready at the bottom of the page — one clean sheet with today\u2019s plan.';
  });

  /* ---------- Room hacks tabs (arrow-key friendly tablist) ---------- */
  var HACKS = {
    living: [['Seal first, then clean','Tape or cloth-seal window and door gaps on poor days — this one step can cut indoor PM2.5 sharply before any gadget.','Free'],['Damp-dust, never dry-dust','A damp microfibre cloth traps particles. Dry dusting just relaunches them into the air you breathe.','Free'],['Shoe & coat drop zone','Outdoor clothes carry the day\u2019s dust. One rack by the door keeps it out of sofas and beds.','Low cost'],['Purifier placement','Centre of the room\u2019s use, 30 cm from walls, doors closed. Turbo for an hour, then auto.','If you own one'],['Skip indoor smoke sources','Incense, dhoop, candles and mosquito coils are indoor PM2.5 bombs on sealed days. Pause them above AQI 200.','Free'],['Vacuum with the windows\u2019 logic','Vacuum (ideally HEPA) when you can ventilate right after — or while the purifier runs on turbo.','Free']],
    kitchen: [['Exhaust on, every time','Chimney/exhaust on before the tadka, off 10 minutes after. Cooking is most homes\u2019 biggest indoor pollution event.','Free'],['Lids on pans','A lid cuts cooking fumes and gas use together — cleaner air, lower bill.','Free'],['Prefer pressure-cooking & induction','Fewer open-flame minutes = less NO\u2082 and PM. Induction, where possible, removes combustion from the room entirely.','Habit'],['Fry less on severe days','Deep frying in a sealed home lingers for hours. On AQI 300+ days, choose steamed, baked or pressure-cooked meals.','Free'],['Clean the chimney filter','A clogged filter recirculates grease smoke. Degrease monthly through smog season.','Free'],['Keep the kitchen door strategy','Door open to the exhaust path while cooking, closed to bedrooms — fumes should exit, not tour the house.','Free']],
    bedroom: [['Make this the cleanest room','You breathe here 7–8 hours. Purifier here first, door closed, gaps sealed — even without a purifier this helps.','Priority'],['Wash bedding weekly in smog season','Fabric traps settled dust. Hot wash pillow covers weekly; sun-dry when AQI allows.','Free'],['No outdoor clothes on the bed','The day\u2019s commute lives on your clothes. Change before sitting on bedding.','Free'],['Damp-mop under the bed','The most-forgotten dust reservoir in the house is directly under where you sleep.','Free'],['Night purifier rhythm','Turbo for the first hour of the night, then sleep/quiet mode — clean air without the noise.','If you own one'],['Steam, not smoke, for congestion','Warm steam or a saline rinse eases smog irritation. Avoid smoke-based home remedies in a sealed room.','Free']],
    kids: [['Homework zone = clean zone','Put the study desk in the cleanest room, away from road-facing windows, door closed during study hours.','Free'],['Indoor play kit, ready before smog hits','Board games, craft box, indoor ball games — decided in advance, so \u2018indoors today\u2019 isn\u2019t a punishment.','Low cost'],['School bag check on poor days','Child-size KN95, water bottle, and prescribed inhaler if any — packed the night before using the forecast.','Habit'],['Bath & change after school','On AQI 250+ days, a quick shower and full change stops the school run settling into the bedroom.','Free'],['Explain the \u2018why\u2019 simply','\u2018The air has tiny dust we can\u2019t see today, so we play inside and let it clear\u2019 — kids cooperate with plans they understand.','Free'],['Screen the screen-time swap','Swap outdoor play hours with active indoor movement — dance videos, hallway cricket with a soft ball — not only screens.','Free']]
  };
  var hackGrid = document.getElementById('hackGrid');
  function renderHacks(key) {
    hackGrid.innerHTML = HACKS[key].map(function (h) { return '<div class="hack"><h3>' + h[0] + '</h3><p>' + h[1] + '</p><span class="cost">' + h[2] + '</span></div>'; }).join('');
  }
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
  function selectTab(t) {
    tabs.forEach(function (x) { x.setAttribute('aria-selected', 'false'); x.tabIndex = -1; });
    t.setAttribute('aria-selected', 'true'); t.tabIndex = 0;
    renderHacks(t.getAttribute('data-tab'));
  }
  tabs.forEach(function (t, i) {
    t.tabIndex = i === 0 ? 0 : -1;
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (next) { e.preventDefault(); selectTab(next); next.focus(); }
    });
  });
  renderHacks('living');

  /* ---------- Tests wiring ---------- */
  var testResultsEl = document.getElementById('testResults');
  var testSummaryEl = document.getElementById('testSummary');
  function showTests() {
    if (window.HawaTests && testResultsEl) {
      var out = window.HawaTests.renderInto(testResultsEl);
      if (testSummaryEl) testSummaryEl.textContent = out.passed + '/' + out.total + ' passing';
      if (window.console) console.log('[Hawa tests] ' + out.passed + '/' + out.total + ' passed');
    }
  }
  var runBtn = document.getElementById('runTests');
  if (runBtn) runBtn.addEventListener('click', showTests);
  showTests();

  /* ---------- Init: restore profile → cached reading → live fetch ---------- */
  var restored = Core.decodeProfile(store.get(KEY_CURRENT) || '');
  if (restored) applyProfile(restored);
  refreshProfileSelect();
  setAQI(284);
  // Instant paint from the last live reading, clearly labelled as cached.
  var cache = null;
  try { cache = JSON.parse(store.get(KEY_CACHE) || 'null'); } catch (e) { cache = null; }
  if (cache && cache.city && typeof cache.aqi === 'number') {
    currentCity = cache.city;
    document.querySelectorAll('.city-btn').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-city') === currentCity ? 'true' : 'false'); });
    isLive = true;
    setAQI(cache.aqi);
    setLiveState('cached', 'Showing your last live reading for ' + currentCity + ' (AQI ' + cache.aqi + ', ' + fmtTime(cache.time) + ') while fresh data loads from Open-Meteo.');
  } else {
    setLiveState('', 'Showing a typical winter-morning example for Lucknow (284) — not a live reading. Tap any city to fetch its live CPCB AQI from Open-Meteo.');
  }
  if (historyBox && !historyBox.innerHTML) historyBox.innerHTML = '<div class="history-empty">History appears here after a live reading loads.</div>';
  // Fresh live fetch for the current city; falls back honestly on failure.
  fetchLiveAQI(currentCity);
  // Kick off the default comparison so the section is never empty.
  runCompare();
})();
