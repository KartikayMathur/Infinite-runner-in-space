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
      if (!parsed.upgrades) parsed.upgrades = { thruster: 1 };
      loadedState = { ...loadedState, ...parsed };
    }
  } catch(e){
    // return default state on error
  }
  return loadedState;
}
function saveState(state){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }

// ===== Pooling helpers =====
function recycleGameObject(obj, group) {
  if (!obj || !group) return;
  group.killAndHide(obj);
  if (obj.body) {
    obj.body.stop();
    obj.body.enable = false;
  }
}

function reviveForReuse(obj, x, y) {
  obj.setActive(true).setVisible(true);
  if (obj.body) {
    obj.body.enable = true;
    obj.body.reset(x, y);
  } else {
    // This path should not be hit if groups are configured correctly
    this.physics.world.enable(obj);
    obj.body.reset(x, y);
  }
  return obj;
}

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
    this.lanes = [ CONFIG.height * 0.2, CONFIG.height * 0.4, CONFIG.height * 0.6, CONFIG.height * 0.8 ];
    this.segments = [
      { type: 'safe_zone', duration: 2000 },
      { type: 'asteroid_field', duration: 5000, config: { density: 0.7 } },
      { type: 'coin_line', duration: 3000, config: { lane: 1, length: 10 } },
      { type: 'asteroid_wall', duration: 1000, config: { openLane: 2 } }
    ];
    this.currentSegment = null;
    this.segmentTimer = 0;
  }
  preload(){
    const g = this.make.graphics({add:false});
    g.fillStyle(0x99d9ff,1); g.fillTriangle(0,32,48,16,0,0); g.fillStyle(0xffaa33,1); g.fillRect(48,12,10,8); g.generateTexture('ship',60,40);
    const a = this.make.graphics({add:false}); a.fillStyle(0x888888,1); a.fillCircle(16,16,16); a.generateTexture('asteroid',32,32);
    const c = this.make.graphics({add:false}); c.fillStyle(0xffd700,1); c.fillCircle(8,8,8); c.generateTexture('coin',16,16);
    const p = this.make.graphics({add:false}); p.fillStyle(0x00ff00,1); p.fillCircle(16,16,16); p.generateTexture('powerup_shield',32,32);
    const b = this.make.graphics({add:false}); b.fillStyle(0xffffff,1); b.fillRect(0,0,10,4); b.generateTexture('bullet',10,4);
    const part = this.make.graphics({add:false}); part.fillStyle(0xffffff,1); part.fillCircle(2,2,2); part.generateTexture('particle',4,4);
    [g,a,c,p,b,part].forEach(i=>i.destroy());
  }

  create() {
    const W = this.scale.width, H = this.scale.height;
    this.cameras.main.setBackgroundColor('#000');
    this.starLayers = [ this.add.group(), this.add.group() ];
    this.starLayers[0].createMultiple({key:'coin', frameQuantity:60, active:false, visible:false}).forEach(s => s.setPosition(rng.intRange(0,W),rng.intRange(0,H)).setAlpha(rng.float()*0.5).setScale(rng.float()*0.2));
    this.starLayers[1].createMultiple({key:'coin', frameQuantity:40}).forEach(s => s.setPosition(rng.intRange(0,W),rng.intRange(0,H)).setAlpha(0.5+rng.float()*0.5).setScale(0.2+rng.float()*0.2));
    this.player = this.physics.add.sprite(160, H/2, 'ship');
    this.player.setOrigin(0.1,0.5).body.setAllowGravity(true).setCollideWorldBounds(false).setSize(48,32).setOffset(0,0);
    this.hudDistance = this.add.text(12,12,'Distance: 0',{font:'20px Arial',fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudScore = this.add.text(12,36,'Score: 0',{font:'18px Arial',fill:'#fff'}).setScrollFactor(0).setDepth(10);
    this.hudCoins = this.add.text(12,58,'Credits: '+this.state.credits,{font:'18px Arial',fill:'#ffd700'}).setScrollFactor(0).setDepth(10);
    this.hudShield = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.updateShieldBar(0);
    this.debugText = this.add.text(12,90,'',{font:'12px monospace',fill:'#0f0'}).setScrollFactor(0).setDepth(10);
    this.debugMode = CONFIG.debug;
    this._bindInput();
    this.asteroids = this.physics.add.group({ defaultKey: 'asteroid', maxSize: 24 });
    this.coins = this.physics.add.group({ defaultKey: 'coin', maxSize: 32 });
    this.powerups = this.physics.add.group({ defaultKey: 'powerup_shield', maxSize: 5 });
    this.projectiles = this.physics.add.group({ defaultKey: 'bullet', maxSize: 15 });
    this.isShielded = false;
    this.lastFired = 0;
    this.physics.add.overlap(this.player,this.coins,(p,c)=>this.collectCoin(c),null,this);
    this.physics.add.overlap(this.player,this.powerups,(p,pu)=>this.collectPowerup(pu),null,this);
    this.physics.add.collider(this.player,this.asteroids,(p,a)=>this.onHitAsteroid(a),null,this);
    this.physics.add.overlap(this.projectiles,this.asteroids,(proj,ast)=>this.hitAsteroid(proj,ast),null,this);
    this.startNextSegment();
    window.telemetry.emit('run_start',{ts:Date.now(),seed:CONFIG.seed});
    this.runStartTS = Date.now();
    this.state.runsSinceLastAd = (this.state.runsSinceLastAd || 0) + 1;
    saveState(this.state);
    this.maxVel = 1200;
    this.explosionEmitter = this.add.particles(0,0,'particle',{speed:{min:-100,max:100},angle:{min:0,max:360},scale:{start:1,end:0},blendMode:'ADD',lifespan:400,gravityY:0,frequency:-1}).setDepth(20);
    this.thrusterEmitter = this.add.particles(0,0,'particle',{x:{min:-10,max:10},y:{min:-10,max:10},speed:{min:100,max:200},angle:{min:170,max:190},scale:{start:0.5,end:0},blendMode:'SCREEN',lifespan:200,gravityY:0,on:false}).setDepth(1);
  }
  _bindInput(){
    this.input.keyboard.on('keydown-X',()=>this.fireWeapon());
    this.input.on('pointerdown',()=>this.thrustTap());
    this.input.on('pointerup',()=>this.stopHold());
  }
  thrustTap(){
    const thrustPower = CONFIG.thrustVelocity - ((this.state.upgrades?.thruster||1)-1)*25;
    this.player.setVelocityY(thrustPower);
    this.thrusterEmitter.start();
    this.time.delayedCall(150,()=>this.thrusterEmitter.stop());
  }
  startHold(){ this.thrusterEmitter.start(); }
  stopHold(){ this.thrusterEmitter.stop(); }
  startNextSegment(){
    if(this.spawnTimer)this.spawnTimer.remove(false);
    this.currentSegment = this.segments[rng.intRange(0,this.segments.length-1)];
    this.segmentTimer = 0;
    let spawnRate = CONFIG.spawnIntervalMs;
    if(this.currentSegment.type==='asteroid_wall')spawnRate=150;
    this.spawnTimer = this.time.addEvent({delay:spawnRate,loop:true,callback:this.spawnCycle,callbackScope:this});
  }
  spawnCycle(){
    const segment = this.currentSegment;
    if(!segment)return;
    switch(segment.type){
      case 'asteroid_field': if(rng.float()<segment.config.density)this.spawnAsteroid(); if(rng.float()<0.05)this.spawnPowerup('shield'); break;
      case 'coin_line': this.spawnCoin(segment.config.lane); break;
      case 'asteroid_wall': for(let i=0;i<this.lanes.length;i++){if(i!==segment.config.openLane)this.spawnAsteroid(i);} break;
    }
  }
  spawnAsteroid(laneIndex=null){ const y=laneIndex!==null?this.lanes[laneIndex]:this.lanes[rng.intRange(0,this.lanes.length-1)]; const x=this.scale.width+64; const a=this.asteroids.get(x,y); if(!a)return; reviveForReuse.call(this,a,x,y); a.body.setAllowGravity(false).setCircle(a.width/2).setVelocityX(CONFIG.asteroidSpeedBase-Math.floor(this.distance/5));}
  spawnCoin(laneIndex=null){ const y=laneIndex!==null?this.lanes[laneIndex]:this.lanes[rng.intRange(0,this.lanes.length-1)]; const x=this.scale.width+64; const c=this.coins.get(x,y); if(!c)return; reviveForReuse.call(this,c,x,y); c.body.setAllowGravity(false).setVelocityX(CONFIG.coinSpeedBase-Math.floor(this.distance/6));}
  spawnPowerup(type){ const y=this.lanes[rng.intRange(0,this.lanes.length-1)]; const x=this.scale.width+64; const p=this.powerups.get(x,y,`powerup_${type}`); if(!p)return; reviveForReuse.call(this,p,x,y); p.body.setAllowGravity(false).setVelocityX(CONFIG.coinSpeedBase); p._powerupType=type;}
  collectPowerup(player,powerup){ const type=powerup._powerupType; recycleGameObject(powerup, this.powerups); if(type==='shield')this.activateShield(); }
  activateShield(){ if(this.isShielded&&this.shieldTimer)this.shieldTimer.remove(false); this.isShielded=true; if(!this.shieldEffect)this.shieldEffect=this.add.circle(this.player.x,this.player.y,40,0x00ff00,0.3).setDepth(5); this.shieldEffect.setVisible(true); this.shieldTimer=this.time.delayedCall(5000,()=>{this.isShielded=false;this.shieldEffect.setVisible(false);this.updateShieldBar(0);},[],this); }
  updateShieldBar(percentage){ this.hudShield.clear(); if(percentage>0)this.hudShield.fillStyle(0x00ff00,0.7).fillRect(12,80,150*percentage,10); }
  collectCoin(player,coin){ recycleGameObject(coin, this.coins); this.state.credits=(this.state.credits||0)+1; this.hudCoins.setText('Credits: '+this.state.credits); this.score+=10; this.hudScore.setText('Score: '+this.score); saveState(this.state); }
  onHitAsteroid(player,asteroid){ this.explosionEmitter.explode(16,asteroid.x,asteroid.y); recycleGameObject(asteroid, this.asteroids); if(this.isShielded)return; this.endRun(false); }
  fireWeapon(){ if(this.time.now<this.lastFired)return; const bullet=this.projectiles.get(this.player.x+40,this.player.y); if(!bullet)return; reviveForReuse.call(this,bullet,this.player.x+40,this.player.y); bullet.body.setAllowGravity(false).setVelocityX(800); this.lastFired=this.time.now+300; }
  hitAsteroid(projectile,asteroid){ this.explosionEmitter.explode(16,asteroid.x,asteroid.y); recycleGameObject(projectile, this.projectiles); recycleGameObject(asteroid, this.asteroids); this.score+=25; this.hudScore.setText('Score: '+this.score); }
  revivePlayer(){ this.scene.resume(); this.player.setPosition(160,this.scale.height/2).setVelocity(0,0); this.activateShield(); this.startNextSegment(); }
  endRun(viaRevive){ if(this.spawnTimer)this.spawnTimer.remove(false); window.telemetry.emit('run_end',{distance:Math.floor(this.distance*100),score:this.score,revived:!!viaRevive}); const gained=Math.max(1,Math.floor(this.distance*0.1)+Math.floor(this.score/50)); this.state.credits=(this.state.credits||0)+gained; saveState(this.state); const dUnits=Math.floor(this.distance*100); if(dUnits>(this.state.best||0)){this.state.best=dUnits;saveState(this.state);} this.scene.pause('Main'); this.scene.launch('GameOverScene',{distance:dUnits,score:this.score}); if(this.state.runsSinceLastAd>=3){window.showInterstitial();this.state.runsSinceLastAd=0;saveState(this.state);} }
  update(time,delta){ if(this.player.y<-128||this.player.y>this.scale.height+128)this.endRun(false); this.distance+=(delta/1000)*1.0; this.hudDistance.setText('Distance: '+Math.floor(this.distance*100)); if(this.shieldEffect&&this.shieldEffect.visible)this.shieldEffect.setPosition(this.player.x,this.player.y); this.thrusterEmitter.setPosition(this.player.x-20,this.player.y); const W=this.scale.width; this.starLayers.forEach((layer,index)=>{const speed=(index+1)*0.5;layer.getChildren().forEach(star=>{star.x-=speed;if(star.x<-10){star.x=W+10;star.y=rng.intRange(0,this.scale.height);}});}); if(this.shieldTimer&&this.isShielded)this.updateShieldBar(1-this.shieldTimer.getProgress()); this.segmentTimer+=delta; if(this.currentSegment&&this.segmentTimer>this.currentSegment.duration)this.startNextSegment(); this.asteroids.getChildren().forEach(obj=>{if(obj.active&&obj.x<-64)recycleGameObject(obj,this.asteroids);}); this.coins.getChildren().forEach(obj=>{if(obj.active&&obj.x<-64)recycleGameObject(obj,this.coins);}); this.projectiles.getChildren().forEach(obj=>{if(obj.active&&obj.x>CONFIG.width+64)recycleGameObject(obj,this.projectiles);}); if(this.debugMode)this.debugText.setText([`FPS:${Math.floor(this.game.loop.actualFps||0)}`,`Pos:${this.player.x.toFixed(1)},${this.player.y.toFixed(1)}`,`VelY:${this.player.body.velocity.y.toFixed(1)}`]);else this.debugText.setText(''); if(this.player.y>this.scale.height+200||this.player.y<-200)this.endRun(false); }
}

class GameOverScene extends Phaser.Scene {
  constructor(){super('GameOverScene');}
  init(data){this.finalDistance=data.distance;this.finalScore=data.score;}
  create(){
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0.5)');
    const W=this.scale.width,H=this.scale.height;
    this.add.text(W/2,H*0.3,'GAME OVER',{font:'48px Arial',fill:'#ff0000'}).setOrigin(0.5);
    this.add.text(W/2,H*0.5,`Distance: ${this.finalDistance}`,{font:'24px Arial',fill:'#fff'}).setOrigin(0.5);
    this.add.text(W/2,H*0.55,`Score: ${this.finalScore}`,{font:'24px Arial',fill:'#fff'}).setOrigin(0.5);
    const restartBtn=this.add.text(W/2,H*0.8,'Restart',{font:'28px Arial',fill:'#0f0',backgroundColor:'#333',padding:{x:15,y:8}}).setOrigin(0.5).setInteractive();
    restartBtn.on('pointerdown',()=>{document.getElementById('score-form').style.display='none';this.scene.stop('GameOverScene');this.scene.get('Main').scene.restart();});
    const scoreForm=document.getElementById('score-form');
    const nameInput=document.getElementById('playerNameInput');
    const submitBtn=document.getElementById('submitScoreBtn');
    scoreForm.style.display='none';
    const showSubmitBtn=this.add.text(W/2,H*0.7,'Submit Score',{font:'28px Arial',fill:'#fff',backgroundColor:'#333',padding:{x:15,y:8}}).setOrigin(0.5).setInteractive();
    showSubmitBtn.on('pointerdown',()=>{scoreForm.style.display='block';showSubmitBtn.setVisible(false);});
    const submitScoreHandler=()=>{const playerName=nameInput.value||'Player';const scores=JSON.parse(localStorage.getItem('space_runner_leaderboard')||'[]');scores.push({name:playerName,score:this.finalScore});scores.sort((a,b)=>b.score-a.score);localStorage.setItem('space_runner_leaderboard',JSON.stringify(scores.slice(0,10)));scoreForm.style.display='none';};
    submitBtn.addEventListener('click',submitScoreHandler);
    const reviveBtn=this.add.text(W/2,H*0.6,'Revive (Ad)',{font:'28px Arial',fill:'#ff0',backgroundColor:'#333',padding:{x:15,y:8}}).setOrigin(0.5).setInteractive();
    reviveBtn.on('pointerdown',()=>{window.requestRewardedAd().then(result=>{if(result.completed){this.scene.stop('GameOverScene');this.scene.get('Main').revivePlayer();}}).catch(e=>{reviveBtn.setText('Revive N/A').disableInteractive();});});
    const shopBtn=this.add.text(W*0.75,H*0.9,'Shop',{font:'28px Arial',fill:'#0af',backgroundColor:'#333',padding:{x:15,y:8}}).setOrigin(0.5).setInteractive();
    shopBtn.on('pointerdown',()=>{this.scene.pause('GameOverScene');this.scene.launch('ShopScene');});
    const leaderboardBtn=this.add.text(W*0.25,H*0.9,'Scores',{font:'28px Arial',fill:'#af0',backgroundColor:'#333',padding:{x:15,y:8}}).setOrigin(0.5).setInteractive();
    leaderboardBtn.on('pointerdown',()=>{this.scene.pause('GameOverScene');this.scene.launch('LeaderboardScene');});
  }
}

