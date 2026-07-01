const Game = {
  COLS: 20,
  ROWS: 14,
  SKY_ROWS: 4,

  world: [],
  selectedTool: null,
  selectedInventoryType: null,
  inventory: {},
  seed: null,
  audioCtx: null,

  toolTileMap: { axe: 'tree', pickaxe: 'rock', shovel: 'dirt' },

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

  // ---- procedural generation ----
  generateWorld(seed) {
    const rng = this.makeRng(seed);
    const w = [];
    let surface = this.SKY_ROWS + 2;

    const heights = [];
    for (let c = 0; c < this.COLS; c++) {
      if (rng() < 0.3) surface += rng() < 0.5 ? -1 : 1;
      surface = Math.max(this.SKY_ROWS + 1, Math.min(surface, this.SKY_ROWS + 4));
      heights.push(surface);
    }

    for (let r = 0; r < this.ROWS; r++) {
      const row = [];
      for (let c = 0; c < this.COLS; c++) {
        const ground = heights[c];
        if (r < ground) row.push('sky');
        else if (r === ground) row.push('grass');
        else if (r <= ground + 2) row.push('dirt');
        else row.push(rng() < 0.08 ? 'ore' : 'rock');
      }
      w.push(row);
    }

    for (let c = 0; c < this.COLS; c++) {
      const ground = heights[c];
      if (w[ground] && w[ground][c] === 'grass' && rng() < 0.22) {
        const trunkTop = ground - 1;
        if (trunkTop > this.SKY_ROWS) {
          w[trunkTop][c] = 'tree';
          if (w[trunkTop - 1]) w[trunkTop - 1][c] = 'leaves';
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

    this.renderWorld();
    this.renderInventory();
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
        if (type !== 'sky') {
          tile.addEventListener('click', (e) => this.clickTile(r, c, e));
        }
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
      axe: ['tree', 'leaves'],
      pickaxe: ['rock', 'ore'],
      shovel: ['dirt', 'sand'],
    };
    return groups[tool] && groups[tool].includes(type);
  },

  // ---- clicking ----
  clickTile(row, col, e) {
    const type = this.world[row][col];

    if (this.selectedInventoryType) {
      if (type === 'empty') this.placeFromInventory(row, col);
      return;
    }
    if (!this.selectedTool) return;

    if (this.canBreak(this.selectedTool, type)) {
      this.removeTile(row, col, type, e);
    } else if (type !== 'empty' && type !== 'sky') {
      this.wrongTool(row, col);
    }
  },

  removeTile(row, col, type, e) {
    const index = row * this.COLS + col;
    const tileEl = this.worldEl.children[index];

    this.spawnParticles(e, type);
    this.screenShake();
    this.playSound('break');

    this.world[row][col] = 'empty';
    this.addToInventory(type);

    tileEl.classList.add('breaking');
    setTimeout(() => { this.renderWorld(); this.renderInventory(); }, 90);
  },

  // ---- juice ----
  spawnParticles(e, type) {
    const colors = {
      grass:'#5fae35', dirt:'#7b5230', rock:'#8a8a8f', tree:'#5c3a1e',
      leaves:'#3f8f2e', sand:'#dbc78a', water:'#3a6fd0', ore:'#e8c14a',
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
};

Game.init();