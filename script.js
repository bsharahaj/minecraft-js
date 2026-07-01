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

  // ---- procedural generation ----
  generateWorld(seed) {
    const rng = this.makeRng(seed);
    this.heights = [];
    let surface = this.SKY_ROWS + 3;

    for (let c = 0; c < this.COLS; c++) {
      if (rng() < 0.18) surface += rng() < 0.5 ? -1 : 1;
      surface = Math.max(this.SKY_ROWS + 2, Math.min(surface, this.SKY_ROWS + 4));
      this.heights.push(surface);
    }

    const w = [];
    for (let r = 0; r < this.ROWS; r++) {
      const row = [];
      for (let c = 0; c < this.COLS; c++) {
        const g = this.heights[c];
        if (r < g) row.push('sky');
        else if (r === g) row.push('grass');
        else if (r <= g + 2) row.push('dirt');
        else row.push(rng() < 0.10 ? 'ore' : 'rock');
      }
      w.push(row);
    }

    // trees: 2-block trunk + a 3x2 leafy canopy on top
    let lastTree = -4;
    for (let c = 1; c < this.COLS - 1; c++) {
      const g = this.heights[c];
      if (w[g][c] === 'grass' && c - lastTree >= 3 && rng() < 0.4) {
        const trunkTop = g - 2, canopyMid = g - 3, canopyTop = g - 4;
        if (canopyTop >= this.SKY_ROWS) {
          w[g - 1][c] = 'tree';
          w[trunkTop][c] = 'tree';
          for (const dc of [-1, 0, 1]) if (w[canopyMid][c + dc] === 'sky') w[canopyMid][c + dc] = 'leaves';
          for (const dc of [-1, 0, 1]) if (w[canopyTop][c + dc] === 'sky') w[canopyTop][c + dc] = 'leaves';
          lastTree = c;
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

        // DEPTH LIGHTING: how far below this column's surface is this tile?
        const ground = this.heights[c];
        const depth = r - ground;                 // 0 at surface, grows downward
        if (depth > 0 && type !== 'sky') {
          // darken gradually, capped so deep blocks aren't pitch black
          const dark = Math.min(depth * 0.06, 0.55);
          tile.style.setProperty('--shade', dark);
        } else {
          tile.style.setProperty('--shade', 0);
        }

        tile.addEventListener('click', (e) => this.clickTile(r, c, e));
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
      shovel: ['dirt', 'sand', 'grass'],
    };
    return groups[tool] && groups[tool].includes(type);
  },

  isEmpty(type) {
    return type === 'sky' || type === 'cave';
  },

  // ---- clicking ----
  clickTile(row, col, e) {
    const type = this.world[row][col];

    // placing from inventory onto an empty spot (sky or cave)
    if (this.selectedInventoryType) {
      if (this.isEmpty(type)) this.placeFromInventory(row, col);
      return;
    }
    if (!this.selectedTool) return;

    if (this.canBreak(this.selectedTool, type)) {
      this.removeTile(row, col, type, e);
    } else if (!this.isEmpty(type)) {
      this.wrongTool(row, col);
    }
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

  // sky if open to air above, cave if enclosed under solid ground
  revealType(row, col) {
    const SOLID = ['grass','dirt','rock','ore','sand','tree','leaves'];
    for (let r = row - 1; r >= 0; r--) {
      if (SOLID.includes(this.world[r][col])) return 'cave';
    }
    return 'sky';
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