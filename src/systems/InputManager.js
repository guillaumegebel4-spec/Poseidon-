// ============================================================
// POSEIDON — INPUT MANAGER
// Unified keyboard + touch input with virtual joystick
// Mobile-first design
// ============================================================

export class VirtualJoystick {
  constructor(scene, x, y, radius = 60) {
    this.scene = scene;
    this.baseX = x;
    this.baseY = y;
    this.radius = radius;
    this.thumbRadius = 24;
    this.active = false;
    this.pointerId = null;

    this.dx = 0;
    this.dy = 0;
    this.magnitude = 0;

    // Draw base
    this.baseGraphic = scene.add.graphics();
    this.thumbGraphic = scene.add.graphics();
    this.draw();
    this.setVisible(true);
  }

  draw() {
    this.baseGraphic.clear();
    this.baseGraphic.fillStyle(0x1A1008, 0.5);
    this.baseGraphic.fillCircle(this.baseX, this.baseY, this.radius);
    this.baseGraphic.lineStyle(2, 0xC4614A, 0.8);
    this.baseGraphic.strokeCircle(this.baseX, this.baseY, this.radius);

    this.thumbGraphic.clear();
    this.thumbGraphic.fillStyle(0xC4614A, 0.9);
    this.thumbGraphic.fillCircle(this.baseX, this.baseY, this.thumbRadius);
    this.thumbGraphic.lineStyle(1.5, 0xEDE4D3, 0.6);
    this.thumbGraphic.strokeCircle(this.baseX, this.baseY, this.thumbRadius);
  }

  update(thumbX, thumbY) {
    const relX = thumbX - this.baseX;
    const relY = thumbY - this.baseY;
    const dist = Math.sqrt(relX * relX + relY * relY);
    const clampedDist = Math.min(dist, this.radius);
    const angle = Math.atan2(relY, relX);

    const clampedX = this.baseX + Math.cos(angle) * clampedDist;
    const clampedY = this.baseY + Math.sin(angle) * clampedDist;

    this.dx = clampedDist > 5 ? (clampedX - this.baseX) / this.radius : 0;
    this.dy = clampedDist > 5 ? (clampedY - this.baseY) / this.radius : 0;
    this.magnitude = Math.min(clampedDist / this.radius, 1);

    this.thumbGraphic.clear();
    this.thumbGraphic.fillStyle(0xC4614A, 0.9);
    this.thumbGraphic.fillCircle(clampedX, clampedY, this.thumbRadius);
    this.thumbGraphic.lineStyle(1.5, 0xEDE4D3, 0.6);
    this.thumbGraphic.strokeCircle(clampedX, clampedY, this.thumbRadius);
  }

  reset() {
    this.dx = 0;
    this.dy = 0;
    this.magnitude = 0;
    this.active = false;
    this.pointerId = null;
    this.draw();
  }

  setVisible(visible) {
    this.baseGraphic.setVisible(visible);
    this.thumbGraphic.setVisible(visible);
    this.baseGraphic.setDepth(1000);
    this.thumbGraphic.setDepth(1001);
  }

  destroy() {
    this.baseGraphic.destroy();
    this.thumbGraphic.destroy();
  }
}

export class InputManager {
  constructor(scene) {
    this.scene = scene;
    this.keys = {};
    this.joystick = null;
    this.actionCallbacks = {};

    // Touch state
    this.touches = new Map();
    this.joystickTouchId = null;
    this.actionTouchIds = new Map();

    // Processed input state
    this.moveX = 0;
    this.moveY = 0;
    this.actions = {
      attack: false,
      dodge: false,
      ability1: false,
      ability2: false,
      ability3: false,
      ability4: false,
      interact: false,
      menu: false,
    };
    this.actionJustPressed = { ...this.actions };

    // Action buttons (mobile)
    this.actionButtons = [];

    this._setupKeyboard();
    this._setupTouch();
  }

  _setupKeyboard() {
    const scene = this.scene;
    this.keys = {
      up:      scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right:   scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      upArr:   scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      downArr: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      leftArr: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      rightArr:scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      attack:  scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      dodge:   scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      ab1:     scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      ab2:     scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      ab3:     scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      ab4:     scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      interact:scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      menu:    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
    };
  }

  _setupTouch() {
    const scene = this.scene;
    const { width, height } = scene.scale;

    // Virtual joystick on left side
    this.joystick = new VirtualJoystick(scene, 90, height - 110, 60);

    scene.input.on('pointerdown', (pointer) => this._onPointerDown(pointer));
    scene.input.on('pointermove', (pointer) => this._onPointerMove(pointer));
    scene.input.on('pointerup', (pointer) => this._onPointerUp(pointer));
    scene.input.on('pointercancel', (pointer) => this._onPointerUp(pointer));
  }