class ShopScene extends Phaser.Scene {
  constructor(){super('ShopScene');}
  create(){
    this.state=loadSave();
    this.cameras.main.setBackgroundColor('#000033');
    const W=this.scale.width,H=this.scale.height;
    this.add.text(W/2,H*0.1,'Shop',{font:'48px Arial',fill:'#fff'}).setOrigin(0.5);
    this.add.text(W/2,H*0.2,`Credits: ${this.state.credits}`,{font:'24px Arial',fill:'#ffd700'}).setOrigin(0.5);
    const thrusterLevel=this.state.upgrades?.thruster||1;
    const thrusterCost=50*thrusterLevel;
    const upgradeBtn=this.add.text(W/2,H*0.4,`Upgrade Thruster (Lvl ${thrusterLevel}) - Cost: ${thrusterCost}`,{font:'24px Arial',fill:'#fff',backgroundColor:'#555',padding:{x:10,y:5}}).setOrigin(0.5).setInteractive();
    upgradeBtn.on('pointerdown',()=>{if(this.state.credits>=thrusterCost){this.state.credits-=thrusterCost;this.state.upgrades.thruster=thrusterLevel+1;saveState(this.state);this.scene.restart();}else{upgradeBtn.setStyle({fill:'#ff0000'});this.time.delayedCall(500,()=>upgradeBtn.setStyle({fill:'#fff'}));}});
    const backBtn=this.add.text(W/2,H*0.9,'Back',{font:'24px Arial',fill:'#fff'}).setOrigin(0.5).setInteractive();
    backBtn.on('pointerdown',()=>{this.scene.stop('ShopScene');this.scene.resume('GameOverScene');});
  }
}

class LeaderboardScene extends Phaser.Scene {
  constructor(){super('LeaderboardScene');}
  create(){
    this.cameras.main.setBackgroundColor('#330033');
    const W=this.scale.width,H=this.scale.height;
    this.add.text(W/2,H*0.1,'Leaderboard',{font:'48px Arial',fill:'#fff'}).setOrigin(0.5);
    const scores=JSON.parse(localStorage.getItem('space_runner_leaderboard')||'[]');
    scores.sort((a,b)=>b.score-a.score);
    scores.slice(0,10).forEach((entry,index)=>{const y=H*0.25+(index*40);this.add.text(W/2,y,`${index+1}. ${entry.name} - ${entry.score}`,{font:'24px Arial',fill:'#fff'}).setOrigin(0.5);});
    const backBtn=this.add.text(W/2,H*0.9,'Back',{font:'24px Arial',fill:'#fff'}).setOrigin(0.5).setInteractive();
    backBtn.on('pointerdown',()=>{this.scene.stop('LeaderboardScene');this.scene.resume('GameOverScene');});
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
