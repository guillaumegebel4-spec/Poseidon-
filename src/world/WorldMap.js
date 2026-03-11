// ============================================================
// POSEIDON — WORLD MAP
// Procedural floating-island map generator per biome.
// Steelpine — Rise of the Steel Tribes
// ============================================================

/**
 * Cell data structure:
 * {
 *   height:      0-3,           // elevation level
 *   type:        'ground'|'bridge'|'ledge'|'void',
 *   walkable:    boolean,
 *   decoration:  null | { id: string, sprite: string }
 * }
 */

// Tile type constants
const TILE_GROUND = 'ground';
const TILE_BRIDGE = 'bridge';
const TILE_LEDGE  = 'ledge';

// Height thresholds for cellular automata live/dead decision
const CA_BIRTH_LIMIT   = 4;
const CA_DEATH_LIMIT   = 3;
const CA_INITIAL_FILL  = 0.45;

export class WorldMap {
  /**
   * @param {string}           biomeId   One of 'forest'|'volcanic'|'cyber'|'ruins'
   * @param {IsometricEngine}  isoEngine Reference to the shared IsometricEngine
   */
  constructor(biomeId, isoEngine) {
    this.biomeId   = biomeId;
    this.iso       = isoEngine;
    this.cols      = 0;
    this.rows      = 0;

    // 2-D array [row][col] of cell objects (null = void/no tile)
    this.grid      = [];

    // Decoration map  key='col,row' → { id, sprite }
    this._decorations = new Map();

    // Cached lists populated after generate()
    this._walkable = [];
    this._spawns   = [];
    this._portals  = [];

    // Seeded PRNG so maps are reproducible per biome run
    this._seed = this._hashBiome(biomeId);
    this._rng  = this._makePRNG(this._seed);
  }

  // ─────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────

