import { Engine, Scene, HavokPlugin, Vector3 } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import '@babylonjs/loaders/OBJ';
import { createArena } from './scenes/ArenaScene.js';
import { getTrackById, getModeById, getDefaultTrackForMode } from './game/TrackRegistry.js';
import { CarController } from './game/CarController.js';
import { WeaponsSystem } from './game/WeaponsSystem.js';
import { AIManager } from './game/AIManager.js';
import { HUDController } from './ui/HUDController.js';
import { AudioManager } from './game/AudioManager.js';
import { characterManager, RACES } from './game/CharacterManager.js';
import { CharacterCreation } from './ui/CharacterCreation.js';
import { CarShop, shopState, COINS_PER_KILL, COINS_SURVIVAL_BONUS } from './ui/CarShop.js';
import { CombatTargeting } from './game/CombatTargeting.js';
import { GameFlowUI } from './ui/GameFlowUI.js';
import { RaceManager } from './game/RaceManager.js';

// DOM refs
const canvas = document.getElementById('renderCanvas');
const loadingScreen = document.getElementById('loadingScreen');
const loadBar = document.getElementById('loadBar');
const loadText = document.getElementById('loadText');
const mainMenu = document.getElementById('mainMenu');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('gameOver');

/** Portal Super Engine embed (?embed=1 from grudge-studio.com) */
const IS_EMBED = (() => {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1'
      || window.self !== window.top;
  } catch {
    return true;
  }
})();

let engine, scene, havokInstance;
let player, weapons, aiManager, hudCtrl, audio;
let charCreation, carShop, combat, gameFlowUI, raceManager;
let gameState = 'loading'; // loading | menu | creating | shop | lobby | playing | dead | results
let _currentGameMode = 'drag';
let _currentTrackId = 'drag_strip';
let _weaponsEnabled = true;
let _survivalCoinTimer = 0;
let _lastResult = null;

if (IS_EMBED) {
  document.documentElement.classList.add('grudge-embed');
  document.body.classList.add('grudge-embed');
}

function updateLoad(pct, text) {
  loadBar.style.width = `${pct}%`;
  loadText.textContent = text;
}

function showHudMessage(msg, ms = 1500) {
  const el = document.getElementById('hudMessage');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showHudMessage._t);
  showHudMessage._t = setTimeout(() => el.classList.remove('show'), ms);
}

function updateMenuForCharacter() {
  const btnCreate = document.getElementById('btnCreate');
  const btnChange = document.getElementById('btnChange');
  const charInfo = document.getElementById('menuCharInfo');
  const charName = document.getElementById('menuCharName');
  const charDetail = document.getElementById('menuCharDetail');
  const charPortrait = document.getElementById('menuCharPortrait');

  if (characterManager.hasCharacter) {
    const c = characterManager.character;
    const race = characterManager.getRace();
    const cls = characterManager.getClass();
    btnCreate.style.display = 'none';
    btnChange.style.display = '';
    charInfo.classList.add('active');
    charName.textContent = c.name;
    charDetail.textContent = `${race.name} ${cls.name}`;
    if (c.portraitDataUrl) {
      charPortrait.innerHTML = `<img src="${c.portraitDataUrl}" alt="" />`;
    } else {
      charPortrait.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#444;font-size:2rem">?</div>`;
    }
  } else {
    btnCreate.style.display = '';
    btnChange.style.display = 'none';
    charInfo.classList.remove('active');
  }
}

async function openCharacterCreation() {
  mainMenu.classList.add('hidden');
  gameState = 'creating';
  await charCreation.show();
  updateMenuForCharacter();
  mainMenu.classList.remove('hidden');
  gameState = 'menu';
}

