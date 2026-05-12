import { Engine, Scene, HavokPlugin, Vector3 } from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import '@babylonjs/loaders/OBJ';
import { createArena } from './scenes/ArenaScene.js';
import { CarController } from './game/CarController.js';
import { WeaponsSystem } from './game/WeaponsSystem.js';
import { AIManager } from './game/AIManager.js';
import { HUDController } from './ui/HUDController.js';
import { AudioManager } from './game/AudioManager.js';

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
let gameState = 'loading'; // loading | menu | playing | dead

// --- Loading ---
function updateLoad(pct, text) {
  loadBar.style.width = `${pct}%`;
  loadText.textContent = text;
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

  // Build the arena environment
  await createArena(scene);
  updateLoad(50, 'Loading vehicles...');

  // Audio
  audio = new AudioManager(scene);

  // Player car
  player = new CarController(scene, audio);
  await player.init();
  updateLoad(70, 'Spawning opponents...');

  // Weapons
  weapons = new WeaponsSystem(scene, player, audio);

  // AI opponents
  aiManager = new AIManager(scene, player, weapons, audio);
  await aiManager.spawnBots(5);
  updateLoad(85, 'Preparing HUD...');

  // HUD
  hudCtrl = new HUDController(player, weapons);

  // Wire AI kill → HUD
  aiManager.onBotKilled(() => hudCtrl.addKill());

  updateLoad(100, 'Ready!');
  await new Promise(r => setTimeout(r, 500));

  // Transition to menu
  loadingScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  gameState = 'menu';

  // Render loop
  engine.runRenderLoop(() => {
    if (gameState === 'playing') {
      const dt = engine.getDeltaTime() / 1000;
      player.update(dt);
      weapons.update(dt);
      aiManager.update(dt);
      hudCtrl.update();

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
document.getElementById('btnPlay').addEventListener('click', () => {
  mainMenu.classList.add('hidden');
  hud.classList.add('active');
  canvas.focus();
  startGame();
});

document.getElementById('btnControls').addEventListener('click', () => {
  alert('WASD - Drive\nSPACE - Handbrake\nSHIFT - Nitro\nMouse - Aim\nLeft Click - Fire\n1/2/3 - Switch Weapon\nR - Reload');
});

function startGame() {
  gameState = 'playing';
  player.reset();
  weapons.reset();
  aiManager.reset();
  hudCtrl.reset();
  canvas.requestPointerLock?.();
}

// --- Game Over ---
function showGameOver() {
  hud.classList.remove('active');
  gameOverScreen.classList.add('active');
  document.getElementById('goStats').textContent =
    `Eliminations: ${hudCtrl.kills} | Survived: ${Math.floor(hudCtrl.survivalTime)}s`;
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
  gameState = 'menu';
});

// Boot
init().catch(err => {
  console.error('Failed to initialize Grudge Drive:', err);
  loadText.textContent = `Error: ${err.message}`;
});
