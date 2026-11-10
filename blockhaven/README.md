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
| Right click | Place block, use bucket/hoe/seeds/shears, open table/furnace/chest, open or close a door, sleep in a bed, equip armor, feed an animal |
| Right click (hold) | Eat food, draw a bow (release to fire) |
| Middle click | Pick block |
| 1–9, wheel | Hotbar |
| E | Inventory / crafting |
| Q / Shift+Q | Drop one / drop stack |
| F3 | Debug info (coordinates, biome, light levels, day, weather, XP) |
| F1 | Hide HUD |
| Esc | Pause, settings, difficulty (Peaceful/Easy/Normal/Hard) |

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
| Crafting | 2×2 inventory grid and 3×3 table, shaped (with mirroring) and shapeless recipes: planks, sticks, table, torches, furnace, chest, wood/stone/iron/diamond pickaxes, axes and shovels, bucket, sandstone, stone bricks, metal blocks, slabs, stairs, fences, doors, mossy cobblestone (cobblestone + grass) |
| Mobs | Pigs, cows, sheep and chickens spawn in herds on grass and are saved with the world; they wander, avoid cliffs, panic when hit and follow you if you hold wheat or seeds. Zombies, skeletons and spiders spawn in darkness (block light 0, sky light ≤ 7) 24–64 blocks away, chase on sight, and despawn far away. Zombies and skeletons burn in sunlight; spiders climb walls, pounce and are neutral in daylight; skeletons strafe and shoot arrows with gravity |
| Combat | Swords 4/5/6/7 damage (wood→diamond), other tools less, fists 1; falling crits ×1.5; knockback (stronger when sprinting); 10-tick invulnerability; bow with draw power curve, full-draw crits, arrows that stick and can be picked up |
| Hunger | 20 food points plus saturation and exhaustion (sprinting, jumping, mining, fighting, healing). Fast healing at full food, slow at 18+, starvation at 0 (stops at 10 HP on Easy, 1 HP on Normal, kills on Hard). Can't sprint at 6 or below. Eating takes 1.6 s |
| Food | Apples (from oak leaves), bread, and raw/cooked porkchop, beef, chicken and mutton (cook in the furnace), rotten flesh |
| Armor | Leather, iron and diamond helmet/chestplate/leggings/boots with armor points, diamond toughness, the classic damage-reduction formula and durability; armor bar in the HUD |
| Farming | Hoe turns grass/dirt into farmland, which hydrates within 4 blocks of water and dries back to dirt; wheat grows through 8 stages on random ticks; tall grass drops seeds; landing on farmland can trample it |
| Beds & ladders | Beds (3 wool + 3 planks) set your respawn point and skip the night when no monsters are within 8 blocks; ladders let you climb, and sneaking holds you in place |
| Drops | Leather, feathers, wool (or shear sheep for 1–3), string, bones, arrows, rotten flesh; gravel drops flint |
| Villages | Generate on open ground in plains, desert and taiga (oak, sandstone or spruce style), roughly one every 300–500 blocks: a fenced well, gravel roads, houses with doors, stepped stair roofs, beds, crafting tables, furnaces and loot chests, wheat farms with water channels, and fence lamp posts. New worlds start on a village street; when you load a world away from one, a message gives the distance and direction, and F3 shows its coordinates |
| Villagers | Farmers, smiths, butchers and masons live in the houses, stay near home and flee monsters. Right-click one to trade; gold ingots are the currency (sell wheat, meat, coal, iron or cobblestone; buy bread, steak, iron tools and armor, stone bricks, glass, torches) |
| Emberdeep | A cavern dimension under a bedrock ceiling with a lava sea at y=31, ashrock, cinder sand beaches, hanging glowshard clusters and fire-proof Ashen that set you alight. Build a 4×5 obsidian frame (corners optional, up to 21×21) and light it with a Fire Striker (iron ingot + flint). One block there equals 8 in the Overworld, and a return gate is built for you if none is near. Water evaporates and beds don't work |
| Skyreach | Floating islands over the void with skystone, skygrass, skyleaf trees, sky crystal ore (iron pickaxe or better) and sky shrines holding loot. Reach it with a frame of glowshard blocks (4 glow dust each, mined in Emberdeep) lit with the Fire Striker |
| Crystal gear | Sky crystals craft the top tool tier (mining speed 10, 2031 uses, crystal sword deals 8) and crystal lanterns |
| Furnace | 10 s per item, fuel values (coal 80 s, planks 15 s, lava bucket 1000 s), lights up while burning |
| Slabs & stairs | Oak, spruce, birch, cobblestone, stone brick and sandstone slabs (3 blocks → 6) and stairs (6 blocks → 4). Slabs place in the top or bottom half depending on where you click and two halves make a full block; stairs face away from you and go upside down when placed under a block or on the upper half of a face. The classic 0.6-block step height lets you walk up them without jumping |
| Fences & doors | Oak, spruce and birch fences (planks + sticks) connect to neighbours and stand 1.5 blocks high so nothing jumps them; torches sit on top. Oak and spruce doors (6 planks → 3) are two blocks tall, open and close with a right-click, and stop monsters when shut |
| Dungeons | Cobblestone rooms with mossy floors are carved into caves underground (up to one per chunk, only where they open onto a cave). Each holds a monster spawner and 1–2 loot chests (iron, gold, bread, string, bones, arrows, armor, a rare diamond) |
| Spawners | A caged spawner wakes when you are within 16 blocks and every 10–40 s spawns up to 4 zombies, skeletons or spiders in the dark around it, up to 6 nearby. Light the room above level 7 to stop it, or mine it with a pickaxe (it drops nothing) |
| Experience | Green orbs drop from killing mobs (5 for monsters, 1–3 for animals), mining coal, diamond and sky crystal ore, breeding, and smelting (collected when you take the output). Orbs float to you within 8 blocks. Levels use the classic curve (7, 9, 11… points) with a green bar and level number above the hotbar; dying drops 7 XP per level (max 100) and resets you to 0 |
| Enchanting | Sugar cane grows by water and crafts paper (3 → 3); paper + leather makes a book; books + planks make bookshelves; a book, 2 diamonds and 4 obsidian make the enchanting table. Up to 15 bookshelves placed one block away raise the three offered levels (max 30). Classic rules: an option costs the shown number of levels and rolls one or more enchantments from the item's enchantability. Sharpness, Knockback, Fire Aspect, Looting, Efficiency, Unbreaking, Fortune, Silk Touch, Protection, Fire Protection, Feather Falling, Power, Punch, Flame and Infinity all work; enchanted items glow purple and list their enchantments in the tooltip |
| Days & weather | A day counter sits in the top-right corner and a message marks each new day. Rain arrives every 10–150 minutes and lasts 10–20; a third of showers are thunderstorms with lightning flashes and thunder. Rain darkens the sky, dims the light by 3 levels (so undead stop burning and monsters spawn more), puts out fire, waters farmland and falls as snow in the taiga, frozen oceans and high mountains |
| Breeding | Right-click two cows, sheep or pigs with wheat, or two chickens with seeds, and they walk together and produce a baby. Babies are half size with big heads, follow adults, grow up in 20 minutes (faster when fed) and drop nothing. Parents need 5 minutes before they can breed again |

## Not included

The full game is far larger than this. Missing: anvils and enchanted books, brewing, redstone, mineshafts, strongholds and temples, bosses, boats and minecarts, fence gates and trapdoors, dyes, snow layers, multiplayer. Creepers, Endermen, the Nether and the End are not copied: Blockhaven's dimensions, mobs and portals have their own designs.
