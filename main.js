/* main.js
   Self-contained Phaser3 HTML prototype for "Infinite Runner in Space".
   Drop with index.html + styles.css and open index.html in a browser.
   No build step required.
*/

// ===== CONFIG =====
const CONFIG = {
  width: 1280,
  height: 720,
  gravityY: 800,
  thrustVelocity: -360,
  holdThrustAccel: -30,
  spawnIntervalMs: 900,
  asteroidSpeedBase: -220,
  coinSpeedBase: -200,
  maxAsteroids: 20,
  maxCoins: 16,
  debug: false,
  seed: (() => { try { return Number(new URLSearchParams(location.search).get('seed')) || null; } catch(e){ return null; } })()
};

// ===== Simple seeded RNG (optional reproducibility) =====
class RNG {
  constructor(seed = Date.now()) { this.s = seed % 2147483647; if (this.s <= 0) this.s += 2147483646; }
  next() { return this.s = this.s * 16807 % 2147483647; }
  float() { return (this.next() - 1) / 2147483646; }
  intRange(a,b){ return Math.floor(this.float()*(b-a+1))+a; }
}
const rng = new RNG(CONFIG.seed ?? Date.now());

// ===== Telemetry & Ads stubs (global) =====
window.telemetry = {
  emit: (ev, data) => { if (!window._consent) return console.log('[telemetry suppressed]', ev, data); console.log('[telemetry]', ev, data); }
};
window.requestRewardedAd = () => new Promise((res, rej) => {
  if(!window._consent) return rej(new Error('no-consent'));
  console.log('[ads] simulated rewarded ad start...');
  setTimeout(()=> { console.log('[ads] simulated rewarded ad complete'); res({completed:true}); }, 1400);
});
window.showInterstitial = () => { if(!window._consent) return console.log('[ads] interstitial suppressed'); console.log('[ads] simulated interstitial'); };

