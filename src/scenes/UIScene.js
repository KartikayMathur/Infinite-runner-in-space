import Telemetry from '../services/telemetry.js';
import Consent from '../services/consent.js';

export default class UIScene extends Phaser.Scene {
  constructor() { super({ key: 'UIScene', active: false }); }

  create() {
    this.gameScene = this.scene.get('MainScene');

    // Listen to main scene events
    this.gameScene.events.on('distance_update', this.onDistanceUpdate, this);
    this.gameScene.events.on('run_start', () => {
      this.distance = 0;
    });

    // HUD elements
    this.distance = 0;
    this.score = 0;
    this.coins = 0;

    this.hudDistance = this.add.text(12, 12, 'Distance: 0', { font: '18px Arial', fill: '#fff' }).setScrollFactor(0);
    this.hudScore = this.add.text(12, 36, 'Score: 0', { font: '18px Arial', fill: '#fff' }).setScrollFactor(0);
    this.hudCoins = this.add.text(12, 60, 'Coins: 0', { font: '18px Arial', fill: '#ffd700' }).setScrollFactor(0);

    // Pause button (top-right)
    const W = this.scale.width;
    this.pauseBtn = this.add.text(W - 12, 12, '[Pause]', { font: '16px Arial', fill: '#fff' }).setOrigin(1, 0).setScrollFactor(0).setInteractive();
    this.pauseBtn.on('pointerdown', () => this.togglePause());

    // consent UI (simple)
    this.createConsentUI();

    // optional: accept D key to toggle debug from main scene via this.scene.get('MainScene').showDebug etc.
  }

  onDistanceUpdate(payload) {
    this.hudDistance.setText(`Distance: ${payload.distance}`);
  }

  togglePause() {
    if (this.scene.isPaused('MainScene')) {
      this.scene.resume('MainScene');
      this.pauseBtn.setText('[Pause]');
      Telemetry.emit('unpause');
    } else {
      this.scene.pause('MainScene');
      this.pauseBtn.setText('[Resume]');
      Telemetry.emit('pause');
    }
  }

  createConsentUI() {
    // Simple bottom-left consent toggle for prototype
    this.consentText = this.add.text(12, this.scale.height - 12, '', { font: '12px Arial', fill: '#fff' }).setOrigin(0, 1).setScrollFactor(0);
    this.updateConsentText();
    this.input.keyboard.on('keydown-C', () => {
      Consent.setConsent(!Consent.hasConsent());
      this.updateConsentText();
    });
  }

  updateConsentText() {
    const text = Consent.hasConsent() ? 'Consent: GIVEN (press C to revoke)' : 'Consent: REVOKED (press C to give)';
    this.consentText.setText(text);
  }
}
