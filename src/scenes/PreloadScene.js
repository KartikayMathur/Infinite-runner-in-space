import Telemetry from '../services/telemetry.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    // Generate a simple ship texture at runtime so demo runs without external assets.
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x99d9ff, 1);
    // ship body
    g.fillTriangle(0, 40, 40, 20, 0, 0);
    // thruster
    g.fillStyle(0xffaa33, 1);
    g.fillRect(40, 16, 12, 8);
    g.generateTexture('ship', 64, 64);
    g.destroy();

    // small star background texture
    const s = this.make.graphics({ add: false });
    s.fillStyle(0xffffff, 1);
    s.fillCircle(2, 2, 2);
    s.generateTexture('star', 4, 4);
    s.destroy();

    // placeholder sounds (optional): using WebAudio not included for now

    // telemetry: mark preload complete when done
    this.load.on('complete', () => {
      Telemetry.emit('assets_preloaded', { timestamp: Date.now() });
    });
  }

  create() {
    this.scene.start('MainScene');
    this.scene.launch('UIScene');
  }
}
