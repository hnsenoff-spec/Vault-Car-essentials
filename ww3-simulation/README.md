# Strategic Command Sim (fictional)

Dark "command center" dashboard for a **fictional** crisis simulation. All state is generated in the browser. No external APIs, no real-world or live data, and leaders appear by role title only.

## Run

```bash
python3 serve.py        # http://127.0.0.1:8000/  (python3 serve.py 9000 for another port)
```

No build step. Google Fonts is the only external request, and the page falls back to system fonts if it's unavailable.

## Files

| File | Purpose |
|---|---|
| `serve.py` | Static server with caching turned off, so edits show up on reload |
| `index.html` | Layout and styles (3 columns; stacks to 1 column under 900px) |
| `leaders.js` | **Edit me:** sides, leader entities, sites, message templates, fog-of-war confidence model, timings |
| `worldmap.js` | Hand-simplified continent outlines |
| `sim.js` | Simulation engine, map renderer, comms feed, telemetry |

## Calibration (open-source research)

`REALISM` and the per-side numbers in `leaders.js` are loosely scaled from public research. The sim is still a toy: each sim missile stands for a large share of an arsenal, and sites and leaders are fictional.

| Parameter | Value in sim | Basis |
|---|---|---|
| Timescale | 1 sim s ≈ 8 real s | ICBM flight ≈ 25–30 min; SLBM ≈ 10–15 min ([Global Zero / Blair 2019](https://www.globalzero.org/wp-content/uploads/2020/11/Full-LOWTimeline.pdf)) |
| Decision window | 60–110 sim s (≈ 8–15 min) | Same source: the decision has to be made before impact |
| Arsenal ratio US : RU : PRC | 10 : 10 : 4 | [FAS Status of World Nuclear Forces](https://fas.org/initiative/status-world-nuclear-forces/), [SIPRI 2025](https://www.sipri.org/media/press-release/2025/nuclear-risks-grow-new-arms-race-looms-new-sipri-yearbook-out-now) |
| US missile defence | 2 interceptors, 55% | 44 GMD interceptors, ~55% test record ([Wikipedia/MDA](https://en.wikipedia.org/wiki/Ground-Based_Midcourse_Defense)) |
| Retaliation 90%, often escalating | per detected wave | Wargame players insist on "the last word" ([LLNL CGSR bibliography](https://cgsr.llnl.gov/sites/cgsr/files/2024-08/2024-03-13-Annotated-bibliography_intrawar-deterrence_final.pdf); [RAND](https://www.rand.org/content/dam/rand/pubs/research_reports/RRA1200/RRA1204-1/RAND_RRA1204-1.pdf)) |
| PRC no first use | only fires if attacked | Declared PRC policy |
