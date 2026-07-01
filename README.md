# Minecraft 2D
🎮 **[▶ Play it live](https://bsharahaj-minecraft.netlify.app/)**
A 2D Minecraft-inspired sandbox game built with pure HTML, CSS, and JavaScript.
Dig blocks with the right tool, collect them in your inventory, and place them
back to reshape a procedurally-generated world.

## Features
- Procedural world generation with rules (grass on top, dirt below, stone deep down, trees on grass, ore underground)
- Three tools — Axe (trees/leaves/cactus), Pickaxe (rock/ore/ice), Shovel (dirt/sand/grass/snow)
- Full inventory system — collect multiple block types with counts, place them back
- Four biomes — Forest, Desert, Snow, and Cave, each with unique terrain
- Hold-to-mine with progressive crack animation
- Block-break particles, screen shake, sound effects, and depth lighting
- Hand-made pixel-art block and tool textures
- Cinematic landing page with an animated title screen and parallax sunset vista
- Reset button that regenerates the world

## How to Play
1. Open `index.html` and click Play
2. Pick a tool from the left dock
3. Hold-click a matching block to mine it
4. Open the chest to see your inventory; select a block and click an empty spot to place it
5. Switch biomes or reset the world anytime

## What I Found Hard
The trickiest part was the world generation and rendering working together. Getting
trees to grow properly on grass without floating, and deciding whether a dug-out block
should show sky or a dark cave, took a lot of trial and error. I also spent real time
debugging why switching biomes didn't change the world — it turned out the code was
re-drawing the same world data instead of generating a new one. Keeping the pixel-art
textures crisp instead of blurry when scaled up was another thing I had to figure out.

## Known Bugs
None currently known — the core loop (mine, collect, place, reset), all four biomes,
and the tools all work as expected.

## Assignment Review
I really enjoyed this assignment. Starting from a simple hardcoded grid and building
up to procedural generation, biomes, and animations taught me a lot about organizing
game state and debugging step by step. Splitting everything into HTML, CSS, and JS
kept it manageable, and using one Game object for all the logic made the code easier
to follow.

## Tech
HTML, CSS, JavaScript — no frameworks. Textures are hand-made pixel art.