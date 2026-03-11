// ============================================================
// POSEIDON — WORLD SCENE
// Main exploration scene — isometric floating-island world.
// Steelpine — Rise of the Steel Tribes
// ============================================================

import Phaser from 'phaser';
import { IsometricEngine } from '../world/IsometricEngine.js';
import { WorldMap }        from '../world/WorldMap.js';
import {
  TILE_W, TILE_H, TILE_DEPTH,
  GAME_WIDTH, GAME_HEIGHT,
} from '../GameConfig.js';
import { BIOMES } from '../data/GameData.js';

// ─── CONSTANTS ───────────────────────────────────────────────────
const MAP_COLS          = 24;
const MAP_ROWS          = 24;
const PLAYER_SPEED      = 3.2;       // tiles per second (fractional grid units)
const ENEMY_AGGRO_DIST  = 120;       // px — enemy starts chasing player
const ENEMY_COMBAT_DIST = 80;        // px — auto-enter combat
const ENEMY_PATROL_SPEED = 1.5;      // tiles per second
const ENEMY_CHASE_SPEED  = 2.5;
const CAMERA_LERP       = 0.1;
const JOYSTICK_RADIUS   = 55;        // px — virtual joystick knob max travel
const DAY_CYCLE_DURATION = 120000;   // ms — full day cycle
const ATMOSPHERE_ALPHA_MIN = 0;
const ATMOSPHERE_ALPHA_MAX = 0.35;

// Palette (matches GameConfig)
const PAL = {
  red:    0xC4614A,
  green:  0x5B8C5A,
  blue:   0x6B7FA3,
  brown:  0x8B7355,
  cream:  0xEDE4D3,
  ink:    0x1A1008,
};

