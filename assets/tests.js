/**
 * Hawa — tests.js (v3)
 * Runnable test suite for aqi-core.js. No framework needed:
 * open the page and click "Run tests", or call HawaTests.run() in the console.
 * Covers: band classification, CPCB sub-index conversion, AQI = max rule,
 * best/worst windows, decision/verdict logic — plus v3: multi-city compare
 * sorting, 7-day outlook aggregation & best/worst day, 24-hour history
 * shaping, day-over-day change, and family profile save/load round-trips.
 */
(function (global) {
  'use strict';
  function runTests(core) {
    core = core || global.HawaCore;
    var results = [];
    function eq(label, actual, expected) {
      results.push({ label: label, pass: actual === expected, actual: actual, expected: expected });
    }
    function ok(label, cond) { results.push({ label: label, pass: !!cond, actual: !!cond, expected: true }); }
    function near(label, actual, expected, tol) {
      results.push({ label: label, pass: Math.abs(actual - expected) <= (tol || 2), actual: actual, expected: expected });
    }
    if (!core) { return { total: 0, passed: 0, failed: 1, results: [{ label: 'HawaCore loaded', pass: false }] }; }

    // 1) Band classification — every CPCB boundary
    eq('AQI 0 → Good (0)', core.categoryIndex(0), 0);
    eq('AQI 50 → Good (0)', core.categoryIndex(50), 0);
    eq('AQI 51 → Satisfactory (1)', core.categoryIndex(51), 1);
    eq('AQI 100 → Satisfactory (1)', core.categoryIndex(100), 1);
    eq('AQI 101 → Moderate (2)', core.categoryIndex(101), 2);
    eq('AQI 200 → Moderate (2)', core.categoryIndex(200), 2);
    eq('AQI 201 → Poor (3)', core.categoryIndex(201), 3);
    eq('AQI 300 → Poor (3)', core.categoryIndex(300), 3);
    eq('AQI 301 → Very Poor (4)', core.categoryIndex(301), 4);
    eq('AQI 400 → Very Poor (4)', core.categoryIndex(400), 4);
    eq('AQI 401 → Severe (5)', core.categoryIndex(401), 5);
    eq('AQI 500 → Severe (5)', core.categoryIndex(500), 5);
    eq('AQI 999 clamps to Severe (5)', core.categoryIndex(999), 5);
    eq('Category name for 284 is Poor', core.categoryFor(284).name, 'Poor');

    // 2) CPCB sub-index conversion — PM2.5 breakpoints
    eq('PM2.5 0 → 0', core.pm25SubIndex(0), 0);
    eq('PM2.5 30 → 50', core.pm25SubIndex(30), 50);
    near('PM2.5 60 → ~100', core.pm25SubIndex(60), 100);
    near('PM2.5 90 → ~200', core.pm25SubIndex(90), 200);
    near('PM2.5 120 → ~300', core.pm25SubIndex(120), 300);
    near('PM2.5 250 → ~400', core.pm25SubIndex(250), 400);
    ok('PM2.5 15 is inside Good band', core.pm25SubIndex(15) <= 50 && core.pm25SubIndex(15) > 0);
    ok('PM2.5 sub-index is monotonic', core.pm25SubIndex(80) > core.pm25SubIndex(40));

    // 3) CPCB sub-index conversion — PM10 breakpoints
    eq('PM10 0 → 0', core.pm10SubIndex(0), 0);
    eq('PM10 50 → 50', core.pm10SubIndex(50), 50);
    near('PM10 100 → ~100', core.pm10SubIndex(100), 100);
    near('PM10 250 → ~200', core.pm10SubIndex(250), 200);
    near('PM10 350 → ~300', core.pm10SubIndex(350), 300);
    ok('PM10 sub-index is monotonic', core.pm10SubIndex(200) > core.pm10SubIndex(80));

    // 4) AQI = max sub-index (never US AQI)
    eq('AQI = max(PM2.5, PM10) picks PM2.5', core.computeCPCBaqi(90, 50), core.pm25SubIndex(90));
    eq('AQI = max picks PM10 when higher', core.computeCPCBaqi(10, 250), core.pm10SubIndex(250));
    eq('AQI with only PM2.5', core.computeCPCBaqi(30, null), 50);
    eq('AQI with no data is 0', core.computeCPCBaqi(null, null), 0);

    // 5) Best / worst windows
    var bw = core.bestWorstWindows([{ time: 'a', aqi: 180 }, { time: 'b', aqi: 90 }, { time: 'c', aqi: 320 }]);
    eq('Best window is lowest AQI hour', bw.best.time, 'b');
    eq('Worst window is highest AQI hour', bw.worst.time, 'c');
    eq('Best/worst of empty series is null', core.bestWorstWindows([]), null);

    // 6) Decision / verdict logic
    ok('Good verdict invites going out', /Go/.test(core.categoryFor(20).verdict));
    ok('Poor verdict says stay in', /Stay in/.test(core.categoryFor(284).verdict));
    ok('Severe verdict says seal and stay in', /Seal/.test(core.categoryFor(450).verdict));
    eq('Every band has 6 decision cards', core.decisionsFor(284).length, 6);
    ok('Poor band mask decision mentions N95', /N95/.test(core.decisionsFor(284)[5][1] + core.decisionsFor(284)[5][2]));
    ok('Good band mask decision says not needed', /Not needed/.test(core.decisionsFor(20)[5][1]));

    /* ---------- v3: multi-city compare sorting ---------- */
    var cmpInput = [{ name: 'Delhi', aqi: 412 }, { name: 'Kochi', aqi: 38 }, { name: 'Mumbai', aqi: 168 }];
    var cmp = core.sortCompare(cmpInput);
    eq('Compare sorts cleanest first', cmp[0].name, 'Kochi');
    eq('Compare sorts dirtiest last', cmp[2].name, 'Delhi');
    eq('Compare does not mutate its input', cmpInput[0].name, 'Delhi');
    var cmpNull = core.sortCompare([{ name: 'X', aqi: null }, { name: 'Y', aqi: 90 }]);
    eq('Compare sinks missing readings to the end', cmpNull[1].name, 'X');
    eq('Compare of empty list is empty', core.sortCompare([]).length, 0);

    /* ---------- v3: 7-day outlook aggregation ---------- */
    var hourly = [];
    // Day 1: two hours averaging 100 · Day 2: two hours averaging 300
    hourly.push({ time: '2026-11-27T08:00', aqi: 80 }, { time: '2026-11-27T09:00', aqi: 120 });
    hourly.push({ time: '2026-11-28T08:00', aqi: 280 }, { time: '2026-11-28T09:00', aqi: 320 });
    var days = core.dailyOutlook(hourly);
    eq('Outlook groups hours into days', days.length, 2);
    eq('Outlook day average is the mean AQI', days[0].avg, 100);
    eq('Outlook day max is tracked', days[1].max, 320);
    eq('Outlook days are date-sorted', days[0].date, '2026-11-27');
    var bwd = core.bestWorstDays(days);
    eq('Outlook best day is the lowest average', bwd.best.date, '2026-11-27');
    eq('Outlook worst day is the highest average', bwd.worst.date, '2026-11-28');
    eq('Outlook of empty series is empty', core.dailyOutlook([]).length, 0);
    eq('Best/worst day of empty outlook is null', core.bestWorstDays([]), null);

    /* ---------- Regression: missing data is never a value ----------
       Live smoke test (26 Nov 2026): days beyond the forecast horizon
       arrived with null PM values and rendered as "AQI 0 · Good ·
       Range 0–0", with one wrongly tagged BEST DAY; a partly-missing
       day showed "Range 0–420". Missing hours must contribute nothing. */
    var sparseHourly = [];
    // Day 1: two real hours averaging 100 · Day 2: no data at all
    // (every hour null, as Open-Meteo returns past its horizon) ·
    // Day 3: one missing hour mixed with real hours 100 and 300.
    sparseHourly.push({ time: '2026-11-27T08:00', aqi: 80 }, { time: '2026-11-27T09:00', aqi: 120 });
    sparseHourly.push({ time: '2026-11-28T08:00', aqi: null }, { time: '2026-11-28T09:00', aqi: null });
    sparseHourly.push({ time: '2026-11-29T08:00', aqi: null }, { time: '2026-11-29T09:00', aqi: 100 }, { time: '2026-11-29T10:00', aqi: 300 });
    var sparseDays = core.dailyOutlook(sparseHourly);
    eq('No-data day still appears in the outlook', sparseDays.length, 3);
    eq('No-data day reports 0 hours with data', sparseDays[1].hours, 0);
    eq('No-data day average is null — never 0', sparseDays[1].avg, null);
    eq('No-data day min is null — no fake range', sparseDays[1].min, null);
    eq('No-data day max is null — no fake range', sparseDays[1].max, null);
    var sparseBw = core.bestWorstDays(sparseDays);
    eq('Best day ignores the no-data day', sparseBw.best.date, '2026-11-27');
    eq('Worst day is the highest real average', sparseBw.worst.date, '2026-11-29');
    eq('Best/worst of only no-data days is null', core.bestWorstDays([sparseDays[1]]), null);
    eq('Partly-missing day averages real hours only', sparseDays[2].avg, 200);
    eq('Range never starts at 0 from a missing hour', sparseDays[2].min, 100);
    eq('Partly-missing day max uses real hours only', sparseDays[2].max, 300);
    var winNull = core.bestWorstWindows([{ time: 'a', aqi: null }, { time: 'b', aqi: 150 }, { time: 'c', aqi: 260 }]);
    eq('Best window ignores missing hours', winNull.best.time, 'b');
    eq('Best/worst window of all-missing hours is null', core.bestWorstWindows([{ time: 'a', aqi: null }]), null);

    /* ---------- v3: 24-hour history shaping ---------- */
    var longSeries = [];
    for (var i = 0; i < 30; i++) longSeries.push({ time: 'h' + i, aqi: 100 + i });
    var hist = core.historySeries(longSeries, 24);
    eq('History keeps exactly the last 24 hours', hist.length, 24);
    eq('History starts at the 7th-oldest entry', hist[0].aqi, 106);
    eq('History bar height scales with AQI (250 → 50%)', core.historySeries([{ time: 't', aqi: 250 }], 24)[0].heightPct, 50);
    ok('History bars never shrink below 4%', core.historySeries([{ time: 't', aqi: 1 }], 24)[0].heightPct >= 4);
    eq('History bar colour matches the CPCB band', core.historySeries([{ time: 't', aqi: 30 }], 24)[0].color, '#22a14b');
    eq('History of empty series is empty', core.historySeries([], 24).length, 0);

    /* ---------- Regression: history never shows future hours ----------
       Live smoke test (26 Nov 2026, 1:09 pm): the chart drew a bar for
       2:00 pm. Shaping with a "now" must drop every later hour, keep
       the current hour, and leave past-only behaviour unchanged. */
    var baseMs = Date.UTC(2026, 10, 26, 0, 0, 0); // 26 Nov 2026, 00:00 UTC
    var timedSeries = [];
    for (var ti = 0; ti < 30; ti++) {
      var tMs = baseMs + ti * 3600000;
      timedSeries.push({ time: new Date(tMs).toISOString(), ms: tMs, aqi: 120 });
    }
    var nowMs = baseMs + 13 * 3600000 + 9 * 60000; // 1:09 pm on the day
    var histNow = core.historySeries(timedSeries, 24, nowMs);
    eq('History with now keeps hours 0–13 only', histNow.length, 14);
    ok('History contains no future hour', histNow.every(function (h) { return Date.parse(h.time) <= nowMs; }));
    eq('History last bar is the current hour', histNow[histNow.length - 1].time, new Date(baseMs + 13 * 3600000).toISOString());
    eq('History without now is unchanged', core.historySeries(timedSeries, 24).length, 24);

    /* ---------- v3: what changed today ---------- */
    var chg = core.dayChange(300, 250);
    eq('Change delta is today minus yesterday', chg.delta, 50);
    eq('Rising AQI direction is up', chg.direction, 'up');
    ok('Rising AQI is described as worse', /worse/.test(chg.text));
    eq('Falling AQI direction is down', core.dayChange(180, 240).direction, 'down');
    ok('Falling AQI is described as better', /better/.test(core.dayChange(180, 240).text));
    eq('Equal AQI direction is same', core.dayChange(200, 200).direction, 'same');
    eq('Change with missing yesterday is null', core.dayChange(200, null), null);
    eq('Change with missing today is null', core.dayChange(null, 200), null);

    /* ---------- v3: family profile save / load ---------- */
    var profile = { members: { kids: true, elderly: false, asthma: true, pregnant: false, pets: false, wfh: true }, purifier: 'no', home: 'hostel', travel: 'metro' };
    var roundTrip = core.decodeProfile(core.encodeProfile(profile));
    ok('Profile survives an encode → decode round-trip', !!roundTrip);
    eq('Round-trip keeps members (kids)', roundTrip.members.kids, true);
    eq('Round-trip keeps members (asthma)', roundTrip.members.asthma, true);
    eq('Round-trip keeps purifier choice', roundTrip.purifier, 'no');
    eq('Round-trip keeps home type', roundTrip.home, 'hostel');
    eq('Round-trip keeps travel mode', roundTrip.travel, 'metro');
    eq('Corrupt JSON decodes to null', core.decodeProfile('{not json'), null);
    eq('Empty string decodes to null', core.decodeProfile(''), null);
    var dirty = core.decodeProfile(JSON.stringify({ members: { kids: 1, hacker: true }, purifier: 'maybe', home: 'castle', travel: 'rocket' }));
    ok('Unknown member keys are dropped', !('hacker' in dirty.members));
    eq('Invalid purifier falls back to yes', dirty.purifier, 'yes');
    eq('Invalid home falls back to apartment', dirty.home, 'apartment');
    eq('Invalid travel falls back to walk', dirty.travel, 'walk');
    eq('Encoding a non-profile gives null', core.encodeProfile(null), null);

    var passed = results.filter(function (r) { return r.pass; }).length;
    return { total: results.length, passed: passed, failed: results.length - passed, results: results };
  }

  function renderInto(el) {
    var out = runTests();
    var lines = out.results.map(function (r) {
      return (r.pass ? '✓ PASS' : '✗ FAIL') + '  ' + r.label + (r.pass ? '' : '  (got ' + r.actual + ', want ' + r.expected + ')');
    });
    el.textContent = lines.join('\n') + '\n\n' + out.passed + '/' + out.total + ' tests passed' + (out.failed ? ' — ' + out.failed + ' FAILED' : ' ✓');
    return out;
  }

  global.HawaTests = { run: runTests, renderInto: renderInto };

  /* Node runner: `node assets/tests.js` — loads aqi-core.js, runs the suite,
     prints every result and exits non-zero if any assertion fails.
     Browser use is unaffected (module/require/process are undefined there). */
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function' && require.main === module) {
    var core = require('./aqi-core.js').HawaCore;
    var out = runTests(core);
    out.results.forEach(function (r) {
      console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.label + (r.pass ? '' : '  (got ' + r.actual + ', want ' + r.expected + ')'));
    });
    console.log('\n' + out.passed + '/' + out.total + ' tests passed' + (out.failed ? ' — ' + out.failed + ' FAILED' : ''));
    process.exit(out.failed ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : this);
