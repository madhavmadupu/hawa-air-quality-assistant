/**
 * Hawa — app.js
 * UI wiring: gauge, live Open-Meteo fetch, family plan, room hacks.
 * Pure AQI maths lives in aqi-core.js; tests live in tests.js.
 */
(function () {
  'use strict';
  var Core = window.HawaCore;
  var currentAQI = 284;
  var currentCity = 'Lucknow';
  var isLive = false;

  /* ---------- Live AQI via Open-Meteo (no API key) ---------- */
  var liveBadge = document.getElementById('liveBadge');
  var liveMeta = document.getElementById('liveMeta');
  var forecastBox = document.getElementById('forecastBox');

  function setLiveState(state, text) {
    liveBadge.className = 'live-badge' + (state ? ' ' + state : '');
    liveBadge.textContent = state === 'live' ? '● Live reading' : state === 'loading' ? 'Fetching live…' : 'Example values';
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

  // Geocode city name → lat/lon, then fetch current + hourly air quality.
  function fetchLiveAQI(cityName) {
    setLiveState('loading', 'Contacting Open-Meteo for ' + cityName + '…');
    forecastBox.innerHTML = '';
    var geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(cityName) + '&count=1&language=en&format=json';
    return fetch(geoUrl)
      .then(function (r) { if (!r.ok) throw new Error('geocode ' + r.status); return r.json(); })
      .then(function (geo) {
        if (!geo.results || !geo.results.length) throw new Error('city not found');
        var place = geo.results[0];
        var aqUrl = 'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + place.latitude + '&longitude=' + place.longitude +
          '&current=pm2_5,pm10&hourly=pm2_5,pm10&forecast_days=2&timezone=auto';
        return fetch(aqUrl).then(function (r) { if (!r.ok) throw new Error('aq ' + r.status); return r.json(); })
          .then(function (aq) { return { place: place, aq: aq }; });
      })
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
        // Next-24h best / worst windows from hourly forecast
        var times = data.aq.hourly.time, p25 = data.aq.hourly.pm2_5, p10 = data.aq.hourly.pm10;
        var now = Date.now(), hourly = [];
        for (var i = 0; i < times.length; i++) {
          var t = new Date(times[i]).getTime();
          if (t >= now - 3600000 && hourly.length < 24) hourly.push({ time: times[i], aqi: Core.computeCPCBaqi(p25[i], p10[i]) });
        }
        var bw = Core.bestWorstWindows(hourly);
        if (bw) {
          forecastBox.innerHTML =
            '<div class="forecast-card"><b style="color:var(--teal)">Best window · next 24 h</b><div class="f-val">AQI ' + bw.best.aqi + ' — ' + Core.categoryFor(bw.best.aqi).name + '</div><p>' + fmtHour(bw.best.time) + ' · Best time for walks, play &amp; ventilation.</p></div>' +
            '<div class="forecast-card"><b style="color:var(--red)">Worst window · next 24 h</b><div class="f-val">AQI ' + bw.worst.aqi + ' — ' + Core.categoryFor(bw.worst.aqi).name + '</div><p>' + fmtHour(bw.worst.time) + ' · Stay in, keep the home sealed.</p></div>';
        }
      })
      .catch(function () {
        // Honest fallback: labelled example values, never fake "live" data.
        isLive = false;
        var ex = Core.EXAMPLE_CITIES.filter(function (c) { return c.name === cityName; })[0];
        if (ex) setAQI(ex.aqi);
        setLiveState('', 'Live fetch failed (offline or API unavailable). Showing the typical winter-morning example for ' + cityName + ' — not a live reading. Confirm on CPCB\u2019s live dashboard.');
      });
  }

  /* ---------- Gauge & decisions ---------- */
  var range = document.getElementById('aqiRange');
  var input = document.getElementById('aqiInput');
  var gaugeNum = document.getElementById('gaugeNum');
  var gaugeCat = document.getElementById('gaugeCat');
  var gaugeHealth = document.getElementById('gaugeHealth');
  var verdictTitle = document.getElementById('verdictTitle');
  var verdictText = document.getElementById('verdictText');
  var decisionsEl = document.getElementById('decisions');

  function renderDecisions(idx) {
    decisionsEl.innerHTML = Core.DECISIONS[idx].map(function (d) {
      return '<div class="decision"><div class="d-label">' + d[0] + '</div><div class="d-val"><span class="dot" style="background:' + d[3] + '"></span>' + d[1] + '</div><div class="d-note">' + d[2] + '</div></div>';
    }).join('');
  }
  function setAQI(v, source) {
    var aqi = Core.clampAQI(v);
    currentAQI = aqi;
    if (source !== 'range') range.value = aqi;
    if (source !== 'input') input.value = aqi;
    var idx = Core.categoryIndex(aqi), c = Core.CATEGORIES[idx];
    document.documentElement.style.setProperty('--aqi-color', c.color);
    gaugeNum.textContent = aqi;
    gaugeCat.textContent = c.name;
    gaugeHealth.textContent = c.health;
    verdictTitle.textContent = c.verdict;
    verdictText.textContent = c.verdictText;
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

  /* ---------- Family plan builder ---------- */
  var members = { kids: true, elderly: false, asthma: false, pregnant: false, pets: false, wfh: false };
  var purifier = 'yes';
  document.querySelectorAll('#memberToggles .toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-member');
      members[k] = !members[k];
      b.setAttribute('aria-pressed', members[k] ? 'true' : 'false');
      buildPlan();
    });
  });
  document.querySelectorAll('#purifierToggles .toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      purifier = b.getAttribute('data-purifier');
      document.querySelectorAll('#purifierToggles .toggle').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      buildPlan();
    });
  });
  document.getElementById('homeType').addEventListener('change', buildPlan);
  document.getElementById('travelMode').addEventListener('change', buildPlan);

  var planOut = document.getElementById('planOut');
  var lastPlanText = '';
  function buildPlan() {
    var idx = Core.categoryIndex(currentAQI), c = Core.CATEGORIES[idx];
    var home = document.getElementById('homeType').value;
    var travel = document.getElementById('travelMode').value;
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

  /* ---------- Room hacks tabs ---------- */
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
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
      t.setAttribute('aria-selected', 'true');
      renderHacks(t.getAttribute('data-tab'));
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

  /* ---------- Init ---------- */
  setAQI(284);
  setLiveState('', 'Showing a typical winter-morning example for Lucknow (284) — not a live reading. Tap any city to fetch its live CPCB AQI from Open-Meteo.');
  // Attempt a live fetch for the default city; falls back silently to the example.
  fetchLiveAQI(currentCity);
})();
