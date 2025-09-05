export default class InputManager {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.holdThreshold = opts.holdThreshold || 200; // ms
    this._pointerDown = false;
    this._start = null;
    this._callbacks = { tap: [], holdStart: [], holdEnd: [], swipe: [] };
    this._bind();
  }

  on(event, cb) { if (this._callbacks[event]) this._callbacks[event].push(cb); }

  _emit(event, data) { (this._callbacks[event] || []).forEach(cb => cb(data)); }

  _bind() {
    // keyboard
    this.scene.input.keyboard.on('keydown-SPACE', () => this._emit('tap'));

    // pointer events (touch & mouse)
    this.scene.input.on('pointerdown', (p) => {
      // prevent page scroll on mobile by stopping propagation (Phaser handles default)
      this._pointerDown = true;
      this._start = { x: p.x, y: p.y, t: Date.now() };
      this._holdTimer = this.scene.time.delayedCall(this.holdThreshold, () => {
        if (this._pointerDown) this._emit('holdStart');
      });
    });

    this.scene.input.on('pointerup', (p) => {
      this._pointerDown = false;
      const d = Date.now() - (this._start?.t || Date.now());
      const dx = p.x - (this._start?.x || p.x);
      const dy = p.y - (this._start?.y || p.y);
      const dist = Math.hypot(dx, dy);

      if (dist > 50 && d < 500) {
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        this._emit('swipe', { dir, dx, dy });
      } else if (d < this.holdThreshold) {
        this._emit('tap');
      } else {
        this._emit('holdEnd');
      }

      if (this._holdTimer) this._holdTimer.remove(false);
    });

    // prevent default browser gestures (best-effort)
    this.scene.input.addPointer(1);
  }
}