async function init() {
  updateLoad(10, 'Loading physics engine...');
  havokInstance = await HavokPhysics();

  updateLoad(40, 'Initializing renderer...');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.04, 0.05, 1);

  updateLoad(60, 'Loading UI...');
  charCreation = new CharacterCreation();
  carShop = new CarShop();
  gameFlowUI = new GameFlowUI();

  await characterManager.load();
  await shopState.load();

  updateLoad(100, 'Ready!');
  await new Promise(r => setTimeout(r, 350));

  loadingScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';

  engine.runRenderLoop(() => {
    if ((gameState === 'playing' || gameState === 'countdown') && player) {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      player.update(dt);
      if (_weaponsEnabled && weapons) weapons.update(dt);
      if (combat) combat.update(dt);
      if (aiManager) aiManager.update(dt);
      if (raceManager) raceManager.update(dt);
      if (hudCtrl) hudCtrl.update();
      updateRaceHud();
      updateHudCoins();

      if (_currentGameMode === 'battle') {
        _survivalCoinTimer += dt;
        if (_survivalCoinTimer >= 30) {
          _survivalCoinTimer -= 30;
          shopState.addCoins(COINS_SURVIVAL_BONUS);
        }
        if (player.health <= 0 && gameState === 'playing') {
          gameState = 'dead';
          showGameOver({ title: 'WRECKED', reason: 'battle' });
        }
      }
    }
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
}

/**
 * Build a fresh scene for the selected mode/track.
 */
async function buildGameScene(trackId, modeId) {
  if (scene) scene.dispose();

  scene = new Scene(engine);
  const havokPlugin = new HavokPlugin(true, havokInstance);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
  scene.collisionsEnabled = true;
  scene.clearColor.set(0.04, 0.04, 0.05, 1);

  const trackDef = getTrackById(trackId);
  const modeDef = getModeById(modeId);
  _weaponsEnabled = !!modeDef.weapons;

  await createArena(scene, trackDef?.glbFile || null, {
    arenaType: trackDef?.arenaType || (trackDef?.glbFile ? 'glb' : 'flat'),
    finishDistance: trackDef?.finishDistance || 402,
  });

  audio = new AudioManager(scene);

  const spawn0 = trackDef.spawns?.[0] || { x: 0, y: 1.2, z: 0 };
  player = new CarController(scene, audio);
  await player.init(spawn0);
  player.setSpawn(spawn0.x, spawn0.y, spawn0.z);

  weapons = new WeaponsSystem(scene, player, audio);

  const botCount = modeDef.botCount ?? trackDef.npcCount ?? 0;
  aiManager = new AIManager(scene, player, weapons, audio);
  await aiManager.spawnBots(botCount, {
    mode: modeId,
    spawns: trackDef.spawns,
    finishDistance: trackDef.finishDistance || 402,
    startZ: spawn0.z,
  });

  combat = null;
  if (_weaponsEnabled) {
    try {
      combat = new CombatTargeting(scene, player, aiManager);
    } catch (_) { combat = null; }
  }

  hudCtrl = new HUDController(player, weapons);
  if (aiManager) aiManager.onBotKilled(() => {
    hudCtrl.addKill();
    shopState.addCoins(COINS_PER_KILL);
  });

  applyShopUpgrades();

  // Toggle weapon HUD visibility for race modes
  const weaponHud = document.querySelector('.hud-weapons');
  if (weaponHud) weaponHud.style.display = _weaponsEnabled ? '' : 'none';
  const killHud = document.getElementById('killCount')?.parentElement;
  // race hud panel
  ensureRaceHud();
}

function ensureRaceHud() {
  let el = document.getElementById('raceHud');
  if (!el) {
    el = document.createElement('div');
    el.id = 'raceHud';
    el.innerHTML = `
      <div class="rh-time" id="rhTime">0:00.00</div>
      <div class="rh-meta">
        <span id="rhPlace">P1</span>
        <span id="rhDist"></span>
        <span id="rhLaps"></span>
      </div>`;
    document.getElementById('hud')?.appendChild(el);
    if (!document.getElementById('raceHudStyle')) {
      const s = document.createElement('style');
      s.id = 'raceHudStyle';
      s.textContent = `
#raceHud{position:absolute;top:20px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;display:none}
#raceHud.active{display:block}
#raceHud .rh-time{font-family:'Cinzel Decorative',serif;font-size:1.8rem;font-weight:900;color:#c9952a;text-shadow:0 0 18px rgba(201,149,42,.4)}
#raceHud .rh-meta{display:flex;gap:16px;justify-content:center;margin-top:4px;font-size:.7rem;letter-spacing:.12em;color:#888}
#raceHud .rh-meta span{color:#aaa}
`;
      document.head.appendChild(s);
    }
  }
  const isRace = _currentGameMode !== 'battle';
  el.classList.toggle('active', isRace);
}

function updateRaceHud() {
  if (!raceManager?.active) return;
  const st = raceManager.getHudState();
  if (!st) return;
  const t = document.getElementById('rhTime');
  const p = document.getElementById('rhPlace');
  const d = document.getElementById('rhDist');
  const l = document.getElementById('rhLaps');
  if (t) t.textContent = st.timeStr;
  if (p) p.textContent = `P${st.place}`;
  if (d) {
    if (_currentGameMode === 'drag' || _currentGameMode === 'timeAttack') {
      d.textContent = `${Math.round(st.distLeft)}m`;
    } else {
      d.textContent = st.lead >= 0 ? `+${Math.round(st.lead)}m` : `${Math.round(st.lead)}m`;
    }
  }
  if (l) {
    l.textContent = raceManager.mode === 'race'
      ? `LAP ${Math.min(st.laps + 1, st.lapsRequired)}/${st.lapsRequired}`
      : '';
  }
}

async function launchMatch(result) {
  _currentGameMode = result.mode || 'drag';
  _currentTrackId = result.trackId || getDefaultTrackForMode(_currentGameMode).id;

  mainMenu.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  updateLoad(15, 'Building track...');

  await buildGameScene(_currentTrackId, _currentGameMode);
  updateLoad(55, 'Loading vehicle...');

  if (result.raceId) {
    await player.setCharacterColors(result.raceId, 'warrior');
  }
  if (result.kartId) {
    await player.setKart(result.kartId);
  }

  updateLoad(85, 'Staging...');
  await new Promise(r => setTimeout(r, 200));
  loadingScreen.classList.add('hidden');

  hud.classList.add('active');
  canvas.focus();

  // Race manager for non-battle modes
  raceManager = new RaceManager({
    mode: _currentGameMode,
    track: getTrackById(_currentTrackId),
    player,
    aiManager,
    onMessage: showHudMessage,
    onFinish: (res) => {
      _lastResult = res;
      gameState = 'results';
      const win = res.winner === 'player';
      showGameOver({
        title: win ? 'VICTORY' : 'DEFEATED',
        reason: 'race',
        result: res,
      });
    },
  });

  startGame();
  raceManager.begin();
  if (raceManager.active) gameState = 'countdown';
}

function applyShopUpgrades() {
  const s = shopState.getStats();
  if (player) player.applyUpgrades(s);
  if (weapons) weapons.applyUpgrades(s);
}

function updateHudCoins() {
  const el = document.getElementById('hudCoins');
  if (el) el.textContent = shopState.coins;
}

function startGame() {
  gameState = 'playing';
  _survivalCoinTimer = 0;
  applyShopUpgrades();
  if (player) player.reset({ useSpawn: true });
  if (weapons) weapons.reset();
  if (combat) combat.reset();
  if (aiManager) aiManager.reset();
  if (hudCtrl) {
    hudCtrl.reset();
    hudCtrl._loadDriverInfo?.();
  }
  updateHudCoins();
  // Don't force pointer lock for drag/race (keyboard focused)
  if (_weaponsEnabled) canvas.requestPointerLock?.();
}

function showGameOver({ title = 'WRECKED', reason = 'battle', result = null } = {}) {
  hud.classList.remove('active');
  gameOverScreen.classList.add('active');
  const h2 = gameOverScreen.querySelector('h2');
  if (h2) {
    h2.textContent = title;
    h2.style.color = title === 'VICTORY' ? '#c9952a' : '#cc3333';
  }

  let stats = '';
  if (reason === 'race' && result) {
    stats = `Time: ${result.timeStr} · Place: P${result.place}`;
    if (result.winner === 'player') {
      const bonus = _currentGameMode === 'drag' ? 40 : 25;
      shopState.addCoins(bonus);
      stats += ` · +${bonus} coins`;
    }
  } else if (hudCtrl) {
    stats = `Eliminations: ${hudCtrl.kills} | Survived: ${Math.floor(hudCtrl.survivalTime)}s | +${hudCtrl.kills * COINS_PER_KILL} coins`;
  }
  const goStats = document.getElementById('goStats');
  if (goStats) goStats.textContent = stats;
  document.exitPointerLock?.();
}

// ── Menu buttons ────────────────────────────────────────────────────

document.getElementById('btnPlay').addEventListener('click', async () => {
  mainMenu.classList.add('hidden');
  gameState = 'lobby';

  const preset = {};
  if (characterManager.hasCharacter) {
    preset.raceId = characterManager.character.raceId;
  }
  // Default highlight: Drag Race (PvP production mode)
  preset.mode = 'drag';

  const result = await gameFlowUI.show(preset);
  if (!result) {
    mainMenu.classList.remove('hidden');
    gameState = 'menu';
    return;
  }
  await launchMatch(result);
});

// Quick play drag from optional secondary button
const btnQuick = document.getElementById('btnQuickDrag');
if (btnQuick) {
  btnQuick.addEventListener('click', async () => {
    mainMenu.classList.add('hidden');
    const raceId = characterManager.hasCharacter ? characterManager.character.raceId : 'wk';
    await launchMatch({
      mode: 'drag',
      trackId: 'drag_strip',
      raceId,
      kartId: 'drag_racer',
    });
  });
}

document.getElementById('btnCreate').addEventListener('click', () => openCharacterCreation());
document.getElementById('btnChange').addEventListener('click', async () => {
  await characterManager.clear();
  openCharacterCreation();
});

document.getElementById('btnControls').addEventListener('click', () => {
  alert(
    'WASD / Arrows — Drive\n' +
    'SPACE — Handbrake\n' +
    'SHIFT or E — Nitro\n' +
    'Mouse — Aim (battle)\n' +
    'Left Click — Fire (battle)\n' +
    '1 / 2 / 3 — Switch Weapon'
  );
});

document.getElementById('btnShop').addEventListener('click', () => {
  mainMenu.classList.add('hidden');
  gameState = 'shop';
  carShop.show();
  const obs = new MutationObserver(() => {
    if (!document.getElementById('carShop').classList.contains('active')) {
      obs.disconnect();
      applyShopUpgrades();
      mainMenu.classList.remove('hidden');
      updateMenuForCharacter();
      gameState = 'menu';
    }
  });
  obs.observe(document.getElementById('carShop'), { attributes: true, attributeFilter: ['class'] });
});

document.getElementById('btnRestart').addEventListener('click', async () => {
  gameOverScreen.classList.remove('active');
  // Relaunch same mode
  await launchMatch({
    mode: _currentGameMode,
    trackId: _currentTrackId,
    raceId: characterManager.hasCharacter ? characterManager.character.raceId : 'wk',
    kartId: player?._kartDef?.id || 'drag_racer',
  });
});

document.getElementById('btnQuit').addEventListener('click', async () => {
  gameOverScreen.classList.remove('active');
  hud.classList.remove('active');
  raceManager = null;

  if (scene) scene.dispose();
  scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.04, 0.05, 1);
  player = null;
  weapons = null;
  aiManager = null;
  combat = null;
  hudCtrl = null;

  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';
});

// Boot
init().catch(err => {
  console.error('Failed to initialize Grudge Drive / Velocity:', err);
  loadText.textContent = `Error: ${err.message}`;
});
