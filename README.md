# Hawa — Urban Air Quality Assistant

**Hack2skill PromptWars Virtual — Challenge 06: Urban Air Quality Assistant**
**Deadline: Sun 29 Nov 2026, 23:59 IST** · 3 submission attempts · Top 400 earns Swag Credits

Hawa helps families in smog-prone Indian cities decide what to do today — when to ventilate, how to commute, how to protect children and older adults, and what actually helps indoors — using the CPCB AQI scale, transparent reasoning, and a GenAI-built decision engine that explains rather than invents.

## Live demo

Public link: https://muse.ai/s/urban-air-quality-assistant-xph6xvvmaxcxexyxn/NdEN1USJdF-WLG83QmnCfibJGYYfv0ieTv-ruItE53A

## What it does

- **Interactive AQI decision engine** — set the AQI (slider/input) or pick a city example; verdicts update instantly for school run, walks, kids' play, exercise, ventilation and masks, on the India CPCB scale. City values are clearly labelled as typical winter examples, with links to CPCB live data — the app does not claim them as live readings.
- **Hour-by-hour low-emission routine** — best and worst windows for outdoor time, exercise and ventilation.
- **Family profiles** — Child, Adult, Elderly, Asthma / sensitive. Each gets its own risk level, outdoor-time limit, mask and activity guidance.
- **Today's low-emission plan** — commute mode (metro / bus / car-pool / walk in a clean window), cooking, cleaning and errand timing, each with an explained impact.
- **Indoor air hacks** — a checklist that actually works: cross-ventilate only in clean windows, wet-mop instead of dry sweeping, DIY box-fan filter, kitchen exhaust while cooking, sealing gaps. Myths flagged (e.g. houseplants do not clean room air at any meaningful rate).
- **Family Plan builder** — who's home, purifier, home type, travel mode; generates a personalised plan you can copy or download as .txt.
- **Mask & purifier guides, myths, red flags** — when a mask helps, what a purifier can and can't do, and the warning signs that mean see a doctor.
- **Impact, explained** — every recommendation shows its basis (e.g. "PM2.5 6.8 µg/m³ now, forecast peak 18:00–21:00"), not a black-box verdict.

## Data sources

- India CPCB scale for AQI bands; city values in the app are labelled typical winter examples, with links to CPCB live data.
- Open-Meteo Air Quality API was verified live 25 Nov 2026 (Hyderabad: PM2.5 6.8 µg/m³, US AQI 55) and is the planned live-data source for the next iteration — see TECHNICAL-BLOG.md.

## Health guidance basis

AQI bands follow the US EPA AQI scale (0–50 Good, 51–100 Moderate, 101–150 Unhealthy for Sensitive Groups, 151–200 Unhealthy, 201–300 Very Unhealthy, 301+ Hazardous). Guidance is general information, not medical advice — people with asthma or heart/lung conditions should follow their doctor's plan.

## Prompt strategy

See `TECHNICAL-BLOG.md` — it documents the exact prompts used to build Hawa with GenAI, what was kept, what was corrected, and why.

## Run it

The app is a single self-contained web app (no build step, no API key). Open the public link, or serve the exported HTML locally.

## Submission

- Hack2skill dashboard: https://hack2skill.com/event/pwvirtual1/dashboard/submissions
- Leaderboard: https://hack2skill.com/event/pwvirtual1/dashboard/leaderboard
- Do **not** submit until Madhav confirms Attempt 1. Attempts are limited to 3.