// ===== Persistence helpers =====
const SAVE_KEY = 'space_runner_save_v1';
function loadSave(){
  let loadedState = {credits:0,gems:0,upgrades:{thruster: 1},skins:[],best:0,dailyStamp:null, runsSinceLastAd: 0};
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      const parsed = JSON.parse(s);
      // Ensure upgrades object exists
      if (!parsed.upgrades) parsed.upgrades = { thruster: 1 };
      loadedState = { ...loadedState, ...parsed };
    }
  } catch(e){
    // return default state on error
  }
  return loadedState;
}
function saveState(state){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

// ===== Phaser Game Scenes =====
class Boot extends Phaser.Scene {
  constructor(){ super('Boot'); }
  preload(){}
  create(){ this.scene.start('Main'); }
}

class Main extends Phaser.Scene {
  constructor(){
    super('Main');
    this.distance = 0;
    this.score = 0;
    this.state = loadSave();
    // Define vertical lanes for spawning
    this.lanes = [
      CONFIG.height * 0.2,
      CONFIG.height * 0.4,
      CONFIG.height * 0.6,
      CONFIG.height * 0.8
    ];

    // Procedural generation segment definitions
    this.segments = [
      { type: 'safe_zone', duration: 2000 }, // 2 seconds of nothing
      { type: 'asteroid_field', duration: 5000, config: { density: 0.7 } }, // 5 seconds of asteroids
      { type: 'coin_line', duration: 3000, config: { lane: 1, length: 10 } }, // 3 seconds of a line of coins
      { type: 'asteroid_wall', duration: 1000, config: { openLane: 2 } } // 1 second wall of asteroids with one opening
    ];
    this.currentSegment = null;
    this.segmentTimer = 0;
  }
  preload(){
    // runtime ship & star textures
    const g = this.make.graphics({add:false});
    // ship: simple right-facing triangle
    g.fillStyle(0x99d9ff,1);
    g.fillTriangle(0,32,48,16,0,0);
    g.fillStyle(0xffaa33,1); // thruster
    g.fillRect(48,12,10,8);
    g.generateTexture('ship',60,40);
    g.destroy();

    // asteroid
    const a = this.make.graphics({add:false});
    a.fillStyle(0x888888,1);
    a.fillCircle(16,16,16);
    a.generateTexture('asteroid',32,32);
a.destroy();

    // coin
    const c = this.make.graphics({add:false});
    c.fillStyle(0xffd700,1);
    c.fillCircle(8,8,8);
    c.generateTexture('coin',16,16);
    c.destroy();

    // shield powerup
    const p = this.make.graphics({add:false});
    p.fillStyle(0x00ff00,1);
    p.fillCircle(16,16,16);
    p.generateTexture('powerup_shield',32,32);
    p.destroy();

    // projectile
    const b = this.make.graphics({add:false});
    b.fillStyle(0xffffff,1);
    b.fillRect(0,0,10,4);
    b.generateTexture('bullet',10,4);
    b.destroy();

    // particle for explosions
    const part = this.make.graphics({add:false});
    part.fillStyle(0xffffff,1);
    part.fillCircle(2,2,2);
    part.generateTexture('particle',4,4);
    part.destroy();
  }

  create() {
    // world config
    this.scaleMode = Phaser.Scale.FIT; // visual, not used directly
    this.cameras.main.setBackgroundColor('#000');

    // world gravity set through arcade config in game config (we rely on it)
    const W = this.scale.width, H = this.scale.height;

    // Parallax starfield background
    this.starLayers = [];
    // Layer 1: Far, slow
    this.starLayers.push(this.add.group({
      key: 'coin',
      frameQuantity: 60,
      active: false,
      visible: false
    }));
    this.starLayers[0].getChildren().forEach(s => {
      s.setPosition(rng.intRange(0, W), rng.intRange(0, H));
      s.setAlpha(rng.float() * 0.5).setScale(rng.float() * 0.2);
    });
    // Layer 2: Mid, medium speed
    this.starLayers.push(this.add.group({ key: 'coin', frameQuantity: 40 }));
    this.starLayers[1].getChildren().forEach(s => {
      s.setPosition(rng.intRange(0, W), rng.intRange(0, H));
      s.setAlpha(0.5 + rng.float() * 0.5).setScale(0.2 + rng.float() * 0.2);
    });

    // player
    this.player = this.physics.add.sprite(160, H/2, 'ship');
    this.player.setOrigin(0.1,0.5);
    this.player.body.setAllowGravity(true);
    this.player.setCollideWorldBounds(false);
    // Adjust hitbox to better match the triangular sprite
    this.player.body.setSize(48, 32).setOffset(0, 0);

    // HUD
    this.hudDistance = this.add.text(12,12,'Distance: 0',{font:'20px Arial', fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudScore = this.add.text(12,36,'Score: 0',{font:'18px Arial', fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudCoins = this.add.text(12,58,'Credits: '+this.state.credits,{font:'18px Arial', fill:'#ffd700'}).setScrollFactor(0).setDepth(10);
    this.hudShield = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.updateShieldBar(0); // Initially hidden

    // debug text
    this.debugText = this.add.text(12,90,'', {font:'12px monospace', fill:'#0f0'}).setScrollFactor(0).setDepth(10);
    this.debugMode = CONFIG.debug;

    // Input Manager (unified)
    this.inputMgr = { callbacks:{tap:[], holdStart:[], holdEnd:[], swipe:[]}, on:(ev,cb)=>{ this.inputMgr.callbacks[ev].push(cb); } };
    this._bindInput();

    // hook input to thrust
    this.inputMgr.on('tap', ()=> { this.thrustTap(); });
    this.inputMgr.on('holdStart', ()=> { this.startHold(); });
    this.inputMgr.on('holdEnd', ()=> { this.stopHold(); });
    this.inputMgr.on('swipe', (d)=>{ /* optional: do dodge */ });

    // pooling groups
    this.asteroids = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: CONFIG.maxAsteroids, runChildUpdate: true });
    this.coins = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: CONFIG.maxCoins, runChildUpdate: true });
    this.powerups = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: 5, runChildUpdate: true });
    this.projectiles = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: 15, runChildUpdate: true });
    this.isShielded = false;
    this.lastFired = 0;

    // collisions
    this.physics.add.overlap(this.player, this.coins, (p,c)=>{ this.collectCoin(c); }, null, this);
    this.physics.add.overlap(this.player, this.powerups, (p,pu)=>{ this.collectPowerup(pu); }, null, this);
    this.physics.add.collider(this.player, this.asteroids, (p,a)=>{ this.onHitAsteroid(a); }, null, this);
    this.physics.add.overlap(this.projectiles, this.asteroids, (proj, ast)=>{ this.hitAsteroid(proj, ast); }, null, this);

    // spawn timer (will be replaced by segment-based logic)
    // this.spawnTimer = this.time.addEvent({ delay: CONFIG.spawnIntervalMs, loop:true, callback:this.spawnCycle, callbackScope:this });
    this.startNextSegment();

    // telemetry
    window.telemetry.emit('run_start',{ts:Date.now(), seed:CONFIG.seed});
    this.runStartTS = Date.now();

    // Ad logic
    this.state.runsSinceLastAd = (this.state.runsSinceLastAd || 0) + 1;
    saveState(this.state);

    // consent flag from global
    window._consent = window._consent ?? true;

    // clamp velocity safety
    this.maxVel = 1200;

    // Explosion particle emitter
    this.explosionEmitter = this.add.particles(0, 0, 'particle', {
      speed: { min: -100, max: 100 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      blendMode: 'ADD',
      lifespan: 400,
      gravityY: 0,
      frequency: -1 // So it doesn't fire on its own
    });
    this.explosionEmitter.setDepth(20);

    // Thruster particle emitter
    this.thrusterEmitter = this.add.particles(0, 0, 'particle', {
      x: { min: -10, max: 10 },
      y: { min: -10, max: 10 },
      speed: { min: 100, max: 200 },
      angle: { min: 170, max: 190 },
      scale: { start: 0.5, end: 0 },
      blendMode: 'SCREEN',
      lifespan: 200,
      gravityY: 0,
      on: false // Start turned off
    });
    this.thrusterEmitter.setDepth(1);
  }

  _bindInput(){
    // keyboard
    this.input.keyboard.on('keydown-SPACE', ()=> this.inputMgr.callbacks.tap.forEach(cb=>cb()));
    this.input.keyboard.on('keydown-X', ()=> this.fireWeapon());
    // pointer events unify mouse/touch
    this.input.on('pointerdown', (p) => {
      this.pointerDown = true;
      this.pointerStart = {x:p.x,y:p.y,t:Date.now()};
      // hold timer
      this.holdTimer = this.time.delayedCall(220, ()=> { if (this.pointerDown) this.inputMgr.callbacks.holdStart.forEach(cb=>cb()); });
    });
    this.input.on('pointerup', (p) => {
      this.pointerDown = false;
      const d = Date.now() - (this.pointerStart?.t||Date.now());
      const dx = p.x - (this.pointerStart?.x||p.x); const dy = p.y - (this.pointerStart?.y||p.y);
      const dist = Math.hypot(dx,dy);
      if (dist>60 && d<500) {
        const dir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up');
        this.inputMgr.callbacks.swipe.forEach(cb=>cb({dir,dx,dy}));
      } else if (d<220) {
        this.inputMgr.callbacks.tap.forEach(cb=>cb());
      } else {
        this.inputMgr.callbacks.holdEnd.forEach(cb=>cb());
      }
      if (this.holdTimer) this.holdTimer.remove(false);
    });
    // prevent page scroll
    window.addEventListener('touchmove', (e)=>{ e.preventDefault(); }, {passive:false});
  }

  thrustTap(){
    const thrusterLevel = this.state.upgrades?.thruster || 1;
    const thrustPower = CONFIG.thrustVelocity - ((thrusterLevel - 1) * 25);
    this.player.setVelocityY(thrustPower);
    window.telemetry.emit('ship_thrust',{type:'tap', level: thrusterLevel});
    this.thrusterEmitter.start();
    this.time.delayedCall(150, () => this.thrusterEmitter.stop());
  }

  startHold(){
    if (this.holdEvt) return;
    window.telemetry.emit('ship_thrust',{type:'hold_start'});
    this.thrusterEmitter.start();
    this.holdEvt = this.time.addEvent({ delay:50, loop:true, callback:()=> {
      this.player.setVelocityY(Phaser.Math.Clamp(this.player.body.velocity.y + CONFIG.holdThrustAccel, -this.maxVel, this.maxVel));
    }});
  }

  stopHold(){
    if (this.holdEvt) { this.holdEvt.remove(false); this.holdEvt = null; window.telemetry.emit('ship_thrust',{type:'hold_end'}); }
    this.thrusterEmitter.stop();
  }

  startNextSegment() {
    if (this.spawnTimer) {
      this.spawnTimer.remove(false);
    }
    // Pick a random segment
    this.currentSegment = this.segments[rng.intRange(0, this.segments.length - 1)];
    this.segmentTimer = 0;
    console.log("Starting segment:", this.currentSegment.type);

    // Segments have their own spawn rates
    let spawnRate = CONFIG.spawnIntervalMs;
    if (this.currentSegment.type === 'asteroid_wall') {
      spawnRate = 150; // Faster spawns for a wall
    }
    
    this.spawnTimer = this.time.addEvent({
      delay: spawnRate,
      loop: true,
      callback: this.spawnCycle,
      callbackScope: this
    });
  }

  spawnCycle() {
    // This function is now driven by the current segment
    const segment = this.currentSegment;
    if (!segment) return;

    switch (segment.type) {
      case 'safe_zone':
        // Do nothing
        break;
      case 'asteroid_field':
        if (rng.float() < segment.config.density) {
          this.spawnAsteroid();
        }
        // Occasionally spawn a powerup
        if (rng.float() < 0.05) { // 5% chance 
            this.spawnPowerup('shield');
        }
        break;
      case 'coin_line':
        // This is a simplification; a real implementation would spawn these over time
        // For now, we'll spawn one coin per cycle in the specified lane
        this.spawnCoin(segment.config.lane);
        break;
      case 'asteroid_wall':
        for (let i = 0; i < this.lanes.length; i++) {
          if (i !== segment.config.openLane) {
            this.spawnAsteroid(i);
          }
        }
        break;
    }
  }
  
  spawnAsteroid(laneIndex = null) {
    const lane = laneIndex !== null ? this.lanes[laneIndex] : this.lanes[rng.intRange(0, this.lanes.length - 1)];
    const a = this.asteroids.get(this.scale.width + 64, lane, 'asteroid');
    if (!a) return;
    a.setActive(true).setVisible(true);
    this.physics.world.enable(a);
    a.body.setAllowGravity(false);
    a.body.setCircle(a.width / 2);
    a.body.setVelocityX(CONFIG.asteroidSpeedBase - Math.floor(this.distance / 5));
  }

  spawnCoin(laneIndex = null) {
    const lane = laneIndex !== null ? this.lanes[laneIndex] : this.lanes[rng.intRange(0, this.lanes.length - 1)];
    const c = this.coins.get(this.scale.width + 64, lane, 'coin');
    if (!c) return;
    c.setActive(true).setVisible(true);
    this.physics.world.enable(c);
    c.body.setAllowGravity(false);
    c.body.setVelocityX(CONFIG.coinSpeedBase - Math.floor(this.distance / 6));
  }

  spawnPowerup(type) {
    const lane = this.lanes[rng.intRange(0, this.lanes.length - 1)];
    const key = `powerup_${type}`;
    const p = this.powerups.get(this.scale.width + 64, lane, key);
    if (!p) return;
    p.setActive(true).setVisible(true);
    this.physics.world.enable(p);
    p.body.setAllowGravity(false);
    p.body.setVelocityX(CONFIG.coinSpeedBase); // Move at a constant speed
    p._powerupType = type;
  }

  recycleGameObject(obj) {
      if (!obj) return;
      let group;
      if (obj.texture.key === 'asteroid') group = this.asteroids;
      else if (obj.texture.key === 'coin') group = this.coins;
      else if (obj.texture.key.startsWith('powerup')) group = this.powerups;
      else if (obj.texture.key === 'bullet') group = this.projectiles;
      
      if (group) {
          group.killAndHide(obj);
          if(obj.body) obj.body.enable = false;
      } else {
          obj.destroy();
      }
  }

  collectPowerup(player, powerup) {
    const type = powerup._powerupType;
    this.recycleGameObject(powerup);

    if (type === 'shield') {
      this.activateShield();
    }
  }

  activateShield() {
    if (this.isShielded) {
      // Reset timer if already shielded
      if (this.shieldTimer) this.shieldTimer.remove(false);
    }
    this.isShielded = true;

    // Add visual effect
    if (!this.shieldEffect) {
      this.shieldEffect = this.add.circle(this.player.x, this.player.y, 40, 0x00ff00, 0.3);
      this.shieldEffect.setDepth(5);
    }
    this.shieldEffect.setVisible(true);

    this.shieldTimer = this.time.delayedCall(5000, () => { // 5 second shield
      this.isShielded = false;
      this.shieldEffect.setVisible(false);
      this.updateShieldBar(0);
    }, [], this);
  }

  updateShieldBar(percentage) {
    this.hudShield.clear();
    if (percentage > 0) {
      this.hudShield.fillStyle(0x00ff00, 0.7);
      this.hudShield.fillRect(12, 80, 150 * percentage, 10);
    }
  }

  collectCoin( player, coin ){
    this.recycleGameObject(coin);
    this.state.credits = (this.state.credits||0) + 1;
    this.hudCoins.setText('Credits: '+this.state.credits);
    this.score += 10;
    this.hudScore.setText('Score: '+this.score);
    window.telemetry.emit('collect_coin',{score:this.score,credits:this.state.credits});
    saveState(this.state);
  }

  onHitAsteroid(player, asteroid){
    this.explosionEmitter.explode(16, asteroid.x, asteroid.y);
    this.recycleGameObject(asteroid);
    if (this.isShielded) {
      // Shield absorbs the hit
      return;
    }
    // No shield, end run
    this.endRun(false);
  }

  fireWeapon() {
    if (this.time.now < this.lastFired) {
      return;
    }
    const bullet = this.projectiles.get(this.player.x + 40, this.player.y, 'bullet');
    if (bullet) {
        bullet.setActive(true).setVisible(true);
        this.physics.world.enable(bullet);
        bullet.body.setAllowGravity(false);
        bullet.body.setVelocityX(800);
        this.lastFired = this.time.now + 300; // 300ms cooldown
    }
  }

  hitAsteroid(projectile, asteroid) {
    this.explosionEmitter.explode(16, asteroid.x, asteroid.y);
    this.recycleGameObject(projectile);
    this.recycleGameObject(asteroid);
    this.score += 25; // Bonus for destroying an asteroid
    this.hudScore.setText('Score: '+this.score);
  }

  revivePlayer() {
    this.scene.resume();
    // Move player back to a safe spot
    this.player.setPosition(160, this.scale.height / 2);
    this.player.setVelocity(0,0);
    // Give temporary shield
    this.activateShield();
    // Restart spawning
    this.startNextSegment();
  }

  endRun(viaRevive){
    // stop spawn
    if (this.spawnTimer) this.spawnTimer.remove(false);
    window.telemetry.emit('run_end',{distance:Math.floor(this.distance*100),score:this.score,revived:!!viaRevive});
    // reward coins based on distance and score
    const gained = Math.max(1, Math.floor(this.distance*0.1) + Math.floor(this.score/50));
    this.state.credits = (this.state.credits||0) + gained;
    saveState(this.state);
    // update best
    const dUnits = Math.floor(this.distance*100);
    if (dUnits > (this.state.best||0)) { this.state.best = dUnits; saveState(this.state); }
    
    // The logic for saving to the leaderboard will be moved to the GameOverScene
    
    // show summary
    this.scene.pause('Main');
    this.scene.launch('GameOverScene', { distance: dUnits, score: this.score });

    // Interstitial Ad Logic
    if (this.state.runsSinceLastAd >= 3) {
      window.showInterstitial();
      this.state.runsSinceLastAd = 0;
      saveState(this.state);
    }
  }

  update(time, delta){
    // gravity exists via arcade config; ensure player stays in viewport
    const H = this.scale.height;
    if (this.player.y < -128) this.player.y = -128;
    if (this.player.y > H+128) this.player.y = H+128;

    // increment distance (units per second scaled)
    this.distance += (delta/1000) * 1.0;
    this.hudDistance.setText('Distance: '+Math.floor(this.distance*100));

    // Make shield and thruster follow player
    if (this.shieldEffect && this.shieldEffect.visible) {
      this.shieldEffect.setPosition(this.player.x, this.player.y);
    }
    this.thrusterEmitter.setPosition(this.player.x - 20, this.player.y);

    // Update parallax starfield
    const W = this.scale.width;
    this.starLayers.forEach((layer, index) => {
      const speed = (index + 1) * 0.5;
      layer.getChildren().forEach(star => {
        star.x -= speed;
        if (star.x < -10) {
          star.x = W + 10;
          star.y = rng.intRange(0, this.scale.height);
        }
      });
    });

    // Update shield HUD
    if (this.shieldTimer && this.isShielded) {
      this.updateShieldBar(1 - this.shieldTimer.getProgress());
    }

    // Segment management
    this.segmentTimer += delta;
    if (this.currentSegment && this.segmentTimer > this.currentSegment.duration) {
      this.startNextSegment();
    }

    // Cleanup offscreen objects
    this.asteroids.getChildren().forEach(obj => { if (obj.active && obj.x < -64) this.recycleGameObject(obj); });
    this.coins.getChildren().forEach(obj => { if (obj.active && obj.x < -64) this.recycleGameObject(obj); });
    this.projectiles.getChildren().forEach(obj => { if (obj.active && obj.x > CONFIG.width + 64) this.recycleGameObject(obj); });

    // debug
    if (this.debugMode) {
      this.debugText.setText([
        `FPS:${Math.floor(this.game.loop.actualFps||0)}`,
        `Pos:${this.player.x.toFixed(1)},${this.player.y.toFixed(1)}`,
        `VelY:${this.player.body.velocity.y.toFixed(1)}`
      ]);
    } else { this.debugText.setText(''); }

    // basic fail safe if player goes too far off-screen
    if (this.player.y > this.scale.height + 200 || this.player.y < -200) {
      this.endRun(false);
    }
  }
}

