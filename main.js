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
function loadSave(){ try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : {credits:0,gems:0,upgrades:{},skins:[],best:0,dailyStamp:null} } catch(e){return {credits:0,gems:0,upgrades:{},skins:[],best:0,dailyStamp:null}; } }
function saveState(state){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

// ===== Phaser Game Scenes =====
class Boot extends Phaser.Scene {
  constructor(){ super('Boot'); }
  preload(){}
  create(){ this.scene.start('Main'); }
}

class Main extends Phaser.Scene {
  constructor(){ super('Main'); this.distance = 0; this.score = 0; this.state = loadSave(); }
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
  }

  create() {
    // world config
    this.scaleMode = Phaser.Scale.FIT; // visual, not used directly
    this.cameras.main.setBackgroundColor('#000');

    // world gravity set through arcade config in game config (we rely on it)
    const W = this.scale.width, H = this.scale.height;

    // starfield (decorative)
    this.stars = this.add.group();
    for(let i=0;i<120;i++){
      const x = Phaser.Math.Between(0, W*2);
      const y = Phaser.Math.Between(0, H);
      const s = this.add.image(x,y,'coin').setAlpha(0.05).setScale(0.2).setScrollFactor(0.2);
      this.stars.add(s);
    }

    // player
    this.player = this.physics.add.sprite(160, H/2, 'ship');
    this.player.setOrigin(0.1,0.5);
    this.player.body.setAllowGravity(true);
    this.player.setCollideWorldBounds(false);

    // HUD
    this.hudDistance = this.add.text(12,12,'Distance: 0',{font:'20px Arial', fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudScore = this.add.text(12,36,'Score: 0',{font:'18px Arial', fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudCoins = this.add.text(12,58,'Credits: '+this.state.credits,{font:'18px Arial', fill:'#ffd700'}).setScrollFactor(0).setDepth(10);

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
    this.asteroids = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: CONFIG.maxAsteroids });
    this.coins = this.physics.add.group({ classType: Phaser.GameObjects.Image, maxSize: CONFIG.maxCoins });

    // collisions
    this.physics.add.overlap(this.player, this.coins, (p,c)=>{ this.collectCoin(c); }, null, this);
    this.physics.add.overlap(this.player, this.asteroids, (p,a)=>{ this.onHitAsteroid(a); }, null, this);

    // spawn timer
    this.spawnTimer = this.time.addEvent({ delay: CONFIG.spawnIntervalMs, loop:true, callback:this.spawnCycle, callbackScope:this });

    // telemetry
    window.telemetry.emit('run_start',{ts:Date.now(), seed:CONFIG.seed});
    this.runStartTS = Date.now();

    // consent flag from global
    window._consent = window._consent ?? true;

    // clamp velocity safety
    this.maxVel = 1200;
  }

  _bindInput(){
    // keyboard
    this.input.keyboard.on('keydown-SPACE', ()=> this.inputMgr.callbacks.tap.forEach(cb=>cb()));
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
    this.player.setVelocityY(CONFIG.thrustVelocity);
    window.telemetry.emit('ship_thrust',{type:'tap'});
  }

  startHold(){
    if (this.holdEvt) return;
    window.telemetry.emit('ship_thrust',{type:'hold_start'});
    this.holdEvt = this.time.addEvent({ delay:50, loop:true, callback:()=> {
      this.player.setVelocityY(Phaser.Math.Clamp(this.player.body.velocity.y + CONFIG.holdThrustAccel, -this.maxVel, this.maxVel));
    }});
  }

  stopHold(){
    if (this.holdEvt) { this.holdEvt.remove(false); this.holdEvt = null; window.telemetry.emit('ship_thrust',{type:'hold_end'}); }
  }

  spawnCycle(){
    // spawn asteroid
    const H = this.scale.height;
    const y = rng.intRange(40, H-40);
    const a = this.asteroids.get(this.scale.width+64, y, 'asteroid');
    if (a) {
      a.setActive(true); a.setVisible(true);
      a.body?.setAllowGravity(false);
      a.setPosition(this.scale.width+48, y);
      this.physics.world.enable(a);
      a.body.setVelocityX(CONFIG.asteroidSpeedBase - Math.floor(this.distance/5));
      a.checkWorldBounds = true;
      a.outOfBoundsKill = true;
      a._pool = 'asteroid';
    }

    // random coin
    if (rng.float() < 0.45) {
      const cy = rng.intRange(80, H-80);
      const c = this.coins.get(this.scale.width+64, cy, 'coin');
      if (c) {
        c.setActive(true); c.setVisible(true);
        this.physics.world.enable(c);
        c.body.setAllowGravity(false);
        c.body.setVelocityX(CONFIG.coinSpeedBase - Math.floor(this.distance/6));
        c._pool = 'coin';
      }
    }

    // cleanup offscreen objects manually (pooling)
    this.asteroids.getChildren().forEach(obj => { if (obj.x < -64) this.recycle(obj); });
    this.coins.getChildren().forEach(obj => { if (obj.x < -64) this.recycle(obj); });
  }

  recycle(obj){
    try {
      obj.setActive(false); obj.setVisible(false);
      if (obj.body) { obj.body.stop(); obj.body.enable = false; obj.body = null; }
    } catch(e){}
  }

  collectCoin( player, coin ){
    try {
      coin.destroy(); // simple pooling fallback
    } catch(e){}
    this.state.credits = (this.state.credits||0) + 1;
    this.hudCoins.setText('Credits: '+this.state.credits);
    this.score += 10;
    this.hudScore.setText('Score: '+this.score);
    window.telemetry.emit('collect_coin',{score:this.score,credits:this.state.credits});
    saveState(this.state);
  }

  onHitAsteroid(player, asteroid){
    asteroid.destroy();
    // simple hit reaction: end run
    this.endRun(false);
  }

  endRun(viaRevive){
    // stop spawn
    this.spawnTimer.remove(false);
    window.telemetry.emit('run_end',{distance:Math.floor(this.distance*100),score:this.score,revived:!!viaRevive});
    // reward coins based on distance and score
    const gained = Math.max(1, Math.floor(this.distance*0.1) + Math.floor(this.score/50));
    this.state.credits = (this.state.credits||0) + gained;
    saveState(this.state);
    // update best
    const dUnits = Math.floor(this.distance*100);
    if (dUnits > (this.state.best||0)) { this.state.best = dUnits; saveState(this.state); }
    // show summary (simple alert for prototype)
    setTimeout(()=> {
      const doubleOffer = confirm(`Run ended. Distance: ${dUnits}\nCredits gained: ${gained}\nWatch ad to double?`);
      if (doubleOffer) {
        window.requestRewardedAd().then(()=> {
          this.state.credits += gained; saveState(this.state);
          alert('Reward doubled. Credits added.');
          location.reload();
        }).catch(()=> { alert('Ad unavailable or consent not given.'); location.reload(); });
      } else location.reload();
    }, 100);
  }

  update(time, delta){
    // gravity exists via arcade config; ensure player stays in viewport
    const H = this.scale.height;
    if (this.player.y < -128) this.player.y = -128;
    if (this.player.y > H+128) this.player.y = H+128;

    // increment distance (units per second scaled)
    this.distance += (delta/1000) * 1.0;
    this.hudDistance.setText('Distance: '+Math.floor(this.distance*100));

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

// ===== Phaser Game config and startup =====
const phConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: CONFIG.width,
  height: CONFIG.height,
  backgroundColor: '#000000',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: CONFIG.gravityY }, debug: false } },
  scene: [Boot, Main]
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