  createCombatButtons() {
    const scene = this.scene;
    const { width, height } = scene.scale;

    // Clear existing buttons
    this.actionButtons.forEach(b => { b.graphic.destroy(); b.label.destroy(); });
    this.actionButtons = [];

    // Combat button layout (right side, bottom)
    const buttonDefs = [
      { id: 'attack', label: 'ATK', x: width - 70, y: height - 100, color: 0xC4614A, size: 36 },
      { id: 'dodge',  label: 'DGE', x: width - 130, y: height - 80, color: 0x5B8C5A, size: 30 },
      { id: 'ability1', label: '1', x: width - 190, y: height - 100, color: 0x6B7FA3, size: 28 },
      { id: 'ability2', label: '2', x: width - 240, y: height - 80,  color: 0x6B7FA3, size: 28 },
      { id: 'ability3', label: '3', x: width - 280, y: height - 120, color: 0x7B6A9C, size: 28 },
      { id: 'ability4', label: '4', x: width - 200, y: height - 140, color: 0x7B6A9C, size: 28 },
    ];

    buttonDefs.forEach(def => {
      const g = scene.add.graphics();
      g.fillStyle(def.color, 0.75);
      g.fillCircle(def.x, def.y, def.size);
      g.lineStyle(2, 0xEDE4D3, 0.6);
      g.strokeCircle(def.x, def.y, def.size);
      g.setDepth(1000);
      g.setInteractive(
        new Phaser.Geom.Circle(def.x, def.y, def.size),
        Phaser.Geom.Circle.Contains
      );

      const label = scene.add.text(def.x, def.y, def.label, {
        fontSize: '11px',
        fontFamily: 'Georgia, serif',
        color: '#EDE4D3',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(1001);

      g.on('pointerdown', () => {
        this.actions[def.id] = true;
        this.actionJustPressed[def.id] = true;
        scene.tweens.add({ targets: g, scaleX: 0.85, scaleY: 0.85, duration: 80, yoyo: true });
      });
      g.on('pointerup', () => { this.actions[def.id] = false; });
      g.on('pointerout', () => { this.actions[def.id] = false; });

      this.actionButtons.push({ id: def.id, graphic: g, label, x: def.x, y: def.y, size: def.size });
    });
  }

  _onPointerDown(pointer) {
    const { width } = this.scene.scale;

    // Left side = joystick
    if (pointer.x < width * 0.5 && !this.joystickTouchId) {
      this.joystickTouchId = pointer.id;
      this.joystick.active = true;
      this.joystick.baseX = pointer.x;
      this.joystick.baseY = pointer.y;
      this.joystick.draw();
      this.joystick.update(pointer.x, pointer.y);
    }
  }

  _onPointerMove(pointer) {
    if (pointer.id === this.joystickTouchId) {
      this.joystick.update(pointer.x, pointer.y);
    }
  }

  _onPointerUp(pointer) {
    if (pointer.id === this.joystickTouchId) {
      this.joystick.reset();
      this.joystickTouchId = null;
    }
  }

  update() {
    // Reset justPressed
    Object.keys(this.actionJustPressed).forEach(k => { this.actionJustPressed[k] = false; });

    // Keyboard movement
    let kx = 0, ky = 0;
    if (this.keys.left.isDown || this.keys.leftArr.isDown)   kx -= 1;
    if (this.keys.right.isDown || this.keys.rightArr.isDown) kx += 1;
    if (this.keys.up.isDown || this.keys.upArr.isDown)       ky -= 1;
    if (this.keys.down.isDown || this.keys.downArr.isDown)   ky += 1;

    // Normalize keyboard diagonal
    if (kx !== 0 && ky !== 0) {
      kx *= 0.707;
      ky *= 0.707;
    }

    // Combine joystick + keyboard
    if (this.joystick.magnitude > 0.1) {
      this.moveX = this.joystick.dx;
      this.moveY = this.joystick.dy;
    } else {
      this.moveX = kx;
      this.moveY = ky;
    }

    // Keyboard actions (just pressed detection)
    if (Phaser.Input.Keyboard.JustDown(this.keys.attack))  this.actionJustPressed.attack = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.dodge))   this.actionJustPressed.dodge = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ab1))     this.actionJustPressed.ability1 = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ab2))     this.actionJustPressed.ability2 = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ab3))     this.actionJustPressed.ability3 = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ab4))     this.actionJustPressed.ability4 = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.interact))this.actionJustPressed.interact = true;
    if (Phaser.Input.Keyboard.JustDown(this.keys.menu))    this.actionJustPressed.menu = true;

    // Keyboard held
    this.actions.attack = this.keys.attack.isDown;
    this.actions.dodge   = this.keys.dodge.isDown;
  }

  isMoving() {
    return Math.abs(this.moveX) > 0.1 || Math.abs(this.moveY) > 0.1;
  }

  getMovementAngle() {
    if (!this.isMoving()) return 0;
    return Math.atan2(this.moveY, this.moveX);
  }

  setJoystickVisible(visible) {
    this.joystick.setVisible(visible);
  }

  destroy() {
    this.joystick.destroy();
    this.actionButtons.forEach(b => { b.graphic.destroy(); b.label.destroy(); });
  }
}
