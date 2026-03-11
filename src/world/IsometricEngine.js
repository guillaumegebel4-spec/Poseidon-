// ============================================================
// POSEIDON — ISOMETRIC ENGINE
// Complete isometric coordinate system + A* pathfinding
// Steelpine — Rise of the Steel Tribes
// ============================================================

/**
 * IsometricEngine handles all coordinate math, depth sorting,
 * grid utilities, and A* pathfinding for the isometric world.
 *
 * Tile convention:
 *   - tileW : horizontal span of the top face (tip-to-tip, X axis)
 *   - tileH : vertical span of the top face  (tip-to-tip, Y axis)
 *   - depth  : pixel height of the visible side wall
 *
 * Isometric projection formula (origin at top of map):
 *   screenX = (col - row) * (tileW / 2) + offsetX
 *   screenY = (col + row) * (tileH / 2) + offsetY - elevation * depth
 */
export class IsometricEngine {
  /**
   * @param {number} tileW  Tile width  in pixels (64)
   * @param {number} tileH  Tile height in pixels (32)
   * @param {number} depth  Side-wall depth       (24)
   */
  constructor(tileW, tileH, depth) {
    this.tileW  = tileW;
    this.tileH  = tileH;
    this.depth  = depth;

    // Precompute half-steps
    this.halfW = tileW / 2;
    this.halfH = tileH / 2;

    // Camera / world origin offset applied to every conversion
    this.offsetX = 0;
    this.offsetY = 0;
  }

  // ─────────────────────────────────────────────────────────────────
  // COORDINATE CONVERSION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Convert an isometric grid position to a screen pixel position.
   * Returns the CENTER-TOP vertex of the tile's top face.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} [elevation=0]  Stack height (0 = ground level)
   * @returns {{ x: number, y: number }}
   */
  gridToScreen(col, row, elevation = 0) {
    return {
      x: (col - row) * this.halfW + this.offsetX,
      y: (col + row) * this.halfH + this.offsetY - elevation * this.depth,
    };
  }