class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data) {
    this.finalDistance = data.distance;
    this.finalScore = data.score;
  }

  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0.5)');
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.text(W / 2, H * 0.3, 'GAME OVER', { font: '48px Arial', fill: '#ff0000' }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.5, `Distance: ${this.finalDistance}`, { font: '24px Arial', fill: '#fff' }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.55, `Score: ${this.finalScore}`, { font: '24px Arial', fill: '#fff' }).setOrigin(0.5);

    const restartBtn = this.add.text(W / 2, H * 0.8, 'Restart', { font: '28px Arial', fill: '#0f0', backgroundColor: '#333', padding: { x: 15, y: 8 } })
      .setOrigin(0.5)
      .setInteractive();
      
    restartBtn.on('pointerdown', () => {
      document.getElementById('score-form').style.display = 'none';
      this.scene.stop('GameOverScene');
      this.scene.get('Main').scene.restart();
    });

    // Leaderboard form logic
    const scoreForm = document.getElementById('score-form');
    const nameInput = document.getElementById('playerNameInput');
    const submitBtn = document.getElementById('submitScoreBtn');
    scoreForm.style.display = 'none'; // Hide by default

    const showSubmitBtn = this.add.text(W / 2, H * 0.7, 'Submit Score', { font: '28px Arial', fill: '#fff', backgroundColor: '#333', padding: { x: 15, y: 8 } })
        .setOrigin(0.5)
        .setInteractive();

    showSubmitBtn.on('pointerdown', () => {
        scoreForm.style.display = 'block';
        showSubmitBtn.setVisible(false); // Hide button after clicking
    });

    const submitScoreHandler = () => {
      const playerName = nameInput.value || 'Player';
      const scores = JSON.parse(localStorage.getItem('space_runner_leaderboard') || '[]');
      scores.push({ name: playerName, score: this.finalScore });
      scores.sort((a, b) => b.score - a.score);
      localStorage.setItem('space_runner_leaderboard', JSON.stringify(scores.slice(0, 10)));
      
      scoreForm.style.display = 'none';
      // No need to remove listener if we hide the button
    };
    submitBtn.addEventListener('click', submitScoreHandler);

    const reviveBtn = this.add.text(W / 2, H * 0.6, 'Revive (Ad)', { font: '28px Arial', fill: '#ff0', backgroundColor: '#333', padding: { x: 15, y: 8 } })
      .setOrigin(0.5)
      .setInteractive();

    reviveBtn.on('pointerdown', () => {
      window.requestRewardedAd().then(result => {
        if (result.completed) {
          this.scene.stop('GameOverScene');
          this.scene.get('Main').revivePlayer();
        }
      }).catch(e => {
        // Ad not available or consent not given
        reviveBtn.setText('Revive N/A').disableInteractive();
      });
    });

    const shopBtn = this.add.text(W * 0.75, H * 0.9, 'Shop', { font: '28px Arial', fill: '#0af', backgroundColor: '#333', padding: { x: 15, y: 8 } })
      .setOrigin(0.5)
      .setInteractive();

    shopBtn.on('pointerdown', () => {
      this.scene.pause('GameOverScene');
      this.scene.launch('ShopScene');
    });

    const leaderboardBtn = this.add.text(W * 0.25, H * 0.9, 'Scores', { font: '28px Arial', fill: '#af0', backgroundColor: '#333', padding: { x: 15, y: 8 } })
      .setOrigin(0.5)
      .setInteractive();
    
    leaderboardBtn.on('pointerdown', () => {
        this.scene.pause('GameOverScene');
        this.scene.launch('LeaderboardScene');
    });
  }
}

