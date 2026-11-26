/**
 * Hawa — tests.js
 * Runnable test suite for aqi-core.js. No framework needed:
 * open the page and click "Run tests", or call HawaTests.run() in the console.
 * Covers: band classification, CPCB sub-index conversion, AQI = max rule,
 * best/worst windows, and decision/verdict logic.
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

