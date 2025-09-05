import InputManager from '../systems/InputManager.js';
import Telemetry from '../services/telemetry.js';
import Ads from '../services/ads.js';

export default class MainScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainScene' });
    this.distance = 0;
    this.speedFactor = 0.2; // tuning
  }

  create() {
    const W = this.scale.width, H = this.scale.height;

    // simple star-field background
    this.stars = this.add.group();
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, W*2);
      const y = Phaser.Math.Between(0, H);
      const s = this.add.image(x, y, 'star').setScrollFactor(0.2);
      s.alpha = Phaser.Math.FloatBetween(0.1, 0.9);
      this.stars.add(s);
    }

    // player ship
    this.player = this.physics.add.sprite(200, H/2, 'ship');
    this.player.setCollideWorldBounds(false);
    this.player.body.setSize(40, 30);
    this.player.setOrigin(0.1, 0.5);
    this.player.setGravityY(0); // global gravity configured in main; we keep 0 here to use arcade gravity
    // but ensure we use scene.physics.world.gravity: arcade global gravity used

    // camera (static for slice)
    this.cameras.main.setBackgroundColor('#000000');

    // input manager
    this.inputManager = new InputManager(this);
    this.inputManager.on('tap', () => this.thrust());
    this.inputManager.on('holdStart', () => this.startHoldThrust());
    this.inputManager.on('holdEnd', () => this.stopHoldThrust());
    this.inputManager.on('swipe', (s) => {
      // not used in slice but stub supports it
      Telemetry.emit('input_swipe', s);
    });

    // keyboard fallback
    this.input.keyboard.on('keydown-R', () => {
      // quick restart
      this.scene.restart();
    });

    // HUD communication: emit events for UIScene to pick up
    this.events.emit('run_start');

    // debug toggle via D
    this.showDebug = false;
    this.input.keyboard.on('keydown-D', () => { this.showDebug = !this.showDebug; });

    // telemetry example
    Telemetry.emit('run_start', { ts: Date.now() });
  }

  thrust() {
    // single impulse
    this.player.setVelocityY(-360);
    Telemetry.emit('ship_thrust', { mode: 'tap' });
  }

  startHoldThrust() {
    if (this.holdInterval) return;
    Telemetry.emit('ship_thrust', { mode: 'hold_start' });
    this.holdInterval = this.time.addEvent({
      delay: 50,
      callback: () => {
        this.player.setVelocityY(Phaser.Math.Clamp(this.player.body.velocity.y - 30, -800, 800));
      },
      loop: true
    });
  }

  stopHoldThrust() {
    if (this.holdInterval) {
      this.holdInterval.remove(false);
      this.holdInterval = null;
      Telemetry.emit('ship_thrust', { mode: 'hold_end' });
    }
  }

  update(time, delta) {
    // simple distance: accumulate scaled by player's x velocity (or constant forward speed)
    this.distance += delta * this.speedFactor / 1000; // in units/second rough
    // push some natural drift
    // clamp player Y to world bounds visually (we'll allow off-screen but teleport back slightly)
    const H = this.scale.height;
    if (this.player.y < -64) this.player.y = -64;
    if (this.player.y > H + 64) this.player.y = H + 64;

    // update HUD via event
    this.events.emit('distance_update', { distance: Math.floor(this.distance * 100) });

    // simple gravity handling to keep demo playable (apply engine wide gravity)
    // (Arcade physics global gravity applies automatically; just ensure velocity is not extreme)
    if (Math.abs(this.player.body.velocity.y) > 2000) {
      this.player.setVelocityY(Phaser.Math.Clamp(this.player.body.velocity.y, -2000, 2000));
    }

    // debug overlay drawing
    if (this.showDebug) {
      if (!this.debugText) {
        this.debugText = this.add.text(12, 12, '', { font: '14px monospace', fill: '#0f0' }).setScrollFactor(0);
      }
      this.debugText.setText([
        `FPS: ${Math.floor(this.game.loop.actualFps)}`,
        `Pos: ${this.player.x.toFixed(1)}, ${this.player.y.toFixed(1)}`,
        `VelY: ${this.player.body.velocity.y.toFixed(1)}`
      ]);
    } else if (this.debugText) {
      this.debugText.destroy();
      this.debugText = null;
    }
  }
}
