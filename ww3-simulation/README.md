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
