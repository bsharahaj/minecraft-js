const Game = {
  COLS: 24,
  ROWS: 18,
  SKY_ROWS: 5,

  world: [],
  heights: [],
  selectedTool: null,
  selectedInventoryType: null,
  inventory: {},
  seed: null,
  audioCtx: null,

  // ---- seeded RNG ----
  makeRng(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  // ---- biome config ----
  biome: 'forest',

  biomeConfig: {
    forest: { surface: 'grass', sub: 'dirt', deep: 'rock', plant: 'tree' },
    desert: { surface: 'sand',  sub: 'sand', deep: 'rock', plant: 'cactus' },
    snow:   { surface: 'snow',  sub: 'dirt', deep: 'ice',  plant: 'tree' },
    cave:   { surface: 'rock',  sub: 'rock', deep: 'rock', plant: null },
  },

  // ---- procedural generation ----
  generateWorld(seed) {
    const rng = this.makeRng(seed);
    const cfg = this.biomeConfig[this.biome];
    this.heights = [];

    let surface = (this.biome === 'cave') ? this.SKY_ROWS + 1 : this.SKY_ROWS + 3;

    for (let c = 0; c < this.COLS; c++) {
      if (rng() < 0.18) surface += rng() < 0.5 ? -1 : 1;
      const min = this.SKY_ROWS + (this.biome === 'cave' ? 0 : 2);
      surface = Math.max(min, Math.min(surface, this.SKY_ROWS + 4));
      this.heights.push(surface);
    }

    const w = [];
    for (let r = 0; r < this.ROWS; r++) {
      const row = [];
      for (let c = 0; c < this.COLS; c++) {
        const g = this.heights[c];
        if (r < g) row.push('sky');
        else if (r === g) row.push(cfg.surface);
        else if (r <= g + 2) row.push(cfg.sub);
        else row.push(rng() < 0.10 ? 'ore' : cfg.deep);
      }
      w.push(row);
    }

    if (cfg.plant) {
      let lastPlant = -4;
      for (let c = 1; c < this.COLS - 1; c++) {
        const g = this.heights[c];
        if (w[g][c] === cfg.surface && c - lastPlant >= 3 && rng() < 0.4) {
          if (cfg.plant === 'tree') {
            const trunkTop = g - 2, mid = g - 3, top = g - 4;
            if (top >= this.SKY_ROWS) {
              w[g - 1][c] = 'tree'; w[trunkTop][c] = 'tree';
              for (const dc of [-1,0,1]) if (w[mid][c+dc] === 'sky') w[mid][c+dc] = 'leaves';
              for (const dc of [-1,0,1]) if (w[top][c+dc] === 'sky') w[top][c+dc] = 'leaves';
              lastPlant = c;
            }
          } else if (cfg.plant === 'cactus') {
            const h = 1 + Math.floor(rng() * 2);
            for (let k = 1; k <= h; k++) if (w[g-k]) w[g-k][c] = 'cactus';
            lastPlant = c;
          }
        }
      }
    }
    return w;
  },

  // ---- startup ----
  init() {
    this.seed = Math.floor(Math.random() * 1e9);
    this.world = this.generateWorld(this.seed);

    this.worldEl = document.getElementById('world');
    this.inventoryEl = document.getElementById('inventory-items');
    this.inventoryPanel = document.getElementById('inventory');

    document.querySelectorAll('.tool').forEach(el => {
      el.addEventListener('click', () => this.selectTool(el.dataset.tool, el));
    });
    document.getElementById('reset-btn')
      .addEventListener('click', () => this.resetWorld());
    document.getElementById('inv-toggle')
      .addEventListener('click', () => this.toggleInventory());

    document.querySelectorAll('.biome-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchBiome(btn));
    });

    this.renderWorld();
    this.renderInventory();
    this.initParallax();
  },

  initParallax() {
    const bg = document.getElementById('game-bg');
    document.getElementById('world-wrap').addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 24;
      const y = (e.clientY / window.innerHeight - 0.5) * 16;
      bg.style.transform = `translate(${x}px, ${y}px)`;
    });
  },

  // ---- rendering ----
  renderWorld() {
    this.worldEl.innerHTML = '';
    document.documentElement.style.setProperty('--world-cols', this.COLS);

    this.world.forEach((row, r) => {
      row.forEach((type, c) => {
        const tile = document.createElement('div');
        tile.className = `tile tile-${type}`;
        tile.dataset.row = r;
        tile.dataset.col = c;

        // DEPTH LIGHTING
        const ground = this.heights[c];
        const depth = r - ground;
        if (depth > 0 && type !== 'sky') {
          const dark = Math.min(depth * 0.06, 0.55);
          tile.style.setProperty('--shade', dark);
        } else {
          tile.style.setProperty('--shade', 0);
        }

        tile.addEventListener('mousedown', (e) => this.startMining(r, c, e));
        tile.addEventListener('mouseup', () => this.stopMining());
        tile.addEventListener('mouseleave', () => this.stopMining());
        this.worldEl.appendChild(tile);
      });
    });
  },

  // ---- tools ----
  selectTool(name, el) {
    this.selectedTool = name;
    this.selectedInventoryType = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    el.classList.add('selected');
    this.renderInventory();
    this.playSound('select');
  },

  toggleInventory() {
    this.inventoryPanel.classList.toggle('hidden');
  },

  canBreak(tool, type) {
    const groups = {
      axe: ['tree', 'leaves', 'cactus'],
      pickaxe: ['rock', 'ore', 'ice'],
      shovel: ['dirt', 'sand', 'grass', 'snow'],
    };
    return groups[tool] && groups[tool].includes(type);
  },

  isEmpty(type) {
    return type === 'sky' || type === 'cave';
  },

  // ---- mining (hold to break) ----
  startMining(row, col, e) {
    const type = this.world[row][col];

    if (this.selectedInventoryType) {
      if (this.isEmpty(type)) this.placeFromInventory(row, col);
      return;
    }
    if (!this.selectedTool) return;

    if (!this.canBreak(this.selectedTool, type)) {
      if (!this.isEmpty(type)) this.wrongTool(row, col);
      return;
    }

    const index = row * this.COLS + col;
    const tileEl = this.worldEl.children[index];
    this.miningTile = { row, col, type, tileEl, e };
    this.miningProgress = 0;

    tileEl.classList.add('mining');
    this.playSound('select');

    const DURATION = 500;
    const STEP = 60;
    clearInterval(this.miningTimer);
    this.miningTimer = setInterval(() => {
      this.miningProgress += STEP / DURATION;
      const stage = Math.min(4, Math.ceil(this.miningProgress * 4));

      tileEl.classList.remove('crack-1','crack-2','crack-3','crack-4');
      if (stage >= 1) tileEl.classList.add('crack-' + stage);

      if (this.miningProgress >= 1) {
        clearInterval(this.miningTimer);
        this.finishMining();
      }
    }, STEP);
  },

  stopMining() {
    clearInterval(this.miningTimer);
    if (this.miningTile) {
      const { tileEl } = this.miningTile;
      tileEl.classList.remove('mining','crack-1','crack-2','crack-3','crack-4');
      this.miningTile = null;
    }
    this.miningProgress = 0;
  },

  finishMining() {
    const { row, col, type, e } = this.miningTile;
    this.miningTile = null;
    this.removeTile(row, col, type, e);
  },

  removeTile(row, col, type, e) {
    const index = row * this.COLS + col;
    const tileEl = this.worldEl.children[index];

    this.spawnParticles(e, type);
    this.screenShake();
    this.playSound('break');

    this.world[row][col] = this.revealType(row, col);

    this.addToInventory(type);
    tileEl.classList.add('breaking');
    setTimeout(() => { this.renderWorld(); this.renderInventory(); }, 90);
  },

  revealType(row, col) {
    const ground = this.heights[col];
    // within 2 blocks of the surface → open sky; deeper → cave
    return (row <= ground + 1) ? 'sky' : 'cave';
  },

  // ---- juice ----
  spawnParticles(e, type) {
    const colors = {
      grass:'#5fae35', dirt:'#7b5230', rock:'#8a8a8f', tree:'#5c3a1e',
      leaves:'#3f8f2e', sand:'#dbc78a', water:'#3a6fd0', ore:'#e8c14a',
      snow:'#f4f8ff', ice:'#aee0f0', cactus:'#3f8f3a',
    };
    const color = colors[type] || '#fff';
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = color;
      p.style.left = e.clientX + 'px';
      p.style.top = e.clientY + 'px';
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 120) + 'px');
      p.style.setProperty('--dy', ((Math.random() - 0.7) * 120) + 'px');
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
  },

  screenShake() {
    const s = document.getElementById('game-screen');
    s.classList.add('shaking');
    setTimeout(() => s.classList.remove('shaking'), 200);
  },

  playSound(kind) {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = this.audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);

    if (kind === 'break') { osc.type = 'square'; osc.frequency.value = 140; }
    else if (kind === 'place') { osc.type = 'square'; osc.frequency.value = 320; }
    else { osc.type = 'sine'; osc.frequency.value = 520; }

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  },

  // ---- inventory ----
  addToInventory(type) {
    this.inventory[type] = (this.inventory[type] || 0) + 1;
  },

  renderInventory() {
    this.inventoryEl.innerHTML = '';
    Object.keys(this.inventory).forEach(type => {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (type === this.selectedInventoryType) slot.classList.add('selected');

      const tile = document.createElement('div');
      tile.className = `tile tile-${type}`;

      const badge = document.createElement('span');
      badge.className = 'inv-badge';
      badge.textContent = this.inventory[type];

      slot.append(tile, badge);
      slot.addEventListener('click', () => this.selectInventoryItem(type));
      this.inventoryEl.appendChild(slot);
    });
  },

  selectInventoryItem(type) {
    this.selectedInventoryType = type;
    this.selectedTool = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    this.renderInventory();
  },

  placeFromInventory(row, col) {
    const type = this.selectedInventoryType;
    this.world[row][col] = type;
    this.inventory[type]--;
    this.playSound('place');
    if (this.inventory[type] <= 0) {
      delete this.inventory[type];
      this.selectedInventoryType = null;
    }
    this.renderWorld();
    this.renderInventory();
  },

  wrongTool(row, col) {
    const index = row * this.COLS + col;
    const tile = this.worldEl.children[index];
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 300);
  },

  // ---- reset ----
  resetWorld() {
    this.world = this.generateWorld(this.seed);
    this.inventory = {};
    this.selectedTool = null;
    this.selectedInventoryType = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    this.renderWorld();
    this.renderInventory();
  },

  // ---- biome switching ----
  switchBiome(btn) {
    this.biome = btn.dataset.biome;
    document.querySelectorAll('.biome-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    this.seed = Math.floor(Math.random() * 1e9);
    this.world = this.generateWorld(this.seed);   // ← this line builds the new world
    this.inventory = {};
    this.renderWorld();
    this.renderInventory();
  },
};

Game.init();