class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  create() {
    this.state = loadSave();
    this.cameras.main.setBackgroundColor('#000033');
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.text(W / 2, H * 0.1, 'Shop', { font: '48px Arial', fill: '#fff' }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.2, `Credits: ${this.state.credits}`, { font: '24px Arial', fill: '#ffd700' }).setOrigin(0.5);

    // Thruster upgrade
    const thrusterLevel = this.state.upgrades?.thruster || 1;
    const thrusterCost = 50 * thrusterLevel;
    const upgradeBtn = this.add.text(W/2, H*0.4, `Upgrade Thruster (Lvl ${thrusterLevel}) - Cost: ${thrusterCost}`, { font: '24px Arial', fill: '#fff', backgroundColor: '#555', padding: {x:10,y:5} }).setOrigin(0.5).setInteractive();
    
    upgradeBtn.on('pointerdown', () => {
      if (this.state.credits >= thrusterCost) {
        this.state.credits -= thrusterCost;
        this.state.upgrades.thruster = thrusterLevel + 1;
        saveState(this.state);
        this.scene.restart(); // Refresh the shop
      } else {
        // Simple feedback for now
        upgradeBtn.setStyle({ fill: '#ff0000' });
        this.time.delayedCall(500, () => upgradeBtn.setStyle({ fill: '#fff' }));
      }
    });

