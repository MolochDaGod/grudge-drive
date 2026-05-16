import { Engine, Scene, HavokPlugin, Vector3 } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import '@babylonjs/loaders/OBJ';
import { createArena } from './scenes/ArenaScene.js';
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

// DOM refs
const canvas = document.getElementById('renderCanvas');
const loadingScreen = document.getElementById('loadingScreen');
const loadBar = document.getElementById('loadBar');
const loadText = document.getElementById('loadText');
const mainMenu = document.getElementById('mainMenu');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('gameOver');

let engine, scene, havokInstance;
let player, weapons, aiManager, hudCtrl, audio;
let charCreation, carShop, combat, gameFlowUI;
let gameState = 'loading'; // loading | menu | creating | shop | lobby | playing | dead
let _currentGameMode = 'battle';
let _currentTrackId = 'grudge_arena';
let _survivalCoinTimer = 0;

// --- Loading ---
function updateLoad(pct, text) {
  loadBar.style.width = `${pct}%`;
  loadText.textContent = text;
}

// --- Menu UI sync ---
function updateMenuForCharacter() {
  const btnPlay = document.getElementById('btnPlay');
  const btnCreate = document.getElementById('btnCreate');
  const btnChange = document.getElementById('btnChange');
  const charInfo = document.getElementById('menuCharInfo');
  const charName = document.getElementById('menuCharName');
  const charDetail = document.getElementById('menuCharDetail');
  const charPortrait = document.getElementById('menuCharPortrait');

  // Always show Play button
  btnPlay.style.display = '';

  if (characterManager.hasCharacter) {
    const c = characterManager.character;
    const race = characterManager.getRace();
    const cls = characterManager.getClass();

    btnCreate.style.display = 'none';
    btnChange.style.display = '';
    charInfo.classList.add('active');
    charName.textContent = c.name;
    charDetail.textContent = `${race.name} ${cls.name} • ${c.grudgeId.slice(0, 8)}`;

    if (c.portraitDataUrl) {
      charPortrait.innerHTML = `<img src="${c.portraitDataUrl}" />`;
    } else {
      charPortrait.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#444;font-size:2rem">?</div>`;
    }
  } else {
    btnCreate.style.display = '';
    btnChange.style.display = 'none';
    charInfo.classList.remove('active');
  }
}

function applyCharacterToGame() {
  if (!characterManager.hasCharacter) return;
  const c = characterManager.character;
  player.setCharacterColors(c.raceId, c.classId);
}

async function openCharacterCreation() {
  mainMenu.classList.add('hidden');
  gameState = 'creating';
  const char = await charCreation.show();
  applyCharacterToGame();
  updateMenuForCharacter();
  mainMenu.classList.remove('hidden');
  gameState = 'menu';
}

