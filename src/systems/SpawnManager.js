// Lightweight spawn manager stub for obstacles/collectibles
export default class SpawnManager {
  constructor(scene) {
    this.scene = scene;
    this.timer = null;
  }

  start() {
    if (this.timer) this.timer.remove(false);
    this.timer = this.scene.time.addEvent({
      delay: 800,
      callback: this.spawn,
      callbackScope: this,
      loop: true
    });
  }

  spawn() {
    // stub - real spawn logic will use ObjectPool and procedural segments
    // Example: this.scene.add.sprite(...)
  }

  stop() {
    if (this.timer) this.timer.remove(false);
    this.timer = null;
  }
}