  /**
   * Convert a screen pixel position back to the nearest grid cell.
   * Inverts the isometric projection (ignores elevation for picking).
   *
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{ col: number, row: number }}
   */
  screenToGrid(screenX, screenY) {
    const lx = screenX - this.offsetX;
    const ly = screenY - this.offsetY;

    // Invert: col = (lx/halfW + ly/halfH) / 2
    //         row = (ly/halfH - lx/halfW) / 2
    const col = (lx / this.halfW + ly / this.halfH) / 2;
    const row = (ly / this.halfH - lx / this.halfW) / 2;

    return {
      col: Math.floor(col),
      row: Math.floor(row),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // DEPTH SORTING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Return a numeric depth-sort value.
   * Objects with higher values are drawn on top.
   * Uses the painter's algorithm: further from viewer = lower depth.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} [elevation=0]
   * @returns {number}
   */
  getDepth(col, row, elevation = 0) {
    // (col + row) is the isometric row-order (Manhattan distance from 0,0).
    // Multiply by a large factor so elevation offsets remain visible.
    return (col + row) * 1000 + elevation * 10;
  }

  /**
   * Sort an array of entities using isometric depth (painter's algorithm).
   * Entities must expose { col, row, elevation? } properties.
   * Modifies the array in-place and returns it.
   *
   * @param {Array<{ col: number, row: number, elevation?: number }>} entities
   * @returns {Array}
   */
  sortByDepth(entities) {
    entities.sort((a, b) =>
      this.getDepth(a.col, a.row, a.elevation || 0) -
      this.getDepth(b.col, b.row, b.elevation || 0)
    );
    return entities;
  }

  // ─────────────────────────────────────────────────────────────────
  // GRID UTILITIES
  // ─────────────────────────────────────────────────────────────────

  /**
   * Return true if the position lies within map bounds.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} mapCols  Total columns
   * @param {number} mapRows  Total rows
   * @returns {boolean}
   */
  isValidCell(col, row, mapCols, mapRows) {
    return col >= 0 && row >= 0 && col < mapCols && row < mapRows;
  }

  /**
   * Return the valid 4-directional neighbours of a grid cell.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} mapCols
   * @param {number} mapRows
   * @returns {Array<{ col: number, row: number }>}
   */
  getNeighbors(col, row, mapCols, mapRows) {
    const candidates = [
      { col: col - 1, row },
      { col: col + 1, row },
      { col, row: row - 1 },
      { col, row: row + 1 },
    ];
    return candidates.filter(({ col: c, row: r }) =>
      this.isValidCell(c, r, mapCols, mapRows)
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // HIT DETECTION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Return the screen-space bounding diamond of a tile's top face.
   * Includes the four corner points and a simple AABB.
   *
   * @param {number} col
   * @param {number} row
   * @param {number} [elevation=0]
   * @returns {{ top, right, bottom, left, center, aabb }}
   */
  getTileBounds(col, row, elevation = 0) {
    const center = this.gridToScreen(col, row, elevation);
    return {
      center,
      top:    { x: center.x,              y: center.y              },
      right:  { x: center.x + this.halfW, y: center.y + this.halfH },
      bottom: { x: center.x,              y: center.y + this.tileH },
      left:   { x: center.x - this.halfW, y: center.y + this.halfH },
      aabb: {
        x:      center.x - this.halfW,
        y:      center.y,
        width:  this.tileW,
        height: this.tileH,
      },
    };
  }

  /**
   * Test whether a screen-space point falls inside the tile's diamond.
   *
   * @param {number} px
   * @param {number} py
   * @param {number} col
   * @param {number} row
   * @param {number} [elevation=0]
   * @returns {boolean}
   */
  pointInTile(px, py, col, row, elevation = 0) {
    const center = this.gridToScreen(col, row, elevation);
    // Translate to tile-local space centred on the diamond mid-point
    const lx = px - center.x;
    const ly = py - (center.y + this.halfH);
    return Math.abs(lx / this.halfW) + Math.abs(ly / this.halfH) <= 1;
  }

  // ─────────────────────────────────────────────────────────────────
  // INPUT → ISO DIRECTION CONVERSION
  // ─────────────────────────────────────────────────────────────────

  /**
   * Convert a world-space movement input (WASD / joystick axes) into
   * an isometric grid-space direction vector.
   *
   * Isometric axis mapping:
   *   W (dy=-1) → iso NW: col-1, row-1
   *   S (dy=+1) → iso SE: col+1, row+1
   *   A (dx=-1) → iso SW: col-1, row+1
   *   D (dx=+1) → iso NE: col+1, row-1
   *
   * @param {number} dx  Horizontal axis  (-1 … +1)
   * @param {number} dy  Vertical axis    (-1 … +1)
   * @returns {{ col: number, row: number }}  Normalised grid delta
   */
  worldDirToIso(dx, dy) {
    // Rotate the input vector 45° into iso-grid space:
    //   iso-col axis = screen-right  = (dx - dy)
    //   iso-row axis = screen-down   = (dx + dy)  — note: not divided by 2
    //   because we want cardinal steps to produce ±1 not ±0.5
    const rawCol = dx - dy;
    const rawRow = dx + dy;
    return {
      col: Math.sign(Math.round(rawCol)),
      row: Math.sign(Math.round(rawRow)),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // CAMERA OFFSET
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set the world origin offset applied to all grid-to-screen conversions.
   * Use this to implement camera/scroll.
   *
   * @param {number} x
   * @param {number} y
   */
  setOffset(x, y) {
    this.offsetX = x;
    this.offsetY = y;
  }

  /** @returns {{ x: number, y: number }} */
  getOffset() {
    return { x: this.offsetX, y: this.offsetY };
  }

  // ─────────────────────────────────────────────────────────────────
  // A* PATHFINDING
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find a path from start to end using A* on a walkable grid.
   *
   * The walkableGrid accepts several formats per cell:
   *   - boolean true/false
   *   - null / undefined  (treated as not walkable)
   *   - object with .walkable boolean property
   *   - any truthy/falsy value
   *
   * @param {{ col: number, row: number }} start
   * @param {{ col: number, row: number }} end
   * @param {Array<Array<any>>} walkableGrid
   *        walkableGrid[row][col] — true/truthy = walkable
   * @returns {Array<{ col: number, row: number }>}
   *          Path from start (exclusive) to end (inclusive).
   *          Returns [] if no path exists.
   */
  findPath(start, end, walkableGrid) {
    const mapRows = walkableGrid.length;
    if (mapRows === 0) return [];
    const mapCols = walkableGrid[0].length;

    // Normalised walkability accessor
    const isWalkable = (c, r) => {
      if (c < 0 || r < 0 || c >= mapCols || r >= mapRows) return false;
      const cell = walkableGrid[r][c];
      if (cell === null || cell === undefined) return false;
      if (typeof cell === 'object') return cell.walkable === true;
      return Boolean(cell);
    };

    // Validate endpoints
    if (!isWalkable(start.col, start.row)) return [];
    if (!isWalkable(end.col,   end.row  )) return [];

    // Early exit: already at destination
    if (start.col === end.col && start.row === end.row) return [];

    const key      = (c, r) => r * mapCols + c;
    const heuristic = (c, r) => Math.abs(c - end.col) + Math.abs(r - end.row);

    // A* data structures
    const heap      = new _MinHeap();
    const gScore    = new Map();
    const cameFrom  = new Map();
    const closed    = new Set();

    const startKey = key(start.col, start.row);
    gScore.set(startKey, 0);
    heap.push({ col: start.col, row: start.row, f: heuristic(start.col, start.row) });

    const DIRS = [
      { dc:  1, dr:  0 },
      { dc: -1, dr:  0 },
      { dc:  0, dr:  1 },
      { dc:  0, dr: -1 },
    ];

    while (!heap.isEmpty()) {
      const cur  = heap.pop();
      const cKey = key(cur.col, cur.row);

      if (closed.has(cKey)) continue;
      closed.add(cKey);

      // Reached destination
      if (cur.col === end.col && cur.row === end.row) {
        return this._reconstructPath(cameFrom, cur, key);
      }

      const g = gScore.get(cKey) ?? 0;

      for (const { dc, dr } of DIRS) {
        const nc   = cur.col + dc;
        const nr   = cur.row + dr;
        const nKey = key(nc, nr);

        if (closed.has(nKey) || !isWalkable(nc, nr)) continue;

        const tentativeG = g + 1;
        const prevG      = gScore.get(nKey) ?? Infinity;

        if (tentativeG < prevG) {
          cameFrom.set(nKey, { col: cur.col, row: cur.row });
          gScore.set(nKey, tentativeG);
          heap.push({ col: nc, row: nr, f: tentativeG + heuristic(nc, nr) });
        }
      }
    }

    return []; // no path found
  }

  /** @private */
  _reconstructPath(cameFrom, endNode, keyFn) {
    const path = [];
    let node = endNode;
    while (node) {
      path.unshift({ col: node.col, row: node.row });
      node = cameFrom.get(keyFn(node.col, node.row)) ?? null;
    }
    path.shift(); // remove start node — caller only wants steps to take
    return path;
  }
}

// ─────────────────────────────────────────────────────────────────
// MIN-HEAP — internal utility used by A*
// Binary heap keyed on the `f` property of each node.
// ─────────────────────────────────────────────────────────────────

class _MinHeap {
  constructor() {
    this._data = [];
  }

  isEmpty() {
    return this._data.length === 0;
  }

  push(node) {
    this._data.push(node);
    this._bubbleUp(this._data.length - 1);
  }

  pop() {
    const top  = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) {
      this._data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[parent].f <= this._data[i].f) break;
      const tmp            = this._data[parent];
      this._data[parent]   = this._data[i];
      this._data[i]        = tmp;
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this._data.length;
    for (;;) {
      const left    = 2 * i + 1;
      const right   = 2 * i + 2;
      let   smallest = i;

      if (left  < n && this._data[left].f  < this._data[smallest].f) smallest = left;
      if (right < n && this._data[right].f < this._data[smallest].f) smallest = right;

      if (smallest === i) break;
      const tmp              = this._data[smallest];
      this._data[smallest]   = this._data[i];
      this._data[i]          = tmp;
      i = smallest;
    }
  }
}
