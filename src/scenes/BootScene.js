export default class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  preload() {
    // Minimal boot loader; show nothing heavy here.
    this.load.image('pixel', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVQImWNgYGBgYAAAAAMAASsJTYQAAAAASUVORK5CYII=');
  }

  create() {
    this.scene.start('PreloadScene');
  }
}
