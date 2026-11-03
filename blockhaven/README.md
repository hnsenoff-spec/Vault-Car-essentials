# Blockhaven

An original first-person voxel sandbox in one HTML file, written in raw WebGL 2 with no libraries. All textures, sounds and terrain are generated in the browser.

## Run

Open `index.html` in a desktop browser (Chrome, Edge, Firefox or Safari with WebGL 2). Or serve the folder:

```bash
python3 -m http.server 8000
```

Then open http://127.0.0.1:8000/blockhaven/ from the repo root. The game needs a keyboard and mouse. The world saves to browser storage every 30 s and when you pause.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump / swim up (double-tap in Creative to fly) |
| Shift | Sneak (won't walk off edges) |
| R or double-tap W | Sprint (Ctrl is not used because Ctrl+W closes the browser tab) |
| Left click (hold) | Mine |
| Right click | Place block, use bucket, open table/furnace/chest |
| Middle click | Pick block |
| 1–9, wheel | Hotbar |
| E | Inventory / crafting |
| Q / Shift+Q | Drop one / drop stack |
| F3 | Debug info (coordinates, biome, light levels) |
| F1 | Hide HUD |
| Esc | Pause and settings |

## What's simulated

| System | Behaviour |
|---|---|
| World | 16×16×128 chunks, sea level 62, seeded terrain: continents, ridged mountains, plains, forest, desert, snowy taiga, beaches, oceans, frozen oceans |
| Underground | Spaghetti tunnels plus cheese caverns, lava below y=10, bedrock floor, coal/iron/gold/diamond veins with classic per-chunk counts and depth ranges, dirt and gravel pockets |
| Lighting | Separate sky and block light (0–15) flood-filled across chunk borders, updated on every block change; smooth lighting with ambient occlusion; day/night cycle of 24,000 ticks (20 min) |
| Movement | 20 ticks/s with the classic constants: gravity 0.08, drag 0.98, jump 0.42 (apex 1.2522 blocks), walk 4.317 m/s, sprint 5.612 m/s, sprint-jump boost, ice slipperiness, sneak edge guard, swimming |
| Survival | 20 HP, fall damage = blocks fallen − 3, drowning after 15 s of air, lava and burning, cactus contact, natural regeneration, death drops your inventory |
| Mining | Break time = hardness × 30 (or 100 without the right tool) ÷ tool speed, ×5 slower underwater or airborne; tool tiers gate ores (stone needs wood, iron needs stone, gold/diamond need iron, obsidian needs diamond); tool durability |
| Fluids | Water (5-tick) and lava (30-tick) with source/flow levels, falling columns, flow toward the nearest drop, infinite water sources, lava + water makes obsidian, cobblestone or stone |
| Blocks | Falling sand and gravel, leaf decay with sapling drops, saplings that grow into trees, grass spreading, cactus growth |
| Crafting | 2×2 inventory grid and 3×3 table, shaped (with mirroring) and shapeless recipes: planks, sticks, table, torches, furnace, chest, wood/stone/iron/diamond pickaxes, axes and shovels, bucket, sandstone, stone bricks, metal blocks |
| Furnace | 10 s per item, fuel values (coal 80 s, planks 15 s, lava bucket 1000 s), lights up while burning |

## Not included

Mobs, hunger, redstone, beds, the Nether, multiplayer.
