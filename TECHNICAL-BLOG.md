# Hawa: building an Urban Air Quality Assistant that explains itself

**PromptWars Virtual — Challenge 06** · by Madhav Madupu · Nov 2026

## The problem

Winter smog in Indian cities is not an abstract chart. It is a parent deciding whether the kids can play outside, whether to open the windows, whether the morning walk is safe for an elderly parent, and whether the commute should be the metro or a bike. Existing AQI apps give a number. Families need a decision — and a reason they can trust.

## The solution: Hawa

Hawa ("air" in Hindi/Urdu) turns a live AQI reading into a family day-plan:

1. **Honest, live data.** The decision engine runs on the India CPCB scale. Tap any city and the app fetches live PM2.5/PM10 from the Open-Meteo Air Quality API (no API key), converts it to CPCB AQI, and shows the reading time, PM values and source on screen. Before a live fetch succeeds, city values are labelled as typical winter examples, with links to CPCB live data. No invented readings presented as live. The last live reading is cached in the browser, so repeat visits render instantly while fresh data loads.
2. **Who is breathing matters.** A single AQI number means different things for a 7-year-old, a healthy adult, an elderly parent and someone with asthma. Hawa keeps four family profiles and tailors outdoor limits, masks and activity advice to each. Profiles can be named, saved in the browser, reloaded and deleted — and the plan prints as a fridge poster.
3. **A plan, not a panic.** Best/worst windows for ventilation, exercise and errands — now from the next-24-hour forecast, not just a static routine; a 7-day outlook with the best and worst day highlighted; a 24-hour history chart; a plain-words "what changed today" line; multi-city comparison; low-emission commute choices; indoor hacks that work (wet-mopping, cross-ventilation in clean windows, kitchen exhaust, a DIY box-fan filter) and myths called out (houseplants don't clean room air).
4. **Explain, don't just assert.** Every recommendation carries its basis on screen — the current reading, the forecast peak, the AQI band — so a family can check the reasoning instead of trusting a black box.

## Prompt strategy — how GenAI built this

PromptWars is a vibe-coding challenge: the craft is in the prompts. These are the prompts that built Hawa, in order:

**Prompt 1 — Product definition.**
> "Design a GenAI Urban Air Quality Assistant for families in smog-prone Indian cities (Hyderabad first). It must turn live AQI into a daily plan: when to ventilate, exercise and commute, how to protect children, elderly and asthma patients, and indoor air hacks that actually work. Every recommendation must show the data behind it. No invented readings."

**Prompt 2 — Data grounding.**
> "Use the India CPCB AQI scale. City values must be labelled as typical winter examples with links to CPCB live data. Never present example data as a live reading. Next iteration: fetch live PM2.5, PM10 and AQI from the free Open-Meteo Air Quality API — no API key."

**Prompt 3 — Personalisation.**
> "Add family profiles (child, adult, elderly, asthma/sensitive). Derive each profile's outdoor-time limit and mask guidance from the US EPA AQI bands, and show the band and the numbers next to the advice."

**Prompt 4 — Behaviour, not just information.**
> "Add a low-emission daily plan and an indoor-hacks checklist. Rank hacks by evidence (ventilation timing, wet-mopping, exhaust fan, DIY filter) and flag common myths with a one-line reason."

**Prompt 5 — The plan, exportable.**
> "Add a Family Plan builder (who's home, purifier, home type, travel mode) that generates a personalised day plan the family can copy or download as text. Keep every line tied to the AQI verdict on screen."

**Prompt 6 — Live AQI (v2).**
> "Wire live data. For the selected city, geocode it with the Open-Meteo Geocoding API, fetch current + hourly PM2.5 and PM10 from the Open-Meteo Air Quality API, and convert to CPCB AQI. Show the reading time, PM values and source. The US AQI number from the API must never be presented as the CPCB AQI. From the hourly forecast, show the best and worst windows in the next 24 hours. If the fetch fails, fall back to the labelled winter examples and say so plainly."

**Prompt 7 — Make it testable (v2).**
> "Split the app into modules: pure AQI logic with no DOM and no fetch, UI wiring that calls it, and a test suite. The logic file must be unit-testable in Node and in the browser, with a visible Run Tests button. No embedded base64 images — ship real asset files."

**Prompt 8 — More useful, not more screens (v3).**
> "Add only features a family would use this week: compare up to 3 cities' live AQI side by side, a 7-day outlook with the best and worst day highlighted, a 24-hour history chart, a plain-words 'what changed today' line versus yesterday's same-hour reading, and saved family profiles (name, save, reload, delete) in the browser plus a printable plan. Cache the last live reading so repeat visits render instantly. Every new feature's logic must live in the pure-logic file and be covered by tests — no untested UI maths."

**Prompt 9 — Polish and access (v3).**
> "Make it feel finished: a dark-mode toggle that remembers the choice and respects the system preference, lazy-load the hero image, keep the code small and the page fast. Every control must work from the keyboard, with visible focus states and proper ARIA labels on the gauge, slider and buttons, and contrast that passes in both themes."

**What I corrected after the first build:** the first draft asserted a spare-parts-style certainty it didn't have — it stated health claims without sources. I cut every unsourced claim, tied all guidance to the EPA AQI bands, and made the fallback-data labelling explicit. I also verified the API live (Hyderabad, 25 Nov 2026: PM2.5 6.8 µg/m³, US AQI 55; re-verified 26 Nov 2026: PM2.5 13.4 µg/m³, US AQI 51) rather than trusting the docs.

## Live-AQI prompt strategy (v2)

The live-data prompt was written as a contract, not a wish list, because the failure mode that matters most here is a confident wrong number:

- **Two-step fetch, one source of truth.** Geocoding (`geocoding-api.open-meteo.com/v1/search`) resolves the city to lat/lon; the air-quality call (`air-quality-api.open-meteo.com/v1/air-quality?current=pm2_5,pm10&hourly=pm2_5,pm10&forecast_days=2`) returns raw concentrations only. The app never asks the API for an AQI number.
- **Convert, don't copy.** The API also offers a US AQI field. The prompt forbids using it: the conversion is done locally in `aqi-core.js` (below), so the number on screen is always a CPCB AQI.
- **Show the receipt.** Every live reading displays city, PM2.5, PM10, the computed CPCB AQI, the reading timestamp and the source ("Open-Meteo Air Quality API (CAMS)"). A badge flips between "● Live reading", "Fetching live…" and "Example values" so the state is never ambiguous.
- **Honest fallback.** Any fetch failure — offline, geocode miss, empty current data — keeps the labelled winter example for that city and says plainly that the live fetch failed and the value is an example, with a pointer to CPCB's live dashboard.

## CPCB conversion (v2)

`assets/aqi-core.js` is pure logic — no DOM, no fetch — so it can be tested in isolation:

- **Breakpoint tables.** Official CPCB brackets for PM2.5 ([0–30, 31–60, 61–90, 91–120, 121–250, 251–500] µg/m³) and PM10 ([0–50, 51–100, 101–250, 251–350, 351–430, 431–1000] µg/m³), each mapped to its index range (0–50, 51–100, 101–200, 201–300, 301–400, 401–500).
- **Linear interpolation** inside the matching bracket: `index = (I_high − I_low) / (C_high − C_low) × (C − C_low) + I_low`, rounded and clamped to 0–500.
- **Max-rule.** The CPCB AQI is the maximum of the pollutant sub-indices — `computeCPCBaqi(pm25, pm10) = max(pm25SubIndex, pm10SubIndex)`. A missing pollutant contributes 0, never a guess.
- **Bands.** 0–50 Good, 51–100 Satisfactory, 101–200 Moderate, 201–300 Poor, 301–400 Very Poor, 401–500 Severe, each with its verdict, health note and six decision cards (school run, morning walk, kids' play, exercise, ventilation, mask).
- **Best/worst windows.** `bestWorstWindows(hourly)` picks the lowest- and highest-AQI hours from the next-24-hour forecast series.

## v3 features — how they work

All new v3 logic lives in `assets/aqi-core.js` (pure, tested); `assets/app.js` only wires it to the page and the network:

- **Multi-city compare.** `sortCompare(cities)` sorts any list of `{name, aqi}` cleanest-first, ignoring cities with no reading. `app.js` geocodes each selected city, fetches its live AQI (past 2 days + 7-day forecast window in one call, so the same response also feeds history and day-change), converts with `computeCPCBaqi`, and renders the sorted cards. A city that fails to fetch is shown as unavailable, never as a guessed number.
- **7-day outlook.** `dailyOutlook(hourly)` groups the hourly PM series by day and reduces each day to its mean AQI; `bestWorstDays(days)` picks the cleanest and worst day. The outlook uses the same CPCB conversion as the live reading, so the numbers are consistent across the page.
- **24-hour history.** `historySeries(hourly, 24)` takes the trailing 24 hourly values and shapes them into `{hour, aqi}` bars for the chart. It reads from the same hourly series as the live fetch — no second request.
- **What changed today.** `dayChange(today, yesterday)` compares today's live AQI with yesterday's same-hour reading (the `past_days=2` fetch provides it) and returns a direction (`up` / `down` / `same`) plus a plain-words sentence. Missing yesterday data returns `null` and the line is hidden, not invented.
- **Saved family profiles.** `sanitizeProfile` / `encodeProfile` / `decodeProfile` validate every field against a whitelist (members, purifier, home type, travel mode) — unknown keys are dropped and invalid values fall back to safe defaults, so a corrupt or hand-edited stored profile can never break the plan. Profiles live in `localStorage` under a versioned key (`hawa-profiles-v3`); the plan itself can be printed as a fridge poster.
- **Cached live readings.** The last successful live response is cached in `localStorage` (`hawa-cache-v3`) with its timestamp. A repeat visit renders the cached reading immediately, then replaces it when the fresh fetch lands. A stale cache is labelled as cached, never as live.

## Accessibility and efficiency work (v3)

Attempt 2 scored Accessibility 98 and Efficiency 80; v3 targets both directly:

- **Accessibility.** Every control is keyboard-operable with a visible focus ring; the AQI gauge, slider and buttons carry ARIA labels and live regions so screen readers announce the verdict when it changes; the compare, outlook and history sections use real headings and lists, not div soup; colour contrast passes in both light and dark themes (checked against the design tokens, not assumed).
- **Efficiency.** No new images were added — the single hero illustration is lazy-loaded (`loading="lazy"`, `decoding="async"`) and the app ships no other media. Total code is ~103 KB (index.html + styles.css + three JS files); the compare/outlook/history features reuse one Open-Meteo response per city instead of firing separate requests. The cached reading keeps repeat visits instant without a network round-trip.

## Test strategy (v3)

`assets/tests.js` — **81 assertions**, no framework (up from 41 in v2):

- **Band classification at every CPCB boundary** (0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 500) plus clamping above 500.
- **Sub-index conversion at every breakpoint** for PM2.5 and PM10 (e.g. PM2.5 30 → 50, 60 → ~100, 90 → ~200, 120 → ~300, 250 → ~400), plus monotonicity checks.
- **Max-rule** — the higher pollutant wins; single-pollutant and no-data cases.
- **Best/worst windows** — lowest/highest hour picked correctly; empty series returns null.
- **Verdict/decision logic** — Good invites going out, Poor says stay in, Severe says seal and stay in; every band has 6 decision cards; the Poor mask card mentions N95.
- **v3: multi-city compare sorting** — cleanest-first ordering, missing readings ignored, ties handled.
- **v3: 7-day outlook** — hourly series grouped into daily means; best/worst day picked correctly.
- **v3: 24-hour history shaping** — trailing 24 values shaped into hour/AQI pairs; short series handled.
- **v3: what changed today** — rising/falling/equal directions and plain-words text; missing yesterday returns null.
- **v3: family profile save/load** — encode → decode round-trip preserves every field; corrupt JSON decodes to null; unknown keys dropped; invalid values fall back to safe defaults.

Run it with `node assets/tests.js` (81/81 passed) or in the browser via the **Run tests** button, which renders pass/fail counts on the page. The suite tests the same code the app ships — `app.js` calls `window.HawaCore`, the tests call the same object. The Node runner was added during packaging (guarded, browser-unaffected) so `node assets/tests.js` prints every result and exits non-zero on failure.

## Scores so far

- **Attempt 1** (25 Nov 2026): **68.77/100** — Code Quality 63, Security 85, Efficiency 40, Testing 13, Accessibility 94, Alignment 82. The single-file build with embedded images and no tests was the bottleneck.
- **Attempt 2** (26 Nov 2026): **94.33/100** — Code Quality 86, Security 100, Efficiency 80, Testing 99, Accessibility 98, Alignment 100; rank #483 / 56,004. Live AQI, modular code and the 41-assertion test suite drove the jump.
- **Attempt 3** (v3, this package): the remaining points sit in Code Quality (86) and Efficiency (80), plus the manual evaluation that decides the final ranking — hence the v3 features, the accessibility and efficiency work, and the extended test suite. One attempt remains; deadline Sun 29 Nov 2026, 23:59 IST.

## What I learned

- Prompting is specification: the quality of the app tracked the precision of the prompt, especially the "show your working" and "never invent readings" constraints.
- Grounding beats fluency: a GenAI assistant that cites live numbers is useful; one that sounds confident about invented numbers is dangerous, especially for health decisions.
- Small scope wins: one city, one family, one day — done well — beats a dashboard of everything.
- **Separation is a prompt too.** Asking for "pure logic, no DOM, no fetch" in the prompt is what made the AQI maths testable at all — the test suite exists because the architecture prompt came before the test prompt.
- **Score feedback is a spec.** Attempt 1's 13 in Testing and 40 in Efficiency were not opinions — they pointed at exactly what to build next: a real test suite and a modular, image-light build. Attempt 2 proved it (+25.56 points).

## Limitations

- AQI comes from the CAMS model via Open-Meteo, not a sensor in the user's street; hyperlocal readings will differ.
- Guidance is general information, not medical advice.
- The assistant answers from the data on screen; it has no access to the user's medical history and must not be asked for it.

## Links

- Live demo: https://hawa-air-quality-assistant.vercel.app/
- GitHub: https://github.com/madhavmadupu/hawa-air-quality-assistant
- Demo video (unlisted): https://www.youtube.com/watch?v=peUFeQgSuLQ
- Hack2skill event: https://hack2skill.com/event/pwvirtual1
- Submissions: https://hack2skill.com/event/pwvirtual1/dashboard/submissions