  /**
   * Generate the floating-island map.
   *
   * @param {number} [cols=24]        Map width  in tiles
   * @param {number} [rows=24]        Map height in tiles
   * @param {number} [islandCount=5]  Hint for number of islands (biome may override)
   * @returns {Array<Array<object|null>>} The generated 2-D grid
   */
  generate(cols = 24, rows = 24, islandCount = 5) {
    this.cols = cols;
    this.rows = rows;

    // Start with a blank null grid
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));

    // Delegate to biome-specific algorithm
    switch (this.biomeId) {
      case 'forest':   this._generateForestIslands(cols, rows);   break;
      case 'volcanic': this._generateVolcanicIslands(cols, rows); break;
      case 'cyber':    this._generateCyberIslands(cols, rows);    break;
      case 'ruins':    this._generateRuinsIslands(cols, rows);    break;
      default:         this._generateForestIslands(cols, rows);
    }

    // Post-process: assign heights, mark ledges, build bridges
    this._assignHeights();
    this._markLedges();
    this._buildBridges(this._findIslands());

    // Decoration pass
    this.generateDecorations();

    // Cache derived lists
    this._buildCaches();

    return this.grid;
  }

  /**
   * Return the cell at (col, row), or null if out of bounds / void.
   *
   * @param {number} col
   * @param {number} row
   * @returns {{ height, type, walkable, decoration }|null}
   */
  getTile(col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return this.grid[row][col];
  }

  /**
   * Return all walkable grid positions.
   * @returns {Array<{ col, row }>}
   */
  getWalkablePositions() {
    return this._walkable;
  }

  /**
   * Return spawn points: first entry = player spawn,
   * remaining entries = enemy/NPC spawns.
   * @returns {Array<{ col, row, role: 'player'|'enemy'|'npc' }>}
   */
  getSpawnPoints() {
    return this._spawns;
  }

  /**
   * Return portal / gate tile positions.
   * @returns {Array<{ col, row }>}
   */
  getPortalPositions() {
    return this._portals;
  }

  /**
   * Populate the map with biome-appropriate decorations.
   * Called automatically by generate(), but can be called again to re-roll.
   */
  generateDecorations() {
    this._decorations.clear();

    const decoSets = {
      forest:   ['mech_tree', 'crystal_flower', 'old_fountain', 'vine_pillar'],
      volcanic: ['lava_vent', 'fire_crystal', 'molten_pool', 'scorched_ruin'],
      cyber:    ['neon_tower', 'data_terminal', 'holopanel', 'tesla_coil'],
      ruins:    ['stone_arch', 'data_waterfall', 'ancient_portal', 'crystal_obelisk'],
    };

    const options = decoSets[this.biomeId] || decoSets.forest;
    const density = 0.12; // ~12% of ground tiles get a decoration

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell || !cell.walkable) continue;
        if (this._rng() < density) {
          const id     = options[Math.floor(this._rng() * options.length)];
          const sprite = `deco_${id}`;
          const deco   = { id, sprite };
          this._decorations.set(`${c},${r}`, deco);
          // Store on cell too for convenience
          cell.decoration = deco;
        }
      }
    }
  }

  /**
   * Return the decoration at a grid position, or null.
   * @param {number} col
   * @param {number} row
   * @returns {{ id: string, sprite: string }|null}
   */
  getDecorationAt(col, row) {
    return this._decorations.get(`${col},${row}`) || null;
  }

  // ─────────────────────────────────────────────────────────────────
  // BIOME GENERATORS
  // ─────────────────────────────────────────────────────────────────

  /**
   * Forest: organic connected blobs via cellular automata.
   * Results in smooth rounded island shapes with gentle connections.
   * @private
   */
  _generateForestIslands(cols, rows) {
    // 1. Random noise fill
    let raw = this._randomFill(cols, rows, CA_INITIAL_FILL);

    // 2. Several cellular automata passes for smooth organic blobs
    raw = this._cellularAutomata(raw, 5);

    // 3. Remove tiny isolated regions
    raw = this._removeSmallRegions(raw, 20);

    // 4. Apply to grid
    this._applyRaw(raw);
  }

  /**
   * Volcanic: jagged, clearly separated chunks.
   * Uses cellular automata with looser rules + explicit island separation.
   * @private
   */
  _generateVolcanicIslands(cols, rows) {
    // Sparser fill → more isolated islands
    let raw = this._randomFill(cols, rows, 0.35);

    // Fewer CA passes → jagged edges
    raw = this._cellularAutomata(raw, 3);
    raw = this._removeSmallRegions(raw, 12);

    // Force separation between regions by eroding their borders
    raw = this._erodeIslands(raw, 1);

    this._applyRaw(raw);
  }

  /**
   * Cyber: grid-like rectangular platforms connected by thin bridges.
   * @private
   */
  _generateCyberIslands(cols, rows) {
    const raw = this._emptyRaw(cols, rows);

    // Place 5-8 rectangular platforms of varying sizes
    const platforms = Math.floor(this._rng() * 4) + 5;
    for (let p = 0; p < platforms; p++) {
      const pw  = Math.floor(this._rng() * 5) + 3;
      const ph  = Math.floor(this._rng() * 5) + 3;
      const ox  = Math.floor(this._rng() * (cols - pw - 2)) + 1;
      const oy  = Math.floor(this._rng() * (rows - ph - 2)) + 1;

      for (let r = oy; r < oy + ph; r++) {
        for (let c = ox; c < ox + pw; c++) {
          raw[r][c] = 1;
        }
      }
    }

    this._applyRaw(raw);
  }

  /**
   * Ruins: sparse large platforms, feels ancient and monumental.
   * @private
   */
  _generateRuinsIslands(cols, rows) {
    const raw = this._emptyRaw(cols, rows);

    // 3-5 large elliptical platforms
    const count = Math.floor(this._rng() * 3) + 3;
    for (let p = 0; p < count; p++) {
      const cx = Math.floor(this._rng() * (cols - 8)) + 4;
      const cy = Math.floor(this._rng() * (rows - 8)) + 4;
      const rx = Math.floor(this._rng() * 4) + 4;
      const ry = Math.floor(this._rng() * 3) + 3;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = (c - cx) / rx;
          const dy = (r - cy) / ry;
          if (dx * dx + dy * dy <= 1) {
            raw[r][c] = 1;
          }
        }
      }
    }

    // Light erosion for natural edges
    const eroded = this._cellularAutomata(raw, 2);
    this._applyRaw(eroded);
  }

  // ─────────────────────────────────────────────────────────────────
  // CELLULAR AUTOMATA
  // ─────────────────────────────────────────────────────────────────

  /**
   * Run N iterations of the cave/island cellular automaton.
   * Classic rule: a cell becomes/stays alive if it has >= BIRTH_LIMIT
   * live neighbours, and dies if it has < DEATH_LIMIT neighbours.
   *
   * @param {Array<Array<number>>} grid  Binary grid (0/1)
   * @param {number}               iterations
   * @returns {Array<Array<number>>} New binary grid
   */
  _cellularAutomata(grid, iterations) {
    const rows = grid.length;
    const cols = grid[0].length;

    let current = grid;

    for (let pass = 0; pass < iterations; pass++) {
      const next = this._emptyRaw(cols, rows);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const neighbours = this._countLiveNeighbours(current, c, r, cols, rows);
          if (current[r][c] === 1) {
            next[r][c] = neighbours >= CA_DEATH_LIMIT ? 1 : 0;
          } else {
            next[r][c] = neighbours > CA_BIRTH_LIMIT ? 1 : 0;
          }
        }
      }

      current = next;
    }

    return current;
  }

  // ─────────────────────────────────────────────────────────────────
  // BRIDGES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Connect each island to its nearest neighbour with a 1-tile-wide bridge.
   *
   * @param {Array<Array<{ col, row }>>} islands  Array of island tile-lists
   */
  _buildBridges(islands) {
    if (islands.length < 2) return;

    // Build a spanning tree: connect each island to the nearest one
    const connected = new Set([0]);
    const unconnected = new Set(islands.map((_, i) => i).filter(i => i !== 0));

    while (unconnected.size > 0) {
      let bestDist = Infinity;
      let bestFrom = -1;
      let bestTo   = -1;
      let bestA    = null;
      let bestB    = null;

      for (const fromIdx of connected) {
        for (const toIdx of unconnected) {
          // Find closest pair of tiles between islands
          const { dist, tileA, tileB } = this._closestPair(
            islands[fromIdx],
            islands[toIdx]
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestFrom = fromIdx;
            bestTo   = toIdx;
            bestA    = tileA;
            bestB    = tileB;
          }
        }
      }

      if (bestA && bestB) {
        this._carveBridge(bestA, bestB);
        connected.add(bestTo);
        unconnected.delete(bestTo);
      } else {
        break; // no more connections possible
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────

  /** Create a cols × rows 2-D array filled with 0 */
  _emptyRaw(cols, rows) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  /** Fill a raw binary grid with random noise */
  _randomFill(cols, rows, density) {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        // Always leave a 1-tile border as void
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) return 0;
        return this._rng() < density ? 1 : 0;
      })
    );
  }

  /** Count 8-directional live neighbours (Moore neighbourhood) */
  _countLiveNeighbours(grid, c, r, cols, rows) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        // Out-of-bounds counts as live (pushes interior toward life)
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          count++;
        } else {
          count += grid[nr][nc];
        }
      }
    }
    return count;
  }

  /** Copy a raw binary grid into this.grid as cell objects */
  _applyRaw(raw) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (raw[r][c] === 1) {
          this.grid[r][c] = {
            height:     0,
            type:       TILE_GROUND,
            walkable:   true,
            decoration: null,
          };
        } else {
          this.grid[r][c] = null;
        }
      }
    }
  }

  /**
   * Erode island edges by removing tiles with fewer than `threshold`
   * solid neighbours — creates separation between clusters.
   * @private
   */
  _erodeIslands(raw, passes = 1) {
    let current = raw;
    for (let p = 0; p < passes; p++) {
      const next = this._emptyRaw(current[0].length, current.length);
      for (let r = 0; r < current.length; r++) {
        for (let c = 0; c < current[0].length; c++) {
          if (current[r][c] === 0) continue;
          const nb = this._countLiveNeighbours(current, c, r, current[0].length, current.length);
          next[r][c] = nb >= 4 ? 1 : 0;
        }
      }
      current = next;
    }
    return current;
  }

  /**
   * Flood-fill to find discrete island regions.
   * @returns {Array<Array<{ col, row }>>}
   * @private
   */
  _findIslands() {
    const visited = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
    const islands = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && !visited[r][c]) {
          const tiles = [];
          const stack = [{ col: c, row: r }];
          while (stack.length > 0) {
            const { col, row } = stack.pop();
            if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
            if (visited[row][col] || !this.grid[row][col]) continue;
            visited[row][col] = true;
            tiles.push({ col, row });
            stack.push(
              { col: col + 1, row },
              { col: col - 1, row },
              { col, row: row + 1 },
              { col, row: row - 1 }
            );
          }
          if (tiles.length > 0) islands.push(tiles);
        }
      }
    }

    return islands;
  }

  /**
   * Remove island regions smaller than minSize tiles.
   * @private
   */
  _removeSmallRegions(raw, minSize) {
    const rows = raw.length;
    const cols = raw[0].length;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const result  = raw.map(r => [...r]);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (raw[r][c] === 1 && !visited[r][c]) {
          const tiles = [];
          const stack = [{ c, r }];
          while (stack.length > 0) {
            const { c: cc, r: rr } = stack.pop();
            if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
            if (visited[rr][cc] || raw[rr][cc] === 0) continue;
            visited[rr][cc] = true;
            tiles.push({ c: cc, r: rr });
            stack.push(
              { c: cc + 1, r: rr }, { c: cc - 1, r: rr },
              { c: cc, r: rr + 1 }, { c: cc, r: rr - 1 }
            );
          }
          if (tiles.length < minSize) {
            for (const { c: tc, r: tr } of tiles) result[tr][tc] = 0;
          }
        }
      }
    }

    return result;
  }

  /**
   * Assign elevation heights based on distance from island edge.
   * Tiles surrounded on all 4 sides get incrementally higher.
   * @private
   */
  _assignHeights() {
    // Multi-pass erosion: each pass removes one layer and elevates what's left
    const tempGrid = Array.from({ length: this.rows }, (_, r) =>
      Array.from({ length: this.cols }, (_, c) => (this.grid[r][c] ? 1 : 0))
    );

    // 3 passes = 3 height layers (0, 1, 2, 3)
    for (let pass = 1; pass <= 3; pass++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const cell = this.grid[r][c];
          if (!cell) continue;
          if (cell.height < pass - 1) continue;

          // Check if all 4 cardinal neighbours are also solid
          const allSolid =
            this._isSolid(c + 1, r) && this._isSolid(c - 1, r) &&
            this._isSolid(c, r + 1) && this._isSolid(c, r - 1);

          if (allSolid && cell.height < 3) {
            cell.height = Math.min(3, pass);
          }
        }
      }
    }
  }

  /** Return true if (c,r) is a solid (non-null) cell */
  _isSolid(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.grid[r][c] !== null;
  }

  /**
   * Mark edge tiles (tiles with at least one void neighbour) as 'ledge'.
   * @private
   */
  _markLedges() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;
        const hasVoidNeighbour =
          !this._isSolid(c + 1, r) || !this._isSolid(c - 1, r) ||
          !this._isSolid(c, r + 1) || !this._isSolid(c, r - 1);

        if (hasVoidNeighbour && cell.height === 0) {
          cell.type = TILE_LEDGE;
        }
      }
    }
  }

  /**
   * Find the closest pair of tiles between two islands.
   * @private
   */
  _closestPair(islandA, islandB) {
    let bestDist = Infinity;
    let tileA    = null;
    let tileB    = null;

    // Sample at most 60 tiles per island to keep it fast
    const sampleA = this._sample(islandA, 60);
    const sampleB = this._sample(islandB, 60);

    for (const a of sampleA) {
      for (const b of sampleB) {
        const dist = Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
        if (dist < bestDist) {
          bestDist = dist;
          tileA    = a;
          tileB    = b;
        }
      }
    }

    return { dist: bestDist, tileA, tileB };
  }

  /**
   * Carve a bridge between two tile positions using Bresenham's line.
   * Bridge tiles are 1 tile wide and walkable.
   * @private
   */
  _carveBridge(from, to) {
    let { col: c0, row: r0 } = from;
    const { col: c1, row: r1 } = to;

    const dc = Math.abs(c1 - c0);
    const dr = Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1;
    const sr = r0 < r1 ? 1 : -1;
    let err = dc - dr;

    for (let step = 0; step < dc + dr + 2; step++) {
      // Place a bridge tile if not already solid
      if (!this.grid[r0]?.[c0]) {
        this.grid[r0][c0] = {
          height:     0,
          type:       TILE_BRIDGE,
          walkable:   true,
          decoration: null,
        };
      }

      if (c0 === c1 && r0 === r1) break;

      const e2 = 2 * err;
      if (e2 > -dr) { err -= dr; c0 += sc; }
      if (e2 < dc)  { err += dc; r0 += sr; }
    }
  }

  /**
   * Build cached lists: walkable positions, spawn points, portals.
   * @private
   */
  _buildCaches() {
    this._walkable = [];
    this._spawns   = [];
    this._portals  = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell) continue;

        if (cell.walkable) {
          this._walkable.push({ col: c, row: r });
        }
      }
    }

    if (this._walkable.length === 0) return;

    // Player spawn: pick a tile from the first island, near its centre
    const playerSpawn = this._walkable[Math.floor(this._walkable.length * 0.1)];
    this._spawns.push({ col: playerSpawn.col, row: playerSpawn.row, role: 'player' });

    // Enemy spawns: spread across different parts of the map
    const enemyCount = Math.floor(this._walkable.length / 15);
    const step       = Math.floor(this._walkable.length / Math.max(enemyCount, 1));

    for (let i = 1; i <= enemyCount; i++) {
      const idx  = Math.min(step * i + Math.floor(this._rng() * step * 0.3), this._walkable.length - 1);
      const tile = this._walkable[idx];
      this._spawns.push({ col: tile.col, row: tile.row, role: 'enemy' });
    }

    // NPC spawn: near player but on a different island edge
    const npcIdx  = Math.min(Math.floor(this._walkable.length * 0.6), this._walkable.length - 1);
    const npcTile = this._walkable[npcIdx];
    this._spawns.push({ col: npcTile.col, row: npcTile.row, role: 'npc' });

    // Portal: far end of the map
    const portalIdx  = Math.floor(this._walkable.length * 0.85);
    const portalTile = this._walkable[portalIdx];
    this._portals.push({ col: portalTile.col, row: portalTile.row });

    // Mark the portal tile visually
    if (this.grid[portalTile.row]?.[portalTile.col]) {
      this.grid[portalTile.row][portalTile.col].type = 'portal';
    }
  }

  /** @private Sample up to `n` elements from an array without mutation */
  _sample(arr, n) {
    if (arr.length <= n) return arr;
    const step = Math.ceil(arr.length / n);
    return arr.filter((_, i) => i % step === 0);
  }

  // ─────────────────────────────────────────────────────────────────
  // PSEUDO-RANDOM NUMBER GENERATOR
  // ─────────────────────────────────────────────────────────────────

  /** Hash a biome string to a seed integer */
  _hashBiome(biomeId) {
    let hash = 2166136261;
    for (let i = 0; i < biomeId.length; i++) {
      hash ^= biomeId.charCodeAt(i);
      hash  = (hash * 16777619) >>> 0;
    }
    return hash;
  }

  /**
   * Create a seeded PRNG (Mulberry32 algorithm).
   * Returns a function that produces values in [0, 1).
   * @param {number} seed
   * @returns {() => number}
   */
  _makePRNG(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = t ^ (t + Math.imul(t ^ (t >>> 7), 61 | t));
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