// ─────────────────────────────────────────────────────────────────
export class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' });
  }

  // ─── LIFECYCLE ───────────────────────────────────────────────────

  /**
   * Receives data from the calling scene (character select / portal).
   * @param {{ biomeId?: string, characterId?: string }} data
   */
  init(data) {
    this.biomeId      = data?.biomeId      || 'forest';
    this.characterId  = data?.characterId  || 'vormund';
    this.biomeData    = BIOMES[this.biomeId] || BIOMES.forest;

    // Engine references reset
    this.iso      = null;
    this.worldMap = null;

    // Tile image pool [row][col] → Phaser.GameObjects.Image
    this.tileObjects = [];

    // Entity lists
    this.playerObj   = null;   // Phaser container
    this.playerCell  = { col: 0, row: 0 };   // current grid position (float)
    this.playerExact = { col: 0, row: 0 };   // sub-tile position for smooth movement

    this.enemies     = [];   // Array of enemy state objects
    this.npcs        = [];   // Array of NPC objects
    this.decorations = [];   // Decoration sprites

    // Input state
    this.cursors       = null;
    this.wasd          = null;
    this.joystickActive = false;
    this.joystickStart  = { x: 0, y: 0 };
    this.joystickVec    = { x: 0, y: 0 };
    this.joystickBase   = null;
    this.joystickKnob   = null;

    // Systems
    this.portalCooldown  = 0;
    this.atmosphereRect  = null;
    this.particleEmitters = [];
    this.isTransitioning  = false;

    // HUD event reference (sent to UIScene)
    this._lastHudTime = 0;
  }

  create() {
    // ── 1. Isometric engine ──────────────────────────────────────
    this.iso = new IsometricEngine(TILE_W, TILE_H, TILE_DEPTH);

    // Map origin: centre the iso grid on screen
    // For a 24×24 grid the top tile is at (0,0), rightmost at (23,0),
    // bottommost at (0,23). We centre on the screen horizontally.
    const mapOriginX = GAME_WIDTH  / 2;
    const mapOriginY = TILE_H * 2;
    this.iso.setOffset(mapOriginX, mapOriginY);

    // ── 2. World map ─────────────────────────────────────────────
    this.worldMap = new WorldMap(this.biomeId, this.iso);
    this.worldMap.generate(MAP_COLS, MAP_ROWS, this.biomeData.islandCount || 5);

    // ── 3. Render world ──────────────────────────────────────────
    this.buildMap();
    this.placeDecorations();

    // ── 4. Entities ──────────────────────────────────────────────
    this.spawnPlayer();
    this.spawnNPCs();
    this.spawnEnemies();

    // ── 5. Camera ────────────────────────────────────────────────
    this.setupCamera();

    // ── 6. Input ─────────────────────────────────────────────────
    this.setupInput();

    // ── 7. Atmosphere & FX ───────────────────────────────────────
    this.createAmbientParticles();
    this._createAtmosphereLayer();

    // ── 8. Start scene music ─────────────────────────────────────
    if (this.sound.get(this.biomeData.music)) {
      this.sound.play(this.biomeData.music, { loop: true, volume: 0.5 });
    }

    // ── 9. Notify UIScene ────────────────────────────────────────
    if (!this.scene.isActive('UIScene')) {
      this.scene.launch('UIScene', { biomeId: this.biomeId, characterId: this.characterId });
    }
    this.emitHUDUpdate();

    // Register scene shutdown cleanup
    this.events.on('shutdown', this._onShutdown, this);
  }

  update(time, delta) {
    if (this.isTransitioning) return;

    const dt = delta / 1000; // seconds

    // ── Player movement ──────────────────────────────────────────
    this._handlePlayerInput(dt);

    // ── Enemy AI ─────────────────────────────────────────────────
    for (const enemy of this.enemies) {
      this.updateEnemyAI(enemy, delta);
    }

    // ── Portal check ─────────────────────────────────────────────
    this.portalCooldown -= delta;
    if (this.portalCooldown <= 0) {
      this.checkPortalInteraction();
    }

    // ── Depth sort all movable objects ───────────────────────────
    this.updateDepthSort();

    // ── Atmosphere ───────────────────────────────────────────────
    this.updateAtmosphere(time);

    // ── HUD throttle ─────────────────────────────────────────────
    if (time - this._lastHudTime > 500) {
      this.emitHUDUpdate();
      this._lastHudTime = time;
    }
  }

  // ─── MAP RENDERING ───────────────────────────────────────────────

  /**
   * Render all tiles as Phaser GameObjects, drawn bottom-to-top for
   * correct isometric painter's algorithm depth order.
   */
  buildMap() {
    this.tileObjects = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(null));

    // Iterate in isometric paint order: top (0,0) → bottom-right (maxCol+maxRow)
    for (let sum = 0; sum < MAP_COLS + MAP_ROWS - 1; sum++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const row = sum - col;
        if (row < 0 || row >= MAP_ROWS) continue;

        const cell = this.worldMap.getTile(col, row);
        if (!cell) continue;

        this.renderTile(col, row, cell.height, cell.type);
      }
    }
  }

  /**
   * Place a single isometric tile at grid position (col, row).
   * Renders the top face using a pre-loaded texture, and optionally
   * stacks side-wall images for elevated tiles.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} height   Elevation (0-3)
   * @param {string} type     'ground'|'bridge'|'ledge'|'portal'
   */
  renderTile(col, row, height, type) {
    const screen = this.iso.gridToScreen(col, row, height);
    const depth  = this.iso.getDepth(col, row, height);

    // Top face texture: try biome-specific, fall back to generic
    const topKey = this._tileTextureKey('top', type);
    const img    = this._createTileImage(topKey, screen.x, screen.y, depth);
    this.tileObjects[row][col] = img;

    // Side walls for elevated tiles
    if (height > 0) {
      const sideKey    = this._tileTextureKey('side', type);
      const sideScreen = this.iso.gridToScreen(col, row, 0);

      // Draw one side wall per elevation step
      for (let h = 0; h < height; h++) {
        const wallY    = sideScreen.y + TILE_H / 2 - (h + 1) * TILE_DEPTH + TILE_H;
        const wallDepth = depth - 0.5;
        this._createTileImage(sideKey, sideScreen.x, wallY, wallDepth);
      }
    }
  }

  // ─── DECORATIONS ─────────────────────────────────────────────────

  /** Place all decoration sprites from the WorldMap's decoration data. */
  placeDecorations() {
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const deco = this.worldMap.getDecorationAt(col, row);
        if (!deco) continue;

        const cell   = this.worldMap.getTile(col, row);
        const height = cell ? cell.height : 0;
        const screen = this.iso.gridToScreen(col, row, height);
        const depth  = this.iso.getDepth(col, row, height) + 1;

        const key = this.textures.exists(deco.sprite) ? deco.sprite : 'deco_placeholder';
        const img = this.add.image(screen.x, screen.y - TILE_H * 0.5, key)
          .setOrigin(0.5, 1)
          .setDepth(depth);

        // Store grid position on the object for depth sorting
        img._col = col;
        img._row = row;

        this.decorations.push(img);
      }
    }
  }

  // ─── PLAYER ──────────────────────────────────────────────────────

  /** Create the player sprite at the first spawn point. */
  spawnPlayer() {
    const spawns = this.worldMap.getSpawnPoints();
    const spawn  = spawns.find(s => s.role === 'player') || { col: 2, row: 2 };

    this.playerCell  = { col: spawn.col, row: spawn.row };
    this.playerExact = { col: spawn.col, row: spawn.row };

    const screen = this.iso.gridToScreen(spawn.col, spawn.row, 0);

    // Shadow
    const shadow = this.add.ellipse(0, TILE_H * 0.3, TILE_W * 0.7, TILE_H * 0.5, 0x000000, 0.3)
      .setOrigin(0.5, 0.5);

    // Player body — use texture if available, else create a styled placeholder
    const bodyKey = `char_${this.characterId}`;
    let body;
    if (this.textures.exists(bodyKey)) {
      body = this.add.image(0, 0, bodyKey).setOrigin(0.5, 1);
    } else {
      body = this._createPlayerPlaceholder();
    }

    // Container groups body + shadow
    this.playerObj = this.add.container(screen.x, screen.y, [shadow, body]);
    this.playerObj.setDepth(this.iso.getDepth(spawn.col, spawn.row) + 5);

    // Expose grid position on container for depth sorting
    this.playerObj._col = spawn.col;
    this.playerObj._row = spawn.row;
  }

  /**
   * Move the player in isometric grid direction by (dx, dy) fractional cells.
   *
   * @param {number} dx   Fractional column delta this frame
   * @param {number} dy   Fractional row delta this frame
   */
  movePlayer(dx, dy) {
    const newCol = this.playerExact.col + dx;
    const newRow = this.playerExact.row + dy;

    // Integer cell for tile lookup
    const iCol = Math.round(newCol);
    const iRow = Math.round(newRow);

    // Only move if target cell is walkable
    const tile = this.worldMap.getTile(iCol, iRow);
    if (!tile || !tile.walkable) return;

    this.playerExact.col = newCol;
    this.playerExact.row = newRow;

    // Snap cell reference (for depth / portal tests)
    this.playerCell.col = iCol;
    this.playerCell.row = iRow;

    // Update screen position
    const height = tile.height || 0;
    const screen = this.iso.gridToScreen(newCol, newRow, height);
    this.playerObj.setPosition(screen.x, screen.y);
    this.playerObj._col = newCol;
    this.playerObj._row = newRow;
  }

  // ─── NPCs ─────────────────────────────────────────────────────────

  /** Spawn friendly NPCs at NPC spawn points. */
  spawnNPCs() {
    const spawns = this.worldMap.getSpawnPoints().filter(s => s.role === 'npc');

    for (const spawn of spawns) {
      const screen = this.iso.gridToScreen(spawn.col, spawn.row, 0);
      const npcKey = 'npc_friendly';

      let img;
      if (this.textures.exists(npcKey)) {
        img = this.add.image(screen.x, screen.y, npcKey).setOrigin(0.5, 1);
      } else {
        img = this._createNPCPlaceholder(screen.x, screen.y, PAL.blue);
      }

      img.setDepth(this.iso.getDepth(spawn.col, spawn.row) + 2);
      img._col = spawn.col;
      img._row = spawn.row;

      this.npcs.push({
        obj:  img,
        col:  spawn.col,
        row:  spawn.row,
        type: 'friendly',
      });
    }
  }

  // ─── ENEMIES ──────────────────────────────────────────────────────

  /** Spawn enemies at enemy spawn points. */
  spawnEnemies() {
    const spawns  = this.worldMap.getSpawnPoints().filter(s => s.role === 'enemy');
    const enemyIds = this.biomeData.enemies || ['rust_crawler'];

    spawns.forEach((spawn, idx) => {
      const enemyId = enemyIds[idx % enemyIds.length];
      this._spawnEnemy(enemyId, spawn.col, spawn.row);
    });
  }

  /**
   * Spawn a single enemy instance.
   * @param {string} enemyId
   * @param {number} col
   * @param {number} row
   */
  _spawnEnemy(enemyId, col, row) {
    const screen = this.iso.gridToScreen(col, row, 0);
    const texKey = `enemy_${enemyId}`;

    let obj;
    if (this.textures.exists(texKey)) {
      obj = this.add.image(screen.x, screen.y, texKey).setOrigin(0.5, 1);
    } else {
      obj = this._createEnemyPlaceholder(screen.x, screen.y, PAL.red);
    }

    obj.setDepth(this.iso.getDepth(col, row) + 3);
    obj._col = col;
    obj._row = row;

    // Build 2-3 patrol waypoints near the spawn
    const waypoints = this._generatePatrolWaypoints(col, row, 3, 4);

    const enemy = {
      obj,
      id:           enemyId,
      col:          col,
      row:          row,
      exactCol:     col,
      exactRow:     row,
      hp:           60,
      maxHp:        60,
      state:        'patrol',   // 'patrol' | 'chase' | 'idle'
      waypoints,
      waypointIdx:  0,
      waitTimer:    0,
      moveTimer:    0,
      path:         [],
      pathStep:     0,
      aggro:        false,
    };

    this.enemies.push(enemy);
  }

  // ─── CAMERA ───────────────────────────────────────────────────────

  /** Set up a smooth-following camera bounded to the map. */
  setupCamera() {
    const cam = this.cameras.main;

    // Determine map screen bounds
    const topLeft     = this.iso.gridToScreen(0, 0, 0);
    const bottomRight = this.iso.gridToScreen(MAP_COLS - 1, MAP_ROWS - 1, 0);

    const mapScreenW  = bottomRight.x - topLeft.x + TILE_W;
    const mapScreenH  = bottomRight.y - topLeft.y + TILE_H + TILE_DEPTH * 3;

    // Enlarge world bounds to include the full isometric range
    const worldLeft   = topLeft.x - TILE_W / 2;
    const worldTop    = topLeft.y - TILE_H;
    const worldWidth  = Math.max(mapScreenW + TILE_W * 2, GAME_WIDTH);
    const worldHeight = Math.max(mapScreenH + TILE_H * 4, GAME_HEIGHT);

    cam.setBounds(worldLeft, worldTop, worldWidth, worldHeight);
    cam.setLerp(CAMERA_LERP, CAMERA_LERP);
    cam.startFollow(this.playerObj, true);
  }

  // ─── INPUT ────────────────────────────────────────────────────────

  /** Register keyboard and touch controls. */
  setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd    = this.input.keyboard.addKeys({
      up:    Phaser.Input.Keyboard.KeyCodes.W,
      down:  Phaser.Input.Keyboard.KeyCodes.S,
      left:  Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });

    // Virtual joystick for touch / mobile
    this.createVirtualJoystick();
  }

  /**
   * Handle player input and call movePlayer each frame.
   * @param {number} dt  Delta time in seconds
   * @private
   */
  _handlePlayerInput(dt) {
    let rawDx = 0;
    let rawDy = 0;

    // Keyboard
    if (this.cursors.left.isDown  || this.wasd.left.isDown)  rawDx -= 1;
    if (this.cursors.right.isDown || this.wasd.right.isDown) rawDx += 1;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    rawDy -= 1;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  rawDy += 1;

    // Virtual joystick overrides / combines
    if (this.joystickActive) {
      rawDx += this.joystickVec.x;
      rawDy += this.joystickVec.y;
    }

    if (rawDx === 0 && rawDy === 0) return;

    // Convert world direction to isometric grid direction
    const iso = this.iso.worldDirToIso(rawDx, rawDy);
    const speed = PLAYER_SPEED * dt;

    // iso returns {col, row} deltas — treat as (dx, dy) for movePlayer
    this.movePlayer(iso.col * speed, iso.row * speed);
  }

  // ─── VIRTUAL JOYSTICK ────────────────────────────────────────────

  /**
   * Create a touch-based virtual joystick on the left half of the screen.
   * Right half is reserved for action buttons (handled by UIScene).
   */
  createVirtualJoystick() {
    const cam = this.cameras.main;

    // Joystick visuals — fixed to camera (setScrollFactor(0))
    this.joystickBase = this.add.circle(80, GAME_HEIGHT - 120, JOYSTICK_RADIUS + 10, 0xffffff, 0.08)
      .setScrollFactor(0)
      .setDepth(9000);

    this.joystickKnob = this.add.circle(80, GAME_HEIGHT - 120, 22, 0xffffff, 0.35)
      .setScrollFactor(0)
      .setDepth(9001);

    // Pointer events for joystick zone (left half)
    this.input.on('pointerdown', (pointer) => {
      if (pointer.x < GAME_WIDTH / 2) {
        this.joystickActive = true;
        this.joystickStart  = { x: pointer.x, y: pointer.y };

        // Reposition base to touch point
        this.joystickBase.setPosition(pointer.x, pointer.y);
        this.joystickKnob.setPosition(pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.joystickActive || !pointer.isDown) return;
      if (pointer.x >= GAME_WIDTH / 2) return;

      const dx   = pointer.x - this.joystickStart.x;
      const dy   = pointer.y - this.joystickStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamp = Math.min(dist, JOYSTICK_RADIUS);

      const normX = dist > 0 ? (dx / dist) * clamp : 0;
      const normY = dist > 0 ? (dy / dist) * clamp : 0;

      this.joystickKnob.setPosition(
        this.joystickStart.x + normX,
        this.joystickStart.y + normY
      );

      // Normalise to -1…+1
      this.joystickVec.x = dist > 5 ? dx / dist : 0;
      this.joystickVec.y = dist > 5 ? dy / dist : 0;
    });

    this.input.on('pointerup', (pointer) => {
      this.joystickActive = false;
      this.joystickVec    = { x: 0, y: 0 };
      this.joystickKnob.setPosition(this.joystickBase.x, this.joystickBase.y);
    });
  }

  // ─── DEPTH SORT ──────────────────────────────────────────────────

  /**
   * Re-apply setDepth() to all movable game objects each frame
   * so they always sort correctly in the isometric scene.
   */
  updateDepthSort() {
    // Player
    if (this.playerObj) {
      const d = this.iso.getDepth(this.playerObj._col, this.playerObj._row, 0) + 5;
      this.playerObj.setDepth(d);
    }

    // Enemies
    for (const enemy of this.enemies) {
      const d = this.iso.getDepth(enemy.obj._col, enemy.obj._row, 0) + 3;
      enemy.obj.setDepth(d);
    }

    // NPCs
    for (const npc of this.npcs) {
      const d = this.iso.getDepth(npc.obj._col, npc.obj._row, 0) + 2;
      npc.obj.setDepth(d);
    }
  }

  // ─── PORTAL ──────────────────────────────────────────────────────

  /**
   * Check if player is standing on a portal tile.
   * If so, trigger biome transition.
   */
  checkPortalInteraction() {
    const portals = this.worldMap.getPortalPositions();
    for (const portal of portals) {
      const dc = Math.abs(this.playerCell.col - portal.col);
      const dr = Math.abs(this.playerCell.row - portal.row);
      if (dc <= 1 && dr <= 1) {
        const nextBiome = this.biomeData.portal?.to || 'forest';
        this._triggerPortalTransition(nextBiome);
        return;
      }
    }
  }

  /**
   * Cross-fade and restart scene with the next biome.
   * @param {string} nextBiomeId
   * @private
   */
  _triggerPortalTransition(nextBiomeId) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.portalCooldown  = 3000;

    this.cameras.main.fade(600, 0, 0, 0, false, (_cam, progress) => {
      if (progress >= 1) {
        this.scene.restart({ biomeId: nextBiomeId, characterId: this.characterId });
      }
    });
  }

  // ─── ENEMY AI ────────────────────────────────────────────────────

  /**
   * Simple patrol / aggro / chase AI for a single enemy.
   *
   * States:
   *   patrol → walk between waypoints, switch to chase on aggro
   *   chase  → compute A* path to player, follow it
   *   idle   → wait at waypoint for a moment before patrolling again
   *
   * @param {object} enemy  Enemy state object
   * @param {number} delta  Frame delta in ms
   */
  updateEnemyAI(enemy, delta) {
    if (!this.playerObj) return;

    const dt = delta / 1000;

    // Compute screen-space distance to player
    const eScreen = this.iso.gridToScreen(enemy.exactCol, enemy.exactRow, 0);
    const pScreen = this.iso.gridToScreen(this.playerExact.col, this.playerExact.row, 0);
    const distToPlayer = Phaser.Math.Distance.Between(
      eScreen.x, eScreen.y, pScreen.x, pScreen.y
    );

    // ── Combat entry ────────────────────────────────────────────
    if (distToPlayer < ENEMY_COMBAT_DIST) {
      this.enterCombat({ enemyId: enemy.id, col: enemy.col, row: enemy.row });
      return;
    }

    // ── Aggro check ─────────────────────────────────────────────
    if (distToPlayer < ENEMY_AGGRO_DIST) {
      enemy.state = 'chase';
    } else if (enemy.state === 'chase') {
      // Lost sight
      enemy.state = 'patrol';
      enemy.path  = [];
    }

    // ── State machine ───────────────────────────────────────────
    switch (enemy.state) {
      case 'chase':
        this._enemyChase(enemy, dt);
        break;

      case 'idle':
        enemy.waitTimer -= delta;
        if (enemy.waitTimer <= 0) {
          enemy.waypointIdx = (enemy.waypointIdx + 1) % enemy.waypoints.length;
          enemy.state       = 'patrol';
          enemy.path        = [];
        }
        break;

      case 'patrol':
      default:
        this._enemyPatrol(enemy, dt);
        break;
    }

    // Update depth
    enemy.obj._col = enemy.exactCol;
    enemy.obj._row = enemy.exactRow;
  }

  /**
   * Move enemy along its patrol waypoints via A*.
   * @private
   */
  _enemyPatrol(enemy, dt) {
    if (enemy.waypoints.length === 0) return;

    const target = enemy.waypoints[enemy.waypointIdx];

    // Compute new path if we don't have one
    if (enemy.path.length === 0) {
      enemy.path     = this.iso.findPath(
        { col: Math.round(enemy.exactCol), row: Math.round(enemy.exactRow) },
        target,
        this.worldMap.grid
      );
      enemy.pathStep = 0;
    }

    // Follow path
    if (enemy.pathStep < enemy.path.length) {
      this._enemyStepAlongPath(enemy, ENEMY_PATROL_SPEED, dt);
    } else {
      // Reached waypoint — wait briefly
      enemy.path      = [];
      enemy.state     = 'idle';
      enemy.waitTimer = 800 + Math.random() * 1200;
    }
  }

  /**
   * Move enemy toward player using A*.
   * @private
   */
  _enemyChase(enemy, dt) {
    // Recompute path every 30 frames (or when path is empty)
    enemy.moveTimer += dt * 1000;
    if (enemy.path.length === 0 || enemy.moveTimer > 500) {
      enemy.moveTimer = 0;
      enemy.path      = this.iso.findPath(
        { col: Math.round(enemy.exactCol), row: Math.round(enemy.exactRow) },
        { col: this.playerCell.col,        row: this.playerCell.row        },
        this.worldMap.grid
      );
      enemy.pathStep = 0;
    }

    this._enemyStepAlongPath(enemy, ENEMY_CHASE_SPEED, dt);
  }

  /**
   * Move an enemy one step along its pre-computed path.
   * @private
   */
  _enemyStepAlongPath(enemy, speed, dt) {
    if (enemy.pathStep >= enemy.path.length) return;

    const step      = enemy.path[enemy.pathStep];
    const targetCol = step.col;
    const targetRow = step.row;

    const dc   = targetCol - enemy.exactCol;
    const dr   = targetRow - enemy.exactRow;
    const dist = Math.sqrt(dc * dc + dr * dr);

    if (dist < speed * dt + 0.05) {
      // Snap to step
      enemy.exactCol = targetCol;
      enemy.exactRow = targetRow;
      enemy.col      = targetCol;
      enemy.row      = targetRow;
      enemy.pathStep++;
    } else {
      enemy.exactCol += (dc / dist) * speed * dt;
      enemy.exactRow += (dr / dist) * speed * dt;
    }

    // Update screen position
    const screen = this.iso.gridToScreen(enemy.exactCol, enemy.exactRow, 0);
    enemy.obj.setPosition(screen.x, screen.y);
  }

  /**
   * Generate 2-3 patrol waypoints near a spawn position.
   * @private
   */
  _generatePatrolWaypoints(col, row, count, radius) {
    const waypoints = [{ col, row }];
    const walkable  = this.worldMap.getWalkablePositions();
    if (walkable.length === 0) return waypoints;

    for (let i = 0; i < count - 1; i++) {
      // Try up to 20 times to find a nearby walkable cell
      for (let attempt = 0; attempt < 20; attempt++) {
        const dc = Math.round((Math.random() * 2 - 1) * radius);
        const dr = Math.round((Math.random() * 2 - 1) * radius);
        const tc = col + dc;
        const tr = row + dr;
        const tile = this.worldMap.getTile(tc, tr);
        if (tile && tile.walkable) {
          waypoints.push({ col: tc, row: tr });
          break;
        }
      }
    }

    return waypoints;
  }

  // ─── COMBAT TRANSITION ───────────────────────────────────────────

  /**
   * Transition into the CombatScene with the given enemy data.
   * Fades out the WorldScene before launching CombatScene.
   *
   * @param {{ enemyId: string, col: number, row: number }} enemyData
   */
  enterCombat(enemyData) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    this.cameras.main.fade(400, 0, 0, 0, false, (_cam, progress) => {
      if (progress >= 1) {
        this.scene.launch('CombatScene', {
          enemyId:     enemyData.enemyId,
          biomeId:     this.biomeId,
          characterId: this.characterId,
        });
        this.scene.pause();
        this.isTransitioning = false;
      }
    });
  }

  // ─── PLAYER DEATH ────────────────────────────────────────────────

  /** Called when the player's HP reaches 0. */
  onPlayerDeath() {
    this.isTransitioning = true;

    // Flash red, then return to main menu
    this.cameras.main.flash(300, 200, 0, 0);
    this.time.delayedCall(800, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (_cam, progress) => {
        if (progress >= 1) {
          this.sound.stopAll();
          this.scene.start('MainMenuScene');
        }
      });
    });
  }

  // ─── ATMOSPHERE ──────────────────────────────────────────────────

  /**
   * Day/night cycle: slowly modulate an overlay rectangle.
   *
   * @param {number} time  Scene time in ms
   */
  updateAtmosphere(time) {
    if (!this.atmosphereRect) return;

    const phase  = (time % DAY_CYCLE_DURATION) / DAY_CYCLE_DURATION; // 0-1
    // Night is around phase=0.5, day at 0 and 1
    const night  = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // 0=day 1=night
    const alpha  = Phaser.Math.Linear(
      ATMOSPHERE_ALPHA_MIN,
      ATMOSPHERE_ALPHA_MAX,
      night
    );

    this.atmosphereRect.setAlpha(alpha);
  }

  /** Create the atmosphere overlay used for the day/night cycle. */
  _createAtmosphereLayer() {
    this.atmosphereRect = this.add.rectangle(
      GAME_WIDTH / 2, GAME_HEIGHT / 2,
      GAME_WIDTH * 4, GAME_HEIGHT * 4,
      0x000030, 0
    )
      .setScrollFactor(0)
      .setDepth(8000);
  }

  // ─── AMBIENT PARTICLES ───────────────────────────────────────────

  /**
   * Create biome-specific ambient particle effects.
   * Forest=leaves, Volcanic=embers, Cyber=data-stream, Ruins=dust.
   */
  createAmbientParticles() {
    const configs = {
      forest: {
        key:          'particle_leaf',
        fallback:     0x5B8C5A,
        count:        20,
        speedY:       { min: 20, max: 60 },
        speedX:       { min: -15, max: 15 },
        alpha:        { start: 0.7, end: 0 },
        scale:        { start: 0.3, end: 0.1 },
        lifespan:     4000,
        frequency:    400,
        rotate:       { min: 0, max: 360 },
      },
      volcanic: {
        key:          'particle_ember',
        fallback:     0xE87840,
        count:        30,
        speedY:       { min: -80, max: -20 },
        speedX:       { min: -30, max: 30 },
        alpha:        { start: 0.9, end: 0 },
        scale:        { start: 0.15, end: 0.03 },
        lifespan:     2500,
        frequency:    150,
        gravityY:     30,
      },
      cyber: {
        key:          'particle_data',
        fallback:     0x6B7FA3,
        count:        25,
        speedY:       { min: -50, max: 50 },
        speedX:       { min: 30,  max: 80 },
        alpha:        { start: 0.6, end: 0 },
        scale:        { start: 0.2, end: 0.05 },
        lifespan:     3000,
        frequency:    200,
      },
      ruins: {
        key:          'particle_dust',
        fallback:     0xEDE4D3,
        count:        15,
        speedY:       { min: -20, max: -5 },
        speedX:       { min: -10, max: 10 },
        alpha:        { start: 0.4, end: 0 },
        scale:        { start: 0.2, end: 0.4 },
        lifespan:     5000,
        frequency:    600,
      },
    };

    const cfg = configs[this.biomeId] || configs.forest;

    // Use a tiny generated texture if the real particle texture isn't loaded
    const particleKey = this.textures.exists(cfg.key)
      ? cfg.key
      : this._createParticleTexture(cfg.fallback);

    try {
      const emitter = this.add.particles(
        GAME_WIDTH / 2, GAME_HEIGHT / 2,
        particleKey,
        {
          x:         { min: -GAME_WIDTH  * 1.5, max: GAME_WIDTH  * 1.5 },
          y:         { min: -GAME_HEIGHT * 1.5, max: GAME_HEIGHT * 1.5 },
          speedX:    cfg.speedX,
          speedY:    cfg.speedY,
          alpha:     cfg.alpha,
          scale:     cfg.scale,
          lifespan:  cfg.lifespan,
          frequency: cfg.frequency,
          gravityY:  cfg.gravityY || 0,
          rotate:    cfg.rotate   || { min: 0, max: 0 },
          quantity:  1,
        }
      );

      emitter.setScrollFactor(0.2); // slight parallax on particles
      emitter.setDepth(7000);
      this.particleEmitters.push(emitter);
    } catch (e) {
      // Particles are purely aesthetic; silently ignore if unavailable
    }
  }

  // ─── HUD EVENTS ──────────────────────────────────────────────────

  /**
   * Broadcast current player state to the UIScene via scene events.
   * UIScene listens for 'hud-update' and refreshes bars/minimap.
   */
  emitHUDUpdate() {
    this.events.emit('hud-update', {
      biomeId:  this.biomeId,
      biomeName: this.biomeData.name,
      col:      Math.round(this.playerExact.col),
      row:      Math.round(this.playerExact.row),
    });

    // Also communicate cross-scene via the global event emitter
    this.game.events.emit('world-hud-update', {
      biomeId:  this.biomeId,
      biomeName: this.biomeData.name,
    });
  }

  // ─── CLEANUP ─────────────────────────────────────────────────────

  _onShutdown() {
    this.sound.stopAll();
    this.particleEmitters.forEach(e => e.destroy());
    this.particleEmitters = [];
    this.enemies    = [];
    this.npcs       = [];
    this.decorations = [];
    this.tileObjects = [];
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────

  /**
   * Return the texture key for a tile face, falling back gracefully.
   * @param {'top'|'side'} face
   * @param {string}        type  tile type
   * @returns {string}
   * @private
   */
  _tileTextureKey(face, type) {
    const candidates = [
      `tile_${this.biomeId}_${type}_${face}`,
      `tile_${this.biomeId}_${face}`,
      `tile_ground_${face}`,
      `tile_${face}`,
    ];
    for (const key of candidates) {
      if (this.textures.exists(key)) return key;
    }
    // Generate a placeholder tile if nothing is loaded
    return this._ensurePlaceholderTile(face, type);
  }

  /**
   * Add an image at (x, y) with correct depth.
   * @private
   */
  _createTileImage(textureKey, x, y, depth) {
    return this.add.image(x, y, textureKey)
      .setOrigin(0.5, 0)
      .setDepth(depth);
  }

  /**
   * Ensure a placeholder tile texture exists and return its key.
   * @private
   */
  _ensurePlaceholderTile(face, type) {
    const key = `__placeholder_tile_${face}_${type}`;
    if (this.textures.exists(key)) return key;

    const g = this.add.graphics();

    if (face === 'top') {
      // Diamond top face
      const colors = {
        ground: { fill: PAL.green,  stroke: PAL.ink   },
        bridge: { fill: PAL.brown,  stroke: PAL.ink   },
        ledge:  { fill: PAL.brown,  stroke: PAL.red   },
        portal: { fill: PAL.blue,   stroke: PAL.cream },
      };
      const c = colors[type] || colors.ground;

      g.fillStyle(c.fill, 1);
      g.beginPath();
      g.moveTo(TILE_W / 2, 0);
      g.lineTo(TILE_W,     TILE_H / 2);
      g.lineTo(TILE_W / 2, TILE_H);
      g.lineTo(0,          TILE_H / 2);
      g.closePath();
      g.fillPath();

      g.lineStyle(1, c.stroke, 0.6);
      g.strokePath();

    } else {
      // Side wall face (right side)
      const wallColor = Phaser.Display.Color.ValueToColor(PAL.brown);
      const darkened  = Phaser.Display.Color.ValueToColor(PAL.ink);

      g.fillStyle(PAL.brown, 1);
      g.fillRect(0, 0, TILE_W, TILE_DEPTH);
      g.lineStyle(1, PAL.ink, 0.4);
      g.strokeRect(0, 0, TILE_W, TILE_DEPTH);
    }

    g.generateTexture(key, face === 'top' ? TILE_W : TILE_W, face === 'top' ? TILE_H : TILE_DEPTH);
    g.destroy();

    return key;
  }

  /**
   * Create a simple circular placeholder for the player character.
   * Returns a Phaser.GameObjects.Graphics wrapped in a container child.
   * @private
   */
  _createPlayerPlaceholder() {
    const g = this.add.graphics();
    // Body
    g.fillStyle(PAL.blue, 1);
    g.fillEllipse(0, -16, 18, 24);
    // Head
    g.fillStyle(PAL.cream, 1);
    g.fillCircle(0, -32, 9);
    // Eyes
    g.fillStyle(PAL.red, 1);
    g.fillCircle(-3, -33, 2.5);
    g.fillCircle(3,  -33, 2.5);
    return g;
  }

  /**
   * Create a coloured circular placeholder for an NPC/enemy at world position.
   * @private
   */
  _createNPCPlaceholder(x, y, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 0.9);
    g.fillCircle(0, -12, 10);
    g.fillRect(-7, -8, 14, 16);
    g.setPosition(x, y);
    return g;
  }

  /** @private */
  _createEnemyPlaceholder(x, y, color) {
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillTriangle(0, -22, -12, 6, 12, 6);
    g.fillStyle(PAL.ink, 0.8);
    g.fillCircle(0, -22, 6);
    g.setPosition(x, y);
    return g;
  }

  /**
   * Generate a tiny 4×4 particle texture in the given colour.
   * @param {number} color  Hex colour
   * @returns {string}      Texture key
   * @private
   */
  _createParticleTexture(color) {
    const key = `__particle_${color.toString(16)}`;
    if (this.textures.exists(key)) return key;

    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(2, 2, 2);
    g.generateTexture(key, 4, 4);
    g.destroy();

    return key;
  }
}