async function init() {
  updateLoad(10, 'Loading physics engine...');
  havokInstance = await HavokPhysics();

  updateLoad(40, 'Initializing renderer...');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

  // Create a minimal menu scene (just renders the canvas background)
  scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.04, 0.05, 1);

  updateLoad(60, 'Loading UI...');

  // UI overlays (these don't need the game scene)
  charCreation = new CharacterCreation();
  carShop = new CarShop();
  gameFlowUI = new GameFlowUI();

  // Try loading saved character from Puter KV
  await characterManager.load();
  await shopState.load();

  updateLoad(100, 'Ready!');
  await new Promise(r => setTimeout(r, 400));

  // Transition to menu
  loadingScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';

  // Render loop — always runs, game logic only when playing
  engine.runRenderLoop(() => {
    if (gameState === 'playing' && player && weapons && aiManager) {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
      player.update(dt);
      weapons.update(dt);
      if (combat) combat.update(dt);
      aiManager.update(dt);
      if (hudCtrl) hudCtrl.update();
      updateHudCoins();

      _survivalCoinTimer += dt;
      if (_survivalCoinTimer >= 30) {
        _survivalCoinTimer -= 30;
        shopState.addCoins(COINS_SURVIVAL_BONUS);
      }

      if (player.health <= 0 && gameState === 'playing') {
        gameState = 'dead';
        showGameOver();
      }
    }
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
}

/**
 * Build the game scene fresh for a match.
 * Called AFTER the lobby picks race/kart/mode/track.
 */
async function buildGameScene(trackId) {
  // Dispose old game scene objects if any
  if (scene) scene.dispose();

  scene = new Scene(engine);
  const havokPlugin = new HavokPlugin(true, havokInstance);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
  scene.collisionsEnabled = true;
  scene.clearColor.set(0.04, 0.04, 0.05, 1);

  // Build the arena/track
  await createArena(scene);

  // Audio
  audio = new AudioManager(scene);

  // Player car
  player = new CarController(scene, audio);
  await player.init();

  // Weapons
  weapons = new WeaponsSystem(scene, player, audio);

  // AI bots
  aiManager = new AIManager(scene, player, weapons, audio);
  await aiManager.spawnBots(5);

  // Combat targeting
  try {
    combat = new CombatTargeting(scene, player, aiManager);
  } catch (_) { combat = null; }

  // HUD
  hudCtrl = new HUDController(player, weapons);
  aiManager.onBotKilled(() => hudCtrl.addKill());

  // Apply upgrades
  applyShopUpgrades();
}

// --- Menu ---
document.getElementById('btnPlay').addEventListener('click', async () => {
  // Allow playing without a character (quick play)
  mainMenu.classList.add('hidden');
  gameState = 'lobby';

  // Show the full flow: race → kart → mode/track → launch
  const result = await gameFlowUI.show();
  if (!result) {
    mainMenu.classList.remove('hidden');
    gameState = 'menu';
    return;
  }

  _currentGameMode = result.mode;
  _currentTrackId = result.trackId;

  // Build a fresh game scene for this match
  mainMenu.classList.add('hidden');
  loadingScreen.classList.remove('hidden');
  updateLoad(20, 'Building track...');

  await buildGameScene(result.trackId);
  updateLoad(70, 'Loading kart...');

  // Apply selected race + kart
  if (result.raceId) {
    await player.setCharacterColors(result.raceId, 'warrior');
  }
  if (result.kartId) {
    await player.setKart(result.kartId);
  }

  updateLoad(100, 'GO!');
  await new Promise(r => setTimeout(r, 300));
  loadingScreen.classList.add('hidden');

  // Launch
  hud.classList.add('active');
  canvas.focus();
  startGame();
});

document.getElementById('btnCreate').addEventListener('click', () => openCharacterCreation());
document.getElementById('btnChange').addEventListener('click', async () => {
  await characterManager.clear();
  openCharacterCreation();
});

document.getElementById('btnControls').addEventListener('click', () => {
  alert('WASD - Drive\nSPACE - Handbrake\nSHIFT - Nitro\nMouse - Aim\nLeft Click - Fire\n1/2/3 - Switch Weapon');
});

document.getElementById('btnShop').addEventListener('click', () => {
  mainMenu.classList.add('hidden');
  gameState = 'shop';
  carShop.show();

  // Watch for shop close → return to menu
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
  if (player) player.reset();
  if (weapons) weapons.reset();
  if (combat) combat.reset();
  if (aiManager) aiManager.reset();
  if (hudCtrl) {
    hudCtrl.reset();
    hudCtrl._loadDriverInfo();
  }
  updateHudCoins();
  canvas.requestPointerLock?.();
}

// --- Game Over ---
function showGameOver() {
  hud.classList.remove('active');
  gameOverScreen.classList.add('active');
  document.getElementById('goStats').textContent =
    `Eliminations: ${hudCtrl.kills} | Survived: ${Math.floor(hudCtrl.survivalTime)}s | +${hudCtrl.kills * COINS_PER_KILL} coins`;
  document.exitPointerLock?.();
}

document.getElementById('btnRestart').addEventListener('click', () => {
  gameOverScreen.classList.remove('active');
  hud.classList.add('active');
  startGame();
});

document.getElementById('btnQuit').addEventListener('click', async () => {
  gameOverScreen.classList.remove('active');
  hud.classList.remove('active');

  // Dispose game scene and create a clean menu scene
  if (scene) scene.dispose();
  scene = new Scene(engine);
  scene.clearColor.set(0.04, 0.04, 0.05, 1);
  player = null; weapons = null; aiManager = null; combat = null; hudCtrl = null;

  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';
});

// Boot
init().catch(err => {
  console.error('Failed to initialize Grudge Drive:', err);
  loadText.textContent = `Error: ${err.message}`;
});
