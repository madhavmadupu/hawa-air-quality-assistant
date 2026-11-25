# Hawa: building an Urban Air Quality Assistant that explains itself

**PromptWars Virtual — Challenge 06** · by Madhav Madupu · Nov 2026

## The problem

Winter smog in Indian cities is not an abstract chart. It is a parent deciding whether the kids can play outside, whether to open the windows, whether the morning walk is safe for an elderly parent, and whether the commute should be the metro or a bike. Existing AQI apps give a number. Families need a decision — and a reason they can trust.

## The solution: Hawa

Hawa ("air" in Hindi/Urdu) turns a live AQI reading into a family day-plan:

1. **Honest data.** The decision engine runs on the India CPCB scale; city values are labelled as typical winter examples, with links to CPCB live data. No invented readings presented as live. Next iteration: wire the Open-Meteo Air Quality API (verified live 25 Nov 2026 — Hyderabad PM2.5 6.8 µg/m³, US AQI 55, no API key) so the gauge reads live.
2. **Who is breathing matters.** A single AQI number means different things for a 7-year-old, a healthy adult, an elderly parent and someone with asthma. Hawa keeps four family profiles and tailors outdoor limits, masks and activity advice to each.
3. **A plan, not a panic.** Best/worst windows for ventilation, exercise and errands; low-emission commute choices; indoor hacks that work (wet-mopping, cross-ventilation in clean windows, kitchen exhaust, a DIY box-fan filter) and myths called out (houseplants don't clean room air).
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

**What I corrected after the first build:** the first draft asserted a spare-parts-style certainty it didn't have — it stated health claims without sources. I cut every unsourced claim, tied all guidance to the EPA AQI bands, and made the fallback-data labelling explicit. I also verified the API live (Hyderabad, 25 Nov 2026: PM2.5 6.8 µg/m³, US AQI 55) rather than trusting the docs.

## What I learned

- Prompting is specification: the quality of the app tracked the precision of the prompt, especially the "show your working" and "never invent readings" constraints.
- Grounding beats fluency: a GenAI assistant that cites live numbers is useful; one that sounds confident about invented numbers is dangerous, especially for health decisions.
- Small scope wins: one city, one family, one day — done well — beats a dashboard of everything.

## Limitations

- AQI comes from the CAMS model via Open-Meteo, not a sensor in the user's street; hyperlocal readings will differ.
- Guidance is general information, not medical advice.
- The assistant answers from the data on screen; it has no access to the user's medical history and must not be asked for it.

## Links

- Live demo: https://muse.ai/s/urban-air-quality-assistant-xph6xvvmaxcxexyxn/NdEN1USJdF-WLG83QmnCfibJGYYfv0ieTv-ruItE53A
- Hack2skill event: https://hack2skill.com/event/pwvirtual1
- Submissions: https://hack2skill.com/event/pwvirtual1/dashboard/submissions