    const backBtn = this.add.text(W / 2, H * 0.9, 'Back', { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive();
    backBtn.on('pointerdown', () => {
        this.scene.stop('ShopScene');
        this.scene.resume('GameOverScene');
    });
  }
}

class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('LeaderboardScene');
  }
  create() {
    this.cameras.main.setBackgroundColor('#330033');
    const W = this.scale.width;
    const H = this.scale.height;
    this.add.text(W / 2, H * 0.1, 'Leaderboard', { font: '48px Arial', fill: '#fff' }).setOrigin(0.5);

    const scores = JSON.parse(localStorage.getItem('space_runner_leaderboard') || '[]');
    scores.sort((a, b) => b.score - a.score); // Sort descending
    
    scores.slice(0, 10).forEach((entry, index) => {
      const y = H * 0.25 + (index * 40);
      this.add.text(W/2, y, `${index + 1}. ${entry.name} - ${entry.score}`, {font: '24px Arial', fill: '#fff'}).setOrigin(0.5);
    });

    const backBtn = this.add.text(W / 2, H * 0.9, 'Back', { font: '24px Arial', fill: '#fff' }).setOrigin(0.5).setInteractive();
    backBtn.on('pointerdown', () => {
      this.scene.stop('LeaderboardScene');
      this.scene.resume('GameOverScene');
    });
  }
}

// ===== Phaser Game config and startup =====
const phConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: CONFIG.width,
  height: CONFIG.height,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: CONFIG.gravityY }, debug: false } },
  scene: [Boot, Main, GameOverScene, ShopScene, LeaderboardScene]
};
const game = new Phaser.Game(phConfig);

// ===== UI hooks after DOM loaded =====
window.addEventListener('DOMContentLoaded', ()=> {
  const consentBtn = document.getElementById('consent-btn');
  const debugBtn = document.getElementById('debug-btn');
  // init global consent
  window._consent = (localStorage.getItem('sr_consent') === 'true') || true;
  function setConsent(val){ window._consent = !!val; localStorage.setItem('sr_consent', window._consent); consentBtn.textContent = window._consent ? 'REVOKE' : 'GIVE'; }
  setConsent(window._consent);
  consentBtn.onclick = ()=> setConsent(!window._consent);

  let dbg = false;
  debugBtn.onclick = ()=> { dbg = !dbg; debugBtn.textContent = dbg ? 'ON' : 'OFF'; game.scene.getScenes(true).forEach(s=>{ if(s.debugMode!==undefined) s.debugMode = dbg; }); };
});
