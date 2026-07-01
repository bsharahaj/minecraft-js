const Game = {
  // ---- STATE ----
  initialWorld: [
    ['grass','grass','tree','grass','tree','grass','grass','tree','grass','grass'],
    ['dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt'],
    ['dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt','dirt'],
    ['dirt','dirt','rock','dirt','dirt','dirt','rock','dirt','dirt','dirt'],
    ['rock','dirt','rock','rock','dirt','rock','rock','dirt','rock','rock'],
    ['rock','rock','rock','rock','rock','rock','rock','rock','rock','rock'],
    ['rock','rock','rock','rock','rock','rock','rock','rock','rock','rock'],
  ],

  world: [],
  selectedTool: null,
  selectedInventoryType: null,
  inventory: {},

  toolTileMap: {
    axe: 'tree',
    pickaxe: 'rock',
    shovel: 'dirt',
  },

  // ---- STARTUP ----
  init() {
    this.world = this.initialWorld.map(row => [...row]);

    this.worldEl = document.getElementById('world');
    this.inventoryEl = document.getElementById('inventory-items');

    document.querySelectorAll('.tool').forEach(toolEl => {
      toolEl.addEventListener('click', () => {
        this.selectTool(toolEl.dataset.tool, toolEl);
      });
    });

    document.getElementById('reset-btn')
      .addEventListener('click', () => this.resetWorld());

    this.renderWorld();
    this.renderInventory();
  },

  // ---- WORLD ----
  renderWorld() {
    this.worldEl.innerHTML = '';
    const cols = this.world[0].length;
    document.documentElement.style.setProperty('--world-cols', cols);

    this.world.forEach((row, r) => {
      row.forEach((type, c) => {
        const tile = document.createElement('div');
        tile.className = `tile tile-${type}`;
        tile.dataset.row = r;
        tile.dataset.col = c;
        tile.addEventListener('click', () => this.clickTile(r, c));
        this.worldEl.appendChild(tile);
      });
    });
  },

  // ---- TOOLS ----
  selectTool(toolName, toolEl) {
    this.selectedTool = toolName;
    this.selectedInventoryType = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    toolEl.classList.add('selected');
    this.renderInventory();
  },

  // ---- CLICKING A TILE ----
  clickTile(row, col) {
    const type = this.world[row][col];

    if (this.selectedInventoryType) {
      if (type === 'empty') this.placeFromInventory(row, col);
      return;
    }

    if (!this.selectedTool) return;

    const removable = this.toolTileMap[this.selectedTool];
    if (type === removable) {
      this.removeTile(row, col, type);
    } else {
      this.wrongTool(row, col);
    }
  },

  // ---- HELPERS ----
  removeTile(row, col, type) {
    this.world[row][col] = 'empty';
    this.addToInventory(type);
    this.renderWorld();
    this.renderInventory();
  },

  addToInventory(type) {
    this.inventory[type] = (this.inventory[type] || 0) + 1;
  },

  placeFromInventory(row, col) {
    const type = this.selectedInventoryType;
    this.world[row][col] = type;
    this.inventory[type]--;

    if (this.inventory[type] <= 0) {
      delete this.inventory[type];
      this.selectedInventoryType = null;
    }
    this.renderWorld();
    this.renderInventory();
  },

  wrongTool(row, col) {
    const index = row * this.world[0].length + col;
    const tile = this.worldEl.children[index];
    tile.classList.add('shake');
    setTimeout(() => tile.classList.remove('shake'), 300);
  },

  // ---- INVENTORY ----
  renderInventory() {
    this.inventoryEl.innerHTML = '';

    Object.keys(this.inventory).forEach(type => {
      const count = this.inventory[type];

      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      if (type === this.selectedInventoryType) slot.classList.add('selected');

      const tile = document.createElement('div');
      tile.className = `tile tile-${type}`;

      const badge = document.createElement('span');
      badge.className = 'inv-badge';
      badge.textContent = count;

      slot.appendChild(tile);
      slot.appendChild(badge);
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

  // ---- RESET ----
  resetWorld() {
    this.world = this.initialWorld.map(row => [...row]);
    this.inventory = {};
    this.selectedTool = null;
    this.selectedInventoryType = null;
    document.querySelectorAll('.tool').forEach(t => t.classList.remove('selected'));
    this.renderWorld();
    this.renderInventory();
  },
};

Game.init();