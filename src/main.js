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

  updateLoad(20, 'Initializing renderer...');
  engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(1 / window.devicePixelRatio);

  updateLoad(30, 'Building arena...');
  scene = new Scene(engine);
  const havokPlugin = new HavokPlugin(true, havokInstance);
  scene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);
  scene.collisionsEnabled = true;
  scene.clearColor.set(0.04, 0.04, 0.05, 1);

  await createArena(scene);
  updateLoad(50, 'Loading vehicles...');

  audio = new AudioManager(scene);
  player = new CarController(scene, audio);
  await player.init();
  updateLoad(70, 'Spawning opponents...');

  weapons = new WeaponsSystem(scene, player, audio);
  aiManager = new AIManager(scene, player, weapons, audio);
  await aiManager.spawnBots(5);

  combat = new CombatTargeting(scene, player, aiManager);
  updateLoad(85, 'Checking identity...');

  // UI overlays
  charCreation = new CharacterCreation();
  carShop = new CarShop();
  gameFlowUI = new GameFlowUI();

  // Try loading saved character + shop data from Puter KV
  await characterManager.load();
  await shopState.load();
  if (characterManager.hasCharacter) {
    applyCharacterToGame();
  }
  // Apply shop upgrades to vehicle
  applyShopUpgrades();

  // HUD (reads character data in constructor)
  hudCtrl = new HUDController(player, weapons);
  aiManager.onBotKilled(() => hudCtrl.addKill());

  updateLoad(100, 'Ready!');
  await new Promise(r => setTimeout(r, 500));

  // Transition to menu
  loadingScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';

  // Render loop
  engine.runRenderLoop(() => {
    if (gameState === 'playing') {
      const dt = engine.getDeltaTime() / 1000;
      player.update(dt);
      weapons.update(dt);
      combat.update(dt);
      aiManager.update(dt);
      hudCtrl.update();
      updateHudCoins();

      // Survival coin bonus every 30s
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

// --- Menu ---
document.getElementById('btnPlay').addEventListener('click', async () => {
  // Allow playing without a character (quick play)
  mainMenu.classList.add('hidden');
  gameState = 'lobby';

  // Show the lobby: pick game mode + track
  const result = await gameFlowUI.show();
  if (!result) {
    // Player cancelled — back to menu
    mainMenu.classList.remove('hidden');
    gameState = 'menu';
    return;
  }

  _currentGameMode = result.mode;
  _currentTrackId = result.trackId;

  // Launch into the game
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
  player.reset();
  weapons.reset();
  combat.reset();
  aiManager.reset();
  hudCtrl.reset();
  hudCtrl._loadDriverInfo();
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

document.getElementById('btnQuit').addEventListener('click', () => {
  gameOverScreen.classList.remove('active');
  mainMenu.classList.remove('hidden');
  updateMenuForCharacter();
  gameState = 'menu';
});

// Boot
init().catch(err => {
  console.error('Failed to initialize Grudge Drive:', err);
  loadText.textContent = `Error: ${err.message}`;
});
