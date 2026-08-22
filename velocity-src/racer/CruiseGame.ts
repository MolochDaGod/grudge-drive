/**
 * CruiseGame — LA Gangwar + Houston open-world Velocity (production SSOT).
 *
 * Flow:
 *  - World mesh: LA GANGWAR SIMULATOR 3D (CC-BY-4.0) + Houston POI layer
 *  - Start in car (driving) or on foot near garage
 *  - E near car: enter/exit vehicle
 *  - E near street NPC (on foot): talk → optional challenge race
 *  - On foot: RMB toggle pistol (draw/holster) · mouse look · Danger Room camera
 *  - Street combatants patrol + fire when hostile
 *  - Beacons: races / missions / raves
 */

import * as THREE from "three";
import { createAnimatedCharacter, type Animator as FullAnimator } from "@workspace/animator";
import { EventBinder, GamepadPoller } from "@/games/shared/controls";
import {
  updateChaseCamera,
  updateFootChaseCamera,
  updateDangerRoomCamera,
} from "@/games/shared/camera";
import {
  disposeObject3D,
  createGameRenderer,
  VehicleCarryController,
  reparentPreserveWorld,
  doorWorldFromCar,
  seatWorldFromCar,
  easeSmooth,
  lerpAngle,
} from "@/games/shared/gameHelpers";
import { Gearbox, Nitro, EngineHeat } from "./drivetrain";
import { SpeedLines } from "./speedfx";
import {
  spawnCityAgents,
  stepAllAgents,
  beginNpcRace,
  nearestChallenger,
  nearestTaunt,
  type AiAgent,
} from "./aiBrain";
import { DISTRICTS, MISSIONS, WORLD_POIS, districtAt, type WorldPoI } from "./houstonCity";
import { buildHoustonCity, buildPoIMarkers, makeNpcCarMesh } from "./cityFactory";
import { CityMapWorld } from "./cityMapWorld";
import {
  emptyCruiseHud,
  agentsToBlips,
  districtLabel,
  type CruiseConfig,
  type CruiseHudState,
  type CruisePhase,
  type DialogueState,
} from "./cruise";
import { DriveNetClient, resolveDriveWsUrl } from "./driveNetClient";
import { streetNpcSpawns, streetNpcById, type StreetNpc } from "./npcCharacters";
import { loadVehicleClips, type VehicleClips } from "./anims";
import { CONFIG } from "./constants";
import type { AnimationClip } from "three";
import { loadLaGangwarMap, type LaGangwarMap, LA_GANGWAR_CREDIT } from "./laGangwarMap";
import { prepareVelocityCar } from "./loadVelocityCar";
import { CARS, getCar, DEFAULT_CAR_ID, type CarDef } from "./cars";
import type { PreparedCar } from "./factory";
import {
  PISTOL,
  createAimState,
  makeWorldReticle,
  makeSimplePed,
  pickCombatTarget,
  resolveAimPoint,
  camForwardYaw,
  spawnProjectile,
  stepProjectiles,
  stepCombatantAi,
  spawnStreetCombatants,
  type AimState,
  type Combatant,
  type GunDef,
  type Projectile,
} from "./streetCombat";
import {
  playerSpawn,
  remapPoisToMap,
  snapPoisToStreet,
  streetCastSpawns,
  reseatAgentsOnStreet,
  layerPrompt,
} from "./streetWorldFlow";
import type { RoadGraph } from "./roadGraph";
import { CITY_HALF } from "./houstonCity";
import {
  bindCursorTargets,
  unbindCursorTargets,
  setCursor,
  setCursorPress,
  resolveGameCursor,
  preloadCursors,
  type CursorState,
} from "./cursors";

type Animator = FullAnimator;

const FIXED_DT = 1 / 60;
const SPEED_DISPLAY = 3.6;
const INTERACT_R = 14;
const CAR_ENTER_R = CONFIG.enter.distance;
const RACE_LEN = 402;
const MAX_SPEED = 42;
const FOOT_SPEED = 6.5;
const STOPPED_SPEED = 0.85;
const SLAM_BRAKE = 52;
/** Fallback seat when voxel car dims not ready yet (procedural box dims). */
const SEAT_LOCAL_FALLBACK = new THREE.Vector3(
  2.2 * CONFIG.enter.seat.x,
  0.55 * CONFIG.enter.seat.y + 0.35,
  4.2 * CONFIG.enter.seat.z,
);

/** Hide lower-body voxel boxes so only torso/head read through the cabin (GTA-ish). */
function setLowerBodyVisible(root: THREE.Object3D, visible: boolean): void {
  root.traverse((o) => {
    const n = (o.name || "").toLowerCase();
    if (
      n.includes("leg") ||
      n.includes("foot") ||
      n.includes("thigh") ||
      n.includes("calf") ||
      n.includes("shin") ||
      n.includes("boot") ||
      n.includes("knee") ||
      n.includes("hip") ||
      n.includes("pelvis") ||
      n.includes("pants") ||
      n.includes("lower")
    ) {
      o.visible = visible;
    }
  });
}

type StreetInstance = {
  npc: StreetNpc;
  x: number;
  z: number;
  mesh: THREE.Object3D;
  animator?: Animator;
};

export class CruiseGame {
  private readonly container: HTMLElement;
  private readonly onHud: (s: CruiseHudState) => void;
  private readonly cfg: CruiseConfig;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private acc = 0;

  private readonly keys = new Set<string>();
  private readonly binder = new EventBinder();
  private readonly gamepad = new GamepadPoller({ deadzone: 0.12 });

  private carRoot = new THREE.Group();
  /** Real CDN voxel car after prepareVelocityCar (null = procedural fallback). */
  private preparedCar: PreparedCar | null = null;
  private carDims = { width: 2.2, length: 4.2, height: 1.4 };
  private carPos = new THREE.Vector3(8, 0.4, 8);
  private footPos = new THREE.Vector3(12, 0, 10);
  private heading = 0;
  private footYaw = 0;
  private speed = 0;
  private steerIn = 0;

  private playerAnimator: Animator | null = null;
  private playerRoot: THREE.Object3D | null = null;

  private gearbox = new Gearbox(MAX_SPEED);
  private nitro = new Nitro();
  private heat = new EngineHeat();
  private autoShift = true;
  private speedFx: SpeedLines | null = null;

  private agents: AiAgent[] = [];
  private npcMeshes = new Map<string, THREE.Group>();
  private street: StreetInstance[] = [];
  private poiById = new Map<string, THREE.Object3D>();

  private phase: CruisePhase = "driving";
  private sessionCash = 0;
  private discoveredDistricts = new Set<string>();
  private discoveredRaves = new Set<string>();
  private racesWon = 0;
  private activeMissionId: string | null = null;
  private missionProgress = 0;

  private raceCountdown: number | null = null;
  private raceProgress = 0;
  private raceStartZ = 0;
  private raceRivalName: string | null = null;
  private raceRivalId: string | null = null;
  private raceLength = RACE_LEN;
  private raceRivalProgress = 0;
  private racePendingAgentId: string | null = null;
  private nearChallenge: AiAgent | null = null;
  private lastTaunt: { name: string; line: string; accent: string } | null = null;
  private honkPulse = 0;
  private heatEscapeArmed = false;

  // Enter / exit vehicle carry (Mixamo FBX + seat lerp via VehicleCarryController)
  private vehicleClips: VehicleClips = { enter: null, exit: null };
  private readonly carry = new VehicleCarryController({
    stoppedSpeed: STOPPED_SPEED,
    slamBrake: SLAM_BRAKE,
    doorSide: CONFIG.enter.doorSide,
    seatScale: CONFIG.enter.seatScale,
    seatLocal: SEAT_LOCAL_FALLBACK,
    fallbackDuration: CONFIG.enter.fallbackDuration,
  });
  private debugLabel = "";
  private nearPoi: WorldPoI | null = null;
  private nearStreet: StreetInstance | null = null;
  private dialogue: DialogueState | null = null;
  private dialogueLineIdx = 0;
  private _lastResult: { won: boolean; cash: number } | null = null;
  private resultTimer = 0;

  private net: DriveNetClient | null = null;
  private peerMeshes = new Map<string, THREE.Group>();
  private peers = 0;
  private netStatus: CruiseHudState["netStatus"] = "offline";

  /** Raycast + navmesh + colliders + optional Rapier. */
  private mapWorld: CityMapWorld | null = null;
  /** LA Gangwar visual + BVH ground + mesh AABB walls (preferred world). */
  private gangMap: LaGangwarMap | null = null;
  private mapCredit = LA_GANGWAR_CREDIT;
  private worldHalf = 400;
  /** Active road graph for AI (LA map graph or Houston fallback). */
  private roadGraph: RoadGraph | null = null;
  /** POIs remapped into LA extents when gang map loads. */
  private worldPois: WorldPoI[] = [...WORLD_POIS];

  // ── ARPG / Danger Room combat (on foot) ─────────────────────────────
  private aim: AimState = createAimState();
  private gun: GunDef = PISTOL;
  private mag = PISTOL.magSize;
  private fireCd = 0;
  private reloadT = 0;
  private playerHp = 100;
  private playerMaxHp = 100;
  private combatants: Combatant[] = [];
  private projectiles: Projectile[] = [];
  private worldReticle: THREE.Mesh | null = null;
  private wantsFire = false;
  private pointerNdc = { x: 0, y: 0 };
  private hoverHostile = false;
  private cursorState: CursorState = "default";
  /** Weapon drawn — RMB toggles pistol + aim-ready (open world). */
  private gunDrawn = false;
  /** Free-look orbit yaw/pitch (camera controller). */
  private camYaw = 0;
  private camPitch = 0.28;
  private readonly _proj = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    onHud: (s: CruiseHudState) => void,
    cfg: CruiseConfig,
  ) {
    this.container = container;
    this.onHud = onHud;
    this.cfg = cfg;
  }

  start(): void {
    this.renderer = createGameRenderer();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
    preloadCursors();
    bindCursorTargets(this.renderer.domElement, document.body);
    setCursor("drive");

    this.scene = new THREE.Scene();
    // LA night / neon — gang streets + Houston cruise identity
    this.scene.background = new THREE.Color(0x0c1018);
    this.scene.fog = new THREE.FogExp2(0x0c1018, 0.0012);

    this.camera = new THREE.PerspectiveCamera(
      62,
      this.container.clientWidth / Math.max(1, this.container.clientHeight),
      0.2,
      1400,
    );
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0x88aacc, 0x120818, 0.55));
    const sun = new THREE.DirectionalLight(0xffc090, 1.15);
    sun.position.set(80, 55, -60);
    sun.castShadow = true;
    this.scene.add(sun);
    this.scene.add(new THREE.PointLight(0x00e5ff, 1.2, 260).translateY(22));
    this.scene.add(new THREE.PointLight(0xff5a20, 0.85, 200).translateY(16).translateX(-40));

    // Procedural Houston fallback mesh (hidden once LA Gangwar loads)
    const houstonProc = buildHoustonCity("houston");
    houstonProc.name = "houstonProceduralFallback";
    this.scene.add(houstonProc);
    // Map physics: road graph + optional Rapier (still drives AI cars)
    this.mapWorld = new CityMapWorld({ seed: "houston" });
    this.scene.add(this.mapWorld.raycastRoot);
    this.roadGraph = this.mapWorld.roadGraph;

    this.worldReticle = makeWorldReticle();
    this.scene.add(this.worldReticle);

    const pois = buildPoIMarkers();
    this.scene.add(pois.group);
    this.poiById = pois.byId;

    // Placeholder until async voxel car GLB loads (bootCars)
    this.carRoot.add(makeNpcCarMesh(this.cfg.carAccent || "#9dff00", 1.05));
    this.carRoot.userData.colKind = "vehicle";
    this.carRoot.userData.physics = { mass: 1200, kind: "vehicle" };
    // Temporary spawn — re-snapped after LA map boot
    const spawnRoad = this.mapWorld.snapVehicleToRoad(this.carPos.x, this.carPos.z, true);
    this.carPos.set(spawnRoad.x, 0.4, spawnRoad.z);
    this.heading = spawnRoad.yaw;
    this.carRoot.position.copy(this.carPos);
    this.scene.add(this.carRoot);

    this.agents = spawnCityAgents(28, "houston");
    for (const a of this.agents) {
      // Temporary procedural mesh — upgraded to CDN voxel GLBs in bootCars()
      const mesh = makeNpcCarMesh(
        a.accent,
        a.role === "police" ? 1.05 : a.role === "racer" ? 1.0 : 0.9,
      );
      mesh.userData.colKind = "vehicle";
      mesh.userData.physics = { mass: 1100, kind: "vehicle" };
      mesh.userData.agentId = a.id;
      const g = this.mapWorld.raycastGround(a.x, a.z);
      mesh.position.set(a.x, g.y, a.z);
      this.scene.add(mesh);
      this.npcMeshes.set(a.id, mesh);
    }

    this.speedFx = new SpeedLines(this.camera);
    this.bindInput();
    this.connectNet();

    void this.bootWorld().then(() => {
      if (this.disposed) return;
      this.clock.start();
      const loop = () => {
        if (this.disposed) return;
        this.raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, this.clock.getDelta());
        this.acc += dt;
        while (this.acc >= FIXED_DT) {
          this.fixedUpdate(FIXED_DT);
          this.acc -= FIXED_DT;
        }
        this.render(dt);
        this.pushHud();
      };
      this.raf = requestAnimationFrame(loop);
      this.pushHud();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.binder.dispose();
    this.net?.dispose();
    this.playerAnimator?.dispose();
    for (const s of this.street) s.animator?.dispose();
    this.speedFx?.dispose();
    this.gangMap?.dispose();
    this.gangMap = null;
    this.mapWorld?.dispose();
    this.mapWorld = null;
    unbindCursorTargets(this.renderer?.domElement, document.body);
    setCursor("default");
    setCursorPress(false);
    disposeObject3D(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private async bootWorld(): Promise<void> {
    await this.mapWorld?.init({ useRapier: true, usePathfinding: true });
    // LA Gangwar shell — street racer + gunfighter world (native SI scale)
    try {
      const map = await loadLaGangwarMap();
      if (map && !this.disposed) {
        this.gangMap = map;
        this.scene.add(map.root);
        this.worldHalf = Math.max(map.halfX, map.halfZ) * 0.95;
        // Street-pruned graph only — under-bridge / canal nodes purged
        this.roadGraph = map.roadGraph;
        // Hide procedural Houston mesh + its phantom colliders
        const fallback = this.scene.getObjectByName("houstonProceduralFallback");
        if (fallback) fallback.visible = false;
        if (this.mapWorld) this.mapWorld.raycastRoot.visible = false;

        // Remap + snap POIs onto street deck
        this.worldPois = snapPoisToStreet(
          remapPoisToMap(WORLD_POIS, CITY_HALF, map.halfX, map.halfZ),
          map.roadGraph,
          (x, z) => map.sampleSurface(x, z),
          map.streetMedianY,
        );
        for (const p of this.worldPois) {
          const marker = this.poiById.get(p.id);
          if (marker) {
            const gy = map.sampleGround(p.x, p.z);
            marker.position.set(p.x, gy + 2.2, p.z);
          }
        }

        // Garage spawn: map-validated street deck (not under bridge)
        const spawn = playerSpawn({
          halfX: map.halfX,
          halfZ: map.halfZ,
          roadGraph: map.roadGraph,
          nativeMap: true,
          mapSpawn: map.spawn,
          sampleSurface: (x, z) => map.sampleSurface(x, z),
          streetMedianY: map.streetMedianY,
          waterY: map.waterY,
        });
        const gy = spawn.y ?? map.sampleGround(spawn.x, spawn.z);
        this.carPos.set(spawn.x, gy + 0.4, spawn.z);
        this.heading = spawn.yaw;
        this.carRoot.position.copy(this.carPos);
        this.carRoot.rotation.y = this.heading;
        this.footPos.set(spawn.x + 3.5, gy, spawn.z + 2.5);
        // Ensure foot also on street deck
        {
          const f = map.resolveCharacter(this.footPos.x, this.footPos.z);
          this.footPos.set(f.x, f.y, f.z);
        }

        // PURGE agent Houston coords → reseat on street-valid LA nodes
        const seats = reseatAgentsOnStreet(
          this.agents.length,
          map.roadGraph,
          (x, z) => map.sampleSurface(x, z),
          map.streetMedianY,
        );
        this.agents.forEach((a, i) => {
          const s = seats[i % seats.length]!;
          a.x = s.x;
          a.z = s.z;
          a.yaw = s.yaw;
          a.path = null;
          const mesh = this.npcMeshes.get(a.id);
          if (mesh) mesh.position.set(s.x, s.y + 0.35, s.z);
        });

        console.info(
          "[cruise] LA Gangwar ready",
          `scale=${map.scaleApplied}`,
          `${map.halfX.toFixed(0)}×${map.halfZ.toFixed(0)}m`,
          `hMax=${map.buildingHeightMax.toFixed(1)}`,
          `walls=${map.wallAabbs.length}`,
          `roads=${map.roadGraph.nodes.size}`,
          `waterY=${map.waterY.toFixed(2)}`,
          `streetY=${map.streetMedianY.toFixed(2)}`,
          `spawn=${spawn.label}@${spawn.x.toFixed(0)},${spawn.z.toFixed(0)} y=${gy.toFixed(2)}`,
          map.credit,
        );

        // ARPG street peds on street deck (ground sampler prefers street layer)
        this.combatants = spawnStreetCombatants(
          this.scene,
          14,
          10,
          Math.min(map.halfX, map.halfZ) * 0.75,
          (x, z) => this.sampleGroundY(x, z),
          (accent, armed) => makeSimplePed(accent, armed),
        );
      }
    } catch (err) {
      console.warn("[cruise] LA Gangwar load failed — procedural Houston only", err);
    }
    try {
      this.vehicleClips = await loadVehicleClips();
    } catch {
      this.vehicleClips = { enter: null, exit: null };
    }
    await this.bootCars();
    await this.bootAvatars();
  }

  /** Replace procedural box cars with real CDN voxel GLBs from the roster. */
  private async bootCars(): Promise<void> {
    const def =
      getCar(this.cfg.carId || DEFAULT_CAR_ID) ||
      getCar(DEFAULT_CAR_ID) ||
      CARS.find((c) => c.starter) ||
      CARS[0]!;
    const paint = this.cfg.paintColor || this.cfg.carAccent;
    try {
      const prepared = await prepareVelocityCar(def, {
        paintColor: paint,
      });
      if (prepared && !this.disposed) {
        // Swap placeholder
        while (this.carRoot.children.length) {
          this.carRoot.remove(this.carRoot.children[0]!);
        }
        this.preparedCar = prepared;
        this.carDims = { ...prepared.dims };
        // Use prepared root as carRoot contents: body already nested
        this.carRoot.add(prepared.root);
        // Flatten: prefer prepared.root as the transform root
        // Keep carRoot for sim position; attach prepared.root at identity
        prepared.root.position.set(0, 0, 0);
        prepared.root.rotation.set(0, 0, 0);
        console.info(
          "[cruise] player voxel car",
          def.id,
          def.assetId,
          `dims ${prepared.dims.width.toFixed(2)}×${prepared.dims.length.toFixed(2)}×${prepared.dims.height.toFixed(2)}`,
        );
      } else {
        console.warn("[cruise] CDN car failed — keeping procedural mesh", def.assetId);
      }
    } catch (err) {
      console.warn("[cruise] bootCars player failed", err);
    }

    // Upgrade AI racer/police cars to real voxel GLBs (pool of CDN cars)
    const pool = CARS.filter((c) => c.assetId !== "vehicles/minecraft-car");
    const upgrades = [...this.npcMeshes.entries()].slice(0, 12);
    await Promise.all(
      upgrades.map(async ([id, mesh], i) => {
        const defAi = pool[i % pool.length]!;
        try {
          const p = await prepareVelocityCar(defAi, { paintColor: undefined });
          if (!p || this.disposed) return;
          p.root.position.copy(mesh.position);
          p.root.rotation.y = mesh.rotation.y;
          p.root.userData.colKind = "vehicle";
          p.root.userData.physics = mesh.userData.physics;
          p.root.userData.agentId = id;
          this.scene.remove(mesh);
          disposeObject3D(mesh);
          this.scene.add(p.root);
          this.npcMeshes.set(id, p.root);
        } catch {
          /* keep procedural */
        }
      }),
    );
  }

  private sampleGroundY(x: number, z: number): number {
    if (this.gangMap) {
      // Street deck preferred; water floor never used for feet/cars
      const y = this.gangMap.sampleGround(x, z);
      return Math.max(y, this.gangMap.waterY + 0.05);
    }
    if (this.mapWorld) return this.mapWorld.raycastGround(x, z).y;
    return 0;
  }

  /** Character resolve — LA mesh walls when available, else Houston grid. */
  private resolveFoot(x: number, z: number): { x: number; z: number; y: number } {
    if (this.gangMap) {
      const r = this.gangMap.resolveCharacter(x, z);
      return { x: r.x, z: r.z, y: r.y };
    }
    if (this.mapWorld) {
      const r = this.mapWorld.resolveCharacter(x, z);
      return { x: r.x, z: r.z, y: r.y };
    }
    return { x, z, y: 0 };
  }

  private resolveCar(
    x: number,
    z: number,
    yaw: number,
    scale = 1,
  ): { x: number; z: number; y: number; hit: boolean } {
    if (this.gangMap) return this.gangMap.resolveVehicle(x, z, yaw, scale);
    if (this.mapWorld) return this.mapWorld.resolveVehicle(x, z, yaw, scale);
    return { x, z, y: 0.4, hit: false };
  }

  /** HUD actions from React dialogue panel. */
  /** Accept dialogue race or nearby drive-by challenge. */
  acceptChallenge(): void {
    // Drive-by AI challenger
    if (this.nearChallenge && (this.phase === "driving" || this.phase === "mission" || this.phase === "onfoot")) {
      const a = this.nearChallenge;
      const meet = this.worldPois.find((p) => p.id === a.meetId) ?? null;
      if (this.phase === "onfoot" || this.phase === "combat") this.forceSeatInCar();
      this.startStreetRace(a.name, meet, a.id);
      return;
    }
    if (!this.dialogue?.canChallenge) return;
    const npc = streetNpcById(this.dialogue.npcId);
    const rivalName = this.dialogue.npcName ?? npc?.name ?? "Rival";
    this.dialogue = null;
    this.forceSeatInCar();
    this.phase = "driving";
    const meet = this.worldPois.find((p) => p.id === npc?.meetId) ?? null;
    const agent =
      this.agents.find((a) => a.role === "racer" && a.meetId === npc?.meetId) ??
      this.agents.find((a) => a.role === "racer");
    this.startStreetRace(rivalName, meet, agent?.id);
  }

  continueDialogue(): void {
    if (!this.dialogue) return;
    const npc = streetNpcById(this.dialogue.npcId);
    if (!npc) {
      this.dialogue = null;
      this.phase = "onfoot";
      return;
    }
    this.dialogueLineIdx += 1;
    if (this.dialogueLineIdx >= npc.lines.length) {
      // Stay on last line with challenge option
      this.dialogue = {
        ...this.dialogue,
        line: npc.lines[npc.lines.length - 1],
        canChallenge: npc.canChallenge,
      };
      return;
    }
    this.dialogue = {
      ...this.dialogue,
      line: npc.lines[this.dialogueLineIdx],
      canChallenge: npc.canChallenge && this.dialogueLineIdx >= npc.lines.length - 1,
    };
  }

  closeDialogue(): void {
    this.dialogue = null;
    if (this.phase === "dialogue") this.phase = "onfoot";
  }

  private async bootAvatars(): Promise<void> {
    const look = this.cfg.driverLook ?? {
      skin: "#c98c5a",
      shirt: "#e2492c",
      pants: "#3a1410",
      hat: "cap" as const,
      hatColor: "#ff7043",
    };

    // Static import of @workspace/animator → real voxel Mixamo driver + playClip
    try {
      const anim = await createAnimatedCharacter({
        weapon: "unarmed",
        height: 2,
        look,
      });
      if (this.disposed) {
        anim.dispose();
        return;
      }
      this.playerAnimator = anim;
      this.playerRoot = anim.root;
      this.playerRoot.userData.colKind = "character";
      this.scene.add(anim.root);
      if (this.cfg.spawnOnFoot) {
        this.finishExitInstant();
      } else {
        this.forceSeatInCar();
      }
      this.camYaw = this.heading;
      this.debugLabel = `clips enter=${!!this.vehicleClips.enter} exit=${!!this.vehicleClips.exit}`;
      console.info("[cruise] voxel driver ready", this.debugLabel);
    } catch (err) {
      console.warn("[cruise] createAnimatedCharacter failed — box stand-in", err);
      this.playerRoot = this.makeVoxelStandIn(this.cfg.carAccent || "#e2492c");
      this.carRoot.add(this.playerRoot);
      this.phase = "driving";
      this.carry.setSeated();
    }

    // Talkable racers/guides: street-deck sidewalks only (no under-bridge)
    const castSpawns = streetCastSpawns(
      undefined,
      this.roadGraph,
      Math.min(this.worldHalf, 200),
      this.gangMap ? (x, z) => this.gangMap!.sampleSurface(x, z) : undefined,
      this.gangMap?.streetMedianY ?? null,
    );
    for (const spawn of castSpawns.length ? castSpawns : streetNpcSpawns()) {
      const foot = this.resolveFoot(spawn.x, spawn.z);
      try {
        const anim = await createAnimatedCharacter({
          weapon: "unarmed",
          height: 1.9,
          look: spawn.npc.look,
        });
        if (this.disposed) {
          anim.dispose();
          return;
        }
        anim.root.position.set(foot.x, foot.y, foot.z);
        anim.root.rotation.y = Math.random() * Math.PI * 2;
        anim.root.userData.colKind = "character";
        this.scene.add(anim.root);
        this.street.push({
          npc: spawn.npc,
          x: foot.x,
          z: foot.z,
          mesh: anim.root,
          animator: anim,
        });
      } catch {
        const m = this.makeVoxelStandIn(spawn.npc.accent);
        m.position.set(foot.x, foot.y, foot.z);
        this.scene.add(m);
        this.street.push({ npc: spawn.npc, x: foot.x, z: foot.z, mesh: m });
      }
    }
  }

  /** Fallback voxel-ish stand-in when animator fails. */
  private makeVoxelStandIn(accent: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.7, 0.3),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 }),
    );
    body.position.y = 0.95;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.35, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xc98c5a, roughness: 0.8 }),
    );
    head.position.y = 1.5;
    const legL = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.55, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x2a2a40 }),
    );
    legL.position.set(-0.12, 0.28, 0);
    const legR = legL.clone();
    legR.position.x = 0.12;
    g.add(body, head, legL, legR);
    g.userData.colKind = "character";
    return g;
  }

  /**
   * Seat anchor in car-local space from fitted voxel car dims (RacerGame SSOT).
   * Hips sit low in the cabin — legs hidden via setLowerBodyVisible.
   */
  private seatLocal(): THREE.Vector3 {
    const d = this.carDims;
    const s = CONFIG.enter.seat;
    if (this.preparedCar) {
      return new THREE.Vector3(d.width * s.x, d.height * s.y, d.length * s.z);
    }
    return SEAT_LOCAL_FALLBACK.clone();
  }

  private seatWorld(): THREE.Vector3 {
    return seatWorldFromCar(
      this.carPos.x,
      this.carPos.z,
      this.carPos.y,
      this.heading,
      this.seatLocal(),
    );
  }

  private doorWorld(): THREE.Vector3 {
    const d = doorWorldFromCar(
      this.carPos.x,
      this.carPos.z,
      0,
      this.heading,
      CONFIG.enter.doorSide,
    );
    const r = this.resolveFoot(d.x, d.z);
    d.set(r.x, r.y, r.z);
    return d;
  }

  private playCarry(clip: AnimationClip | null): number {
    if (clip && this.playerAnimator) {
      try {
        const d = this.playerAnimator.playClip(clip);
        if (d > 0.05) {
          console.info("[cruise] playClip duration", d.toFixed(2));
          return d;
        }
      } catch (e) {
        console.warn("[cruise] playClip failed", e);
      }
    }
    return CONFIG.enter.fallbackDuration;
  }

  private seatPlayerInCar(): void {
    if (!this.playerRoot) return;
    // Parent into car body so driver rolls with chassis when available
    const parent = this.preparedCar?.body ?? this.carRoot;
    parent.add(this.playerRoot);
    this.playerRoot.position.copy(this.seatLocal());
    this.playerRoot.rotation.set(0, 0, 0);
    this.playerRoot.scale.setScalar(CONFIG.enter.seatScale);
    // GTA-style cabin: only torso/head above the door belt-line
    setLowerBodyVisible(this.playerRoot, false);
    try {
      (this.playerAnimator as { sit?: (id: string) => void } | null)?.sit?.("sitIdle");
    } catch {
      /* sit clip optional */
    }
    this.carry.setSeated();
  }

  private unseatPlayerVisuals(): void {
    if (!this.playerRoot) return;
    setLowerBodyVisible(this.playerRoot, true);
    this.playerRoot.scale.setScalar(1);
  }

  /** Instant seat without animation (spawn / race start). */
  private forceSeatInCar(): void {
    this.speed = 0;
    this.seatPlayerInCar();
    if (this.phase !== "race" && this.phase !== "results" && this.phase !== "mission") {
      this.phase = "driving";
    }
  }

  /**
   * E while driving: if moving, slam brakes (stopping); once stopped, play exit clip.
   */
  private requestExitVehicle(): void {
    if (this.phase === "race" || this.phase === "results") return;
    if (this.carry.busy) return;

    this.carry.speed = this.speed;
    this.carry.requestExit(this.speed);
    if (this.carry.phase === "stopping") {
      this.phase = "stopping";
      this.debugLabel = "stopping";
      return;
    }
    this.beginExitAnim();
  }

  private beginExitAnim(): void {
    this.speed = 0;
    const dur = this.playCarry(this.vehicleClips.exit);
    this.carry.armExitCarry(dur);
    this.phase = "exiting";
    this.debugLabel = `exiting ${dur.toFixed(2)}s`;

    if (!this.playerRoot) {
      this.finishExitInstant();
      return;
    }
    reparentPreserveWorld(this.playerRoot, this.scene);
    this.unseatPlayerVisuals();
    this.playerRoot.rotation.set(0, this.heading, 0);
    this.carry.fromPos.copy(this.playerRoot.position);
    this.carry.fromYaw = this.heading;
    this.carry.toPos.copy(this.doorWorld());
    this.carry.toYaw = this.heading - Math.PI / 2;
    this.carry.fromScale = this.playerRoot.scale.x;
    this.carry.toScale = 1;
  }

  private beginEnterAnim(): void {
    if (!this.playerRoot) {
      this.forceSeatInCar();
      this.phase = "driving";
      return;
    }
    this.speed = 0;
    const dur = this.playCarry(this.vehicleClips.enter);
    this.carry.requestEnter(dur);
    this.phase = "entering";
    this.debugLabel = `entering ${dur.toFixed(2)}s`;

    if (this.playerRoot.parent !== this.scene) {
      reparentPreserveWorld(this.playerRoot, this.scene);
    }
    this.carry.fromPos.copy(this.playerRoot.position);
    this.carry.fromYaw = this.footYaw;
    this.carry.toPos.copy(this.seatWorld());
    this.carry.toYaw = this.heading;
    this.carry.fromScale = this.playerRoot.scale.x;
    this.carry.toScale = CONFIG.enter.seatScale;
  }

  private finishExitInstant(): void {
    const door = this.doorWorld();
    this.footPos.copy(door);
    this.footYaw = this.heading - Math.PI / 2;
    if (this.playerRoot) {
      if (this.playerRoot.parent !== this.scene) this.scene.add(this.playerRoot);
      this.playerRoot.position.copy(this.footPos);
      this.playerRoot.rotation.set(0, this.footYaw, 0);
      this.playerRoot.scale.setScalar(1);
      this.playerRoot.userData.colKind = "character";
    }
    this.playerAnimator?.setLocomotion({ x: 0, z: 0, speed: 0, running: false });
    this.speed = 0;
    this.phase = "onfoot";
    this.carry.setOnFoot();
  }

  private updateVehicleTransition(dt: number): void {
    if (this.phase !== "entering" && this.phase !== "exiting") return;
    if (!this.playerRoot) {
      if (this.phase === "entering") {
        this.forceSeatInCar();
        this.phase = "driving";
      } else this.finishExitInstant();
      return;
    }

    this.playerAnimator?.update(dt);
    const done = this.carry.updateCarry(dt, this.playerRoot);
    if (!done) return;

    if (done === "done-enter") {
      this.seatPlayerInCar();
      this.phase = "driving";
      this.speed = 0;
      this.debugLabel = "seated";
    } else {
      this.footPos.copy(this.carry.toPos);
      this.footYaw = this.carry.toYaw;
      this.playerRoot.position.copy(this.footPos);
      this.playerRoot.rotation.set(0, this.footYaw, 0);
      this.playerRoot.scale.setScalar(1);
      this.playerRoot.userData.colKind = "character";
      this.playerAnimator?.setLocomotion({ x: 0, z: 0, speed: 0, running: false });
      this.phase = "onfoot";
      this.debugLabel = "onfoot";
    }
  }

  /** Hard brake until stopped, then exit animation. */
  private updateStopping(dt: number): void {
    this.carry.speed = this.speed;
    const ready = this.carry.updateStopping(dt);
    this.speed = this.carry.speed;

    this.carPos.x += Math.sin(this.heading) * this.speed * dt;
    this.carPos.z += Math.cos(this.heading) * this.speed * dt;
    {
      const r = this.resolveCar(this.carPos.x, this.carPos.z, this.heading, 1.05);
      this.carPos.x = r.x;
      this.carPos.z = r.z;
      this.carPos.y = r.y;
    }
    this.carRoot.position.copy(this.carPos);
    this.carRoot.rotation.y = this.heading;
    this.carRoot.rotation.z = 0;
    // Keep seated avatar in car while braking
    this.playerAnimator?.update(dt);

    if (ready) {
      this.beginExitAnim();
    }
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.tabIndex = 0;
    el.style.touchAction = "none";
    el.focus();
    this.binder.on(window, "keydown", (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === "KeyE") this.onInteract();
      if (e.code === "KeyH") this.honkPulse = 0.25;
      if (e.code === "KeyT" && this.phase === "driving") this.autoShift = !this.autoShift;
      if (e.code === "KeyM") this.cycleMission();
      if (e.code === "KeyR" && (this.phase === "onfoot" || this.phase === "combat")) {
        this.reloadT = this.gun.reload;
      }
      if (e.code === "KeyQ" && (this.phase === "onfoot" || this.phase === "combat")) {
        this.setGunDrawn(!this.gunDrawn);
      }
      if (e.code === "KeyF") {
        // Accept street race challenge / start nearby race POI
        if (this.nearChallenge && (this.phase === "driving" || this.phase === "mission")) {
          const a = this.nearChallenge;
          const meet = this.worldPois.find((p) => p.id === a.meetId) ?? null;
          this.startStreetRace(a.name, meet, a.id);
        } else if (this.dialogue?.canChallenge) {
          this.acceptChallenge();
        } else if (this.nearPoi?.kind === "race" && this.phase === "driving") {
          this.activatePoi(this.nearPoi);
        }
      }
      if (e.code === "Escape") {
        this.closeDialogue();
        this.setGunDrawn(false);
      }
      if (["Space", "KeyW", "KeyS", "KeyA", "KeyD"].includes(e.code)) e.preventDefault();
    });
    this.binder.on(window, "keyup", (e: KeyboardEvent) => this.keys.delete(e.code));
    this.binder.on(window, "contextmenu", (e: Event) => e.preventDefault());
    this.binder.on(window, "resize", () => this.onResize());
    this.binder.on(window, "blur", () => {
      this.keys.clear();
      this.aim.rmbHeld = false;
      this.wantsFire = false;
    });

    // Open-world: LMB select/fire · RMB toggle gun (hold RMB = orbit look)
    this.binder.on(el, "pointerdown", (e: PointerEvent) => {
      setCursorPress(true);
      el.setPointerCapture?.(e.pointerId);
      this.updateNdc(e);
      const onFoot = this.phase === "onfoot" || this.phase === "combat";
      if (e.button === 2) {
        this.aim.rmbHeld = true;
        if (onFoot) {
          // Short click toggles gun on pointerup if little movement
          (this as { _rmbMoved?: boolean })._rmbMoved = false;
          el.requestPointerLock?.();
        }
        return;
      }
      if (!onFoot) return;
      if (e.button === 0) {
        if (this.gunDrawn || this.aim.focusEnabled) {
          this.wantsFire = true;
          this.tryFire();
        } else {
          this.aim.selected = pickCombatTarget(
            this.pointerNdc.x,
            this.pointerNdc.y,
            this.camera,
            this.combatants,
          );
          this.hoverHostile = !!this.aim.selected && this.aim.selected.hp > 0;
          this.refreshCursor();
        }
      }
    });
    this.binder.on(el, "pointerup", (e: PointerEvent) => {
      setCursorPress(false);
      if (e.button === 0) this.wantsFire = false;
      if (e.button === 2) {
        const moved = !!(this as { _rmbMoved?: boolean })._rmbMoved;
        this.aim.rmbHeld = false;
        // Click (not drag) toggles weapon draw
        if (
          !moved &&
          (this.phase === "onfoot" || this.phase === "combat")
        ) {
          this.setGunDrawn(!this.gunDrawn);
        }
        this.refreshCursor();
      }
    });
    this.binder.on(el, "pointermove", (e: PointerEvent) => {
      this.updateNdc(e);
      const onFoot = this.phase === "onfoot" || this.phase === "combat";
      const look =
        onFoot &&
        (this.aim.rmbHeld || this.gunDrawn || document.pointerLockElement === el);
      if (look && (e.movementX || e.movementY)) {
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) {
          (this as { _rmbMoved?: boolean })._rmbMoved = true;
        }
        this.camYaw -= e.movementX * 0.0032;
        this.camPitch = Math.max(
          -0.35,
          Math.min(0.9, this.camPitch + e.movementY * 0.0024),
        );
      }
      if (onFoot || this.phase === "driving") {
        const t = pickCombatTarget(
          this.pointerNdc.x,
          this.pointerNdc.y,
          this.camera,
          this.combatants,
        );
        const was = this.hoverHostile;
        this.hoverHostile = !!(t && t.hp > 0 && (t.kind === "hostile" || t.kind === "police"));
        if (was !== this.hoverHostile) this.refreshCursor();
      }
    });
    this.binder.on(el, "pointerleave", () => {
      setCursorPress(false);
      this.hoverHostile = false;
      this.refreshCursor();
    });
    this.binder.on(document, "pointerlockchange", () => {
      if (document.pointerLockElement !== el) {
        this.aim.rmbHeld = false;
        this.refreshCursor();
      }
    });
  }

  /** Equip / holster pistol + aim-ready (RMB toggle on open world). */
  private setGunDrawn(drawn: boolean): void {
    this.gunDrawn = drawn;
    this.aim.focusEnabled = drawn;
    if (this.phase === "onfoot" || this.phase === "combat") {
      this.phase = drawn ? "combat" : "onfoot";
    }
    try {
      if (this.playerAnimator) {
        if (drawn) {
          this.playerAnimator.setWeapon("pistol", true);
          this.playerAnimator.setStrafe(true);
        } else {
          this.playerAnimator.setWeapon("unarmed", true);
          this.playerAnimator.setStrafe(false);
        }
      }
    } catch (e) {
      console.warn("[cruise] setWeapon", e);
    }
    this.refreshCursor();
  }

  /** Apply Toon RTS cursor for current game state. */
  private refreshCursor(): void {
    const nearCar =
      (this.phase === "onfoot" || this.phase === "combat") &&
      Math.hypot(this.footPos.x - this.carPos.x, this.footPos.z - this.carPos.z) <= CAR_ENTER_R;
    const hoverInteract =
      !!this.nearStreet || !!this.nearPoi || !!this.nearChallenge || nearCar;
    const next = resolveGameCursor({
      phase: this.phase,
      focusAim: this.aim.focusEnabled || this.gunDrawn,
      hoverHostile: this.hoverHostile,
      hoverInteract,
      nearCar,
    });
    if (next !== this.cursorState) {
      this.cursorState = next;
      setCursor(next);
    }
  }

  private updateNdc(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  private tryFire(): void {
    if (this.phase !== "onfoot" && this.phase !== "combat") return;
    if (!this.gunDrawn && !this.aim.focusEnabled) return;
    if (this.fireCd > 0 || this.reloadT > 0) return;
    if (this.mag <= 0) {
      this.reloadT = this.gun.reload;
      try {
        this.playerAnimator?.reload?.();
      } catch {
        /* */
      }
      return;
    }
    // Ensure pistol stance
    if (this.playerAnimator?.getWeapon?.() !== "pistol") {
      try {
        this.playerAnimator?.setWeapon("pistol", true);
        this.playerAnimator?.setStrafe(true);
      } catch {
        /* */
      }
    }
    try {
      this.playerAnimator?.shoot?.();
    } catch {
      /* */
    }
    const from = this.footPos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const to = resolveAimPoint(
      this.aim,
      this.camera,
      this.footPos,
      this.sampleGroundY(this.footPos.x, this.footPos.z),
      this.gun.range,
    ).clone();
    to.x += (Math.random() - 0.5) * this.gun.spread * 40;
    to.z += (Math.random() - 0.5) * this.gun.spread * 40;
    this.mag -= 1;
    this.fireCd = this.gun.fireCd;
    const targetId = this.aim.selected?.id ?? null;
    const p = spawnProjectile(this.scene, from, to, this.gun.damage, "player", targetId, 0xffe08a);
    this.projectiles.push(p);
  }

  private applyDamage(id: string, dmg: number, fromPlayer: boolean): void {
    if (id === "player") {
      this.playerHp = Math.max(0, this.playerHp - dmg);
      return;
    }
    const c = this.combatants.find((x) => x.id === id);
    if (!c || c.hp <= 0) return;
    c.hp = Math.max(0, c.hp - dmg);
    if (this.aim.selected?.id === id) {
      this.aim.selected.hp = c.hp;
    }
    if (c.hp <= 0) {
      c.state = "dead";
      c.mesh.visible = false;
      if (fromPlayer) this.sessionCash += c.team === "hostile" ? 80 : c.team === "police" ? 40 : 5;
    } else if (c.team === "hostile" || c.team === "police") {
      c.state = "chase";
    }
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private onInteract(): void {
    // Block E during vehicle transitions
    if (this.carry.busy || this.phase === "stopping" || this.phase === "entering" || this.phase === "exiting") {
      return;
    }

    if (this.phase === "dialogue") {
      this.continueDialogue();
      return;
    }
    if (this.phase === "race" || this.phase === "results") return;

    if (this.phase === "driving" || this.phase === "mission") {
      // Drive-by: accept AI street challenge (must be nearly stopped for race start)
      if (this.nearChallenge && Math.abs(this.speed) <= STOPPED_SPEED * 2) {
        const a = this.nearChallenge;
        const meet = this.worldPois.find((p) => p.id === a.meetId) ?? null;
        this.startStreetRace(a.name, meet, a.id);
        return;
      }
      // POI race beacon while driving (stop first if needed)
      if (this.nearPoi?.kind === "race" && Math.abs(this.speed) <= STOPPED_SPEED * 2) {
        this.activatePoi(this.nearPoi);
        return;
      }
      // Exit: slam brakes if moving, then exit animation
      this.requestExitVehicle();
      return;
    }

    if (this.phase === "onfoot" || this.phase === "combat") {
      // Enter car first when near vehicle (priority over talk if very close)
      const dCar = Math.hypot(
        this.footPos.x - this.carPos.x,
        this.footPos.z - this.carPos.z,
      );
      if (dCar <= CAR_ENTER_R) {
        if (this.gunDrawn) this.setGunDrawn(false);
        this.beginEnterAnim();
        return;
      }
      // Talk to street NPC (holster for dialogue)
      if (this.nearStreet) {
        if (this.gunDrawn) this.setGunDrawn(false);
        this.openDialogue(this.nearStreet);
        return;
      }
      // POI while on foot
      if (this.nearPoi) this.activatePoi(this.nearPoi);
    }
  }

  private openDialogue(s: StreetInstance): void {
    this.dialogueLineIdx = 0;
    this.dialogue = {
      npcId: s.npc.id,
      npcName: s.npc.name,
      title: s.npc.title,
      line: s.npc.lines[0],
      canChallenge: s.npc.canChallenge && s.npc.lines.length <= 1,
      perkLabel: s.npc.perkLabel,
      accent: s.npc.accent,
    };
    this.phase = "dialogue";
  }

  private activatePoi(p: WorldPoI): void {
    if (p.kind === "race") {
      this.seatPlayerInCar();
      this.startStreetRace("Strip Rival", p);
      return;
    }
    if (p.kind === "rave" && !this.discoveredRaves.has(p.id)) {
      this.discoveredRaves.add(p.id);
      this.sessionCash += p.reward;
      this.tickMissionProgress();
      return;
    }
    if (p.kind === "mission") {
      const m = MISSIONS.find((x) => x.poiId === p.id);
      if (m) {
        this.activeMissionId = m.id;
        this.missionProgress = 0;
        this.phase = this.phase === "onfoot" ? "onfoot" : "mission";
      }
    }
  }

  private connectNet(): void {
    const url = this.cfg.multiplayerUrl ?? resolveDriveWsUrl();
    if (!url) {
      this.netStatus = "offline";
      return;
    }
    this.netStatus = "connecting";
    this.net = new DriveNetClient(url, {
      onIntro: (_id, count) => {
        this.netStatus = "live";
        this.peers = Math.max(0, count - 1);
      },
      onPeers: (clients) => {
        this.peers = Math.max(0, Object.keys(clients).length - (this.net?.id ? 1 : 0));
        this.syncPeerMeshes(clients);
      },
      onStatus: (s) => {
        this.netStatus = s;
      },
    });
    this.net.connect(this.cfg.characterId ?? this.cfg.driverName);
  }

  private syncPeerMeshes(
    clients: Record<string, { position: number[]; rotation: number[] }>,
  ): void {
    const selfId = this.net?.id;
    const seen = new Set<string>();
    for (const [id, c] of Object.entries(clients)) {
      if (id === selfId) continue;
      seen.add(id);
      let mesh = this.peerMeshes.get(id);
      if (!mesh) {
        mesh = makeNpcCarMesh("#00f0ff", 1);
        this.scene.add(mesh);
        this.peerMeshes.set(id, mesh);
      }
      mesh.position.set(c.position[0], c.position[1] ?? 0, c.position[2]);
      mesh.rotation.y = c.rotation?.[1] ?? 0;
    }
    for (const [id, mesh] of this.peerMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        disposeObject3D(mesh);
        this.peerMeshes.delete(id);
      }
    }
  }

  private fixedUpdate(dt: number): void {
    if (this.phase === "dialogue") {
      this.playerAnimator?.update?.(dt);
      for (const s of this.street) s.animator?.update?.(dt);
      return;
    }

    const pad = this.gamepad.poll();
    const thr =
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) + (pad ? -pad.left.y : 0);
    const brk =
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) +
      (pad?.down(6) || pad?.down(7) ? 1 : 0);
    this.steerIn =
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) -
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (pad?.left.x ?? 0);
    const boost =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || !!pad?.down(0);

    // Vehicle enter/exit carry (locks player)
    if (this.phase === "entering" || this.phase === "exiting") {
      this.updateVehicleTransition(dt);
    } else if (this.phase === "stopping") {
      this.updateStopping(dt);
    } else if (this.phase === "onfoot" || this.phase === "combat") {
      this.updateFoot(dt, thr, this.steerIn);
      this.updateCombat(dt);
    } else if (this.phase === "driving" || this.phase === "race" || this.phase === "mission") {
      this.updateDriving(dt, thr, brk, boost, pad);
    }

    this.updateProximity();
    this.updateAi(dt);
    this.updateRace(dt);
    this.refreshCursor();

    const onFoot = this.phase === "onfoot" || this.phase === "combat" || this.phase === "dialogue";
    const px = onFoot ? this.footPos.x : this.carPos.x;
    const pz = onFoot ? this.footPos.z : this.carPos.z;
    const dist = districtAt(px, pz);
    if (dist && !this.discoveredDistricts.has(dist.id)) {
      this.discoveredDistricts.add(dist.id);
      this.sessionCash += 40;
      this.tickMissionProgress();
    }

    this.net?.sendMove(
      onFoot
        ? [this.footPos.x, this.footPos.y, this.footPos.z]
        : [this.carPos.x, this.carPos.y, this.carPos.z],
      [0, onFoot ? this.footYaw : this.heading, 0],
    );

    if (!onFoot || this.phase === "dialogue") this.playerAnimator?.update(dt);
    for (const s of this.street) s.animator?.update(dt);

    for (const [, obj] of this.poiById) {
      obj.rotation.y += dt * 0.8;
    }
  }

  private updateCombat(dt: number): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.mag = this.gun.magSize;
        this.reloadT = 0;
      }
    }
    if (this.wantsFire && (this.aim.focusEnabled || this.gunDrawn)) this.tryFire();

    // Auto-fire hold while focus + LMB
    this.projectiles = stepProjectiles(this.projectiles, dt, this.scene, (p) => {
      if (p.ownerId === "player") {
        // Hitscan resolve at end of tracer
        if (p.targetId) {
          this.applyDamage(p.targetId, p.damage, true);
        } else {
          // nearest hostile near impact
          let best: Combatant | null = null;
          let bd = 2.2;
          for (const c of this.combatants) {
            if (c.hp <= 0) continue;
            const d = Math.hypot(c.x - p.to.x, c.z - p.to.z);
            if (d < bd) {
              bd = d;
              best = c;
            }
          }
          if (best) this.applyDamage(best.id, p.damage, true);
        }
      } else if (p.ownerId !== "player") {
        const d = this.footPos.distanceTo(p.to);
        if (d < 1.8) this.applyDamage("player", p.damage, false);
      }
    });

    const player = { x: this.footPos.x, z: this.footPos.z, hp: this.playerHp };
    for (const c of this.combatants) {
      if (c.hp <= 0) continue;
      const { fired, aim } = stepCombatantAi(c, player, dt, (x, z) => this.sampleGroundY(x, z));
      if (fired && aim) {
        const from = new THREE.Vector3(c.x, c.y + 1.3, c.z);
        // miss chance
        const miss = (Math.random() - 0.5) * 2.5;
        aim.x += miss;
        aim.z += miss;
        this.projectiles.push(
          spawnProjectile(this.scene, from, aim, c.gun.damage * 0.55, c.id, "player", 0xff6644),
        );
      }
    }

    // World reticle (focus mode)
    if (this.worldReticle) {
      this.worldReticle.visible = this.gunDrawn || this.aim.focusEnabled;
      if (this.gunDrawn || this.aim.focusEnabled) {
        const ap = resolveAimPoint(
          this.aim,
          this.camera,
          this.footPos,
          this.sampleGroundY(this.footPos.x, this.footPos.z),
          this.gun.range,
        );
        this.worldReticle.position.set(ap.x, this.sampleGroundY(ap.x, ap.z) + 0.05, ap.z);
        const mat = this.worldReticle.material as THREE.MeshBasicMaterial;
        mat.color.set(
          this.aim.selected && this.aim.selected.hp > 0
            ? this.aim.selected.kind === "hostile" || this.aim.selected.kind === "police"
              ? 0xff5a36
              : 0x9dff00
            : 0xffc14a,
        );
      }
    }

    if (this.playerHp <= 0) {
      // soft respawn at car
      this.playerHp = this.playerMaxHp;
      this.footPos.set(this.carPos.x + 3, 0, this.carPos.z + 3);
      this.footPos.y = this.sampleGroundY(this.footPos.x, this.footPos.z);
      this.sessionCash = Math.max(0, this.sessionCash - 50);
    }
  }

  private updateFoot(dt: number, thr: number, steer: number): void {
    // Camera-relative controller (always on foot) — WASD relative to camYaw
    const fy = this.camYaw;
    const fwd = thr - (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0);
    const side =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0) -
      (steer !== 0 && !this.gunDrawn ? 0 : 0);
    // When gun holstered, A/D can also turn body slowly if no cam orbit
    if (!this.gunDrawn && !this.aim.rmbHeld && Math.abs(steer) > 0.05 && Math.abs(fwd) < 0.1 && Math.abs(side) < 0.1) {
      this.camYaw += steer * 2.1 * dt;
    }

    let mx = Math.sin(fy) * fwd + Math.cos(fy) * side;
    let mz = Math.cos(fy) * fwd - Math.sin(fy) * side;
    // keyboard thr uses KeyW as +1 via thr param
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) {
      /* thr already applied */
    }
    const len = Math.hypot(mx, mz) || 1;
    const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const sp = FOOT_SPEED * (sprint ? 1.55 : 1) * (this.gunDrawn ? 0.92 : 1);
    if (Math.hypot(mx, mz) > 0.05) {
      this.footPos.x += (mx / len) * sp * dt;
      this.footPos.z += (mz / len) * sp * dt;
    }
    const lim = this.worldHalf || 400;
    this.footPos.x = Math.max(-lim, Math.min(lim, this.footPos.x));
    this.footPos.z = Math.max(-lim, Math.min(lim, this.footPos.z));

    {
      const r = this.resolveFoot(this.footPos.x, this.footPos.z);
      this.footPos.x = r.x;
      this.footPos.z = r.z;
      this.footPos.y = r.y;
    }

    // Facing: gun drawn → camera yaw (strafe); free roam → face move dir
    const moving = Math.hypot(mx, mz) > 0.1;
    if (this.gunDrawn || this.aim.focusEnabled) {
      this.footYaw = this.camYaw;
    } else if (moving) {
      this.footYaw = Math.atan2(mx, mz);
    }

    if (this.playerRoot?.parent === this.scene) {
      this.playerRoot.position.copy(this.footPos);
      this.playerRoot.rotation.y = this.footYaw;
    }
    if (this.playerAnimator) {
      // Local-space move for strafe blend when gun drawn
      let lx = 0;
      let lz = 0;
      if (moving) {
        if (this.gunDrawn) {
          // camera-relative already; convert to body-local for strafe set
          const c = Math.cos(this.footYaw);
          const s = Math.sin(this.footYaw);
          lx = mx * c - mz * s;
          lz = mx * s + mz * c;
        } else {
          lz = 1;
          lx = 0;
        }
      }
      this.playerAnimator.setStrafe(this.gunDrawn);
      this.playerAnimator.setLocomotion({
        x: lx,
        z: lz,
        speed: moving ? (sprint ? 1 : 0.55) : 0,
        running: moving && sprint && !this.gunDrawn,
      });
      this.playerAnimator.update(dt);
    }
    this.speed = 0;
  }

  private updateDriving(
    dt: number,
    thr: number,
    brk: number,
    boost: boolean,
    pad: ReturnType<GamepadPoller["poll"]>,
  ): void {
    if (this.keys.has("KeyR") || pad?.pressed(5)) this.gearbox.shiftUp(true);
    if (this.keys.has("KeyF") || pad?.pressed(4)) this.gearbox.shiftDown();
    if (this.autoShift) this.gearbox.autoShift();

    const gearStep = this.gearbox.update(Math.max(0, this.speed), dt);
    const nos = this.nitro.update(boost, dt);
    const heatStep = this.heat.update(gearStep.rpm, thr > 0.15, nos.firing, dt);

    if (this.phase === "race" && this.raceCountdown != null && this.raceCountdown > 0) {
      this.raceCountdown -= dt;
      this.speed = 0;
      if (this.raceCountdown <= 0) this.raceCountdown = 0;
    } else {
      const top = Math.min(gearStep.cap, MAX_SPEED) * nos.speedMult;
      const accel =
        thr * 32 * gearStep.accelMult * nos.accelMult * heatStep.accelMult - brk * 42;
      this.speed += accel * dt;
      this.speed *= 1 - 0.32 * dt;
      this.speed = Math.max(-12, Math.min(top, this.speed));
      const steerRate = 1.85 * (1 - Math.min(0.7, Math.abs(this.speed) / 50));
      this.heading += this.steerIn * steerRate * dt * Math.sign(this.speed || 1);
      this.carPos.x += Math.sin(this.heading) * this.speed * dt;
      this.carPos.z += Math.cos(this.heading) * this.speed * dt;
    }

    const lim = this.worldHalf || 400;
    this.carPos.x = Math.max(-lim, Math.min(lim, this.carPos.x));
    this.carPos.z = Math.max(-lim, Math.min(lim, this.carPos.z));

    // LA mesh AABB walls or Houston grid
    {
      const r = this.resolveCar(this.carPos.x, this.carPos.z, this.heading, 1.05);
      if (r.hit) this.speed *= 0.55;
      this.carPos.x = r.x;
      this.carPos.z = r.z;
      this.carPos.y = r.y;
    }

    this.carRoot.position.copy(this.carPos);
    this.carRoot.rotation.y = this.heading;
    this.carRoot.rotation.z = -this.steerIn * 0.08 * Math.min(1, Math.abs(this.speed) / 20);
  }

  private updateProximity(): void {
    const px = this.phase === "onfoot" ? this.footPos.x : this.carPos.x;
    const pz = this.phase === "onfoot" ? this.footPos.z : this.carPos.z;

    this.nearPoi = null;
    let best = Infinity;
    for (const p of this.worldPois) {
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < INTERACT_R && d < best) {
        best = d;
        this.nearPoi = p;
      }
    }

    this.nearStreet = null;
    if (this.phase === "onfoot" || this.phase === "combat") {
      best = Infinity;
      for (const s of this.street) {
        const d = Math.hypot(s.x - this.footPos.x, s.z - this.footPos.z);
        if (d < INTERACT_R && d < best) {
          best = d;
          this.nearStreet = s;
        }
      }
    }
  }

  private updateAi(dt: number): void {
    const px = this.phase === "onfoot" ? this.footPos.x : this.carPos.x;
    const pz = this.phase === "onfoot" ? this.footPos.z : this.carPos.z;
    const missionPoi =
      this.activeMissionId != null
        ? this.worldPois.find(
            (p) => p.id === MISSIONS.find((m) => m.id === this.activeMissionId)?.poiId,
          ) ?? null
        : null;

    if (this.honkPulse > 0) this.honkPulse = Math.max(0, this.honkPulse - dt);

    stepAllAgents(this.agents, {
      dt,
      player: {
        x: px,
        z: pz,
        speed: Math.abs(this.speed),
        heat: this.heat.level,
        yaw: this.heading,
      },
      racePois: this.worldPois.filter((p) => p.kind === "race"),
      missionPoi,
      roadGraph: this.roadGraph ?? this.mapWorld?.roadGraph,
      racing: this.phase === "race",
      raceLength: this.raceLength,
      playerHonk: this.honkPulse > 0.12,
    });

    for (const a of this.agents) {
      const mesh = this.npcMeshes.get(a.id);
      if (!mesh) continue;
      const r = this.resolveCar(a.x, a.z, a.yaw, a.role === "police" ? 1.05 : 0.95);
      a.x = r.x;
      a.z = r.z;
      mesh.position.set(a.x, r.y, a.z);
      mesh.rotation.y = a.yaw;
    }

    // Drive-by challenge + radio taunts
    this.nearChallenge =
      this.phase === "driving" || this.phase === "mission"
        ? nearestChallenger(this.agents, px, pz, 38)
        : null;
    this.lastTaunt = nearestTaunt(this.agents, px, pz, 42);

    // police heat + speeding heat
    if (this.phase === "driving" || this.phase === "race" || this.phase === "mission") {
      let copNear = false;
      if (Math.abs(this.speed) > 26) {
        this.heat.level = Math.min(1, this.heat.level + dt * 0.03);
      }
      for (const a of this.agents) {
        if (a.role !== "police") continue;
        const d = Math.hypot(a.x - this.carPos.x, a.z - this.carPos.z);
        if (d < 28 && Math.abs(this.speed) > 16) {
          this.heat.level = Math.min(1, this.heat.level + dt * 0.1);
          copNear = true;
        }
        if (d < 6.5 && a.behavior === "chase" && this.heat.level > 0.55) {
          this.phase = "busted";
          this.sessionCash = Math.max(0, this.sessionCash - 120);
          this.heat.level = 0.35;
        }
      }
      if (!copNear && this.heat.level > 0 && this.phase !== "race") {
        this.heat.level = Math.max(0, this.heat.level - dt * 0.045);
      }
      // heat_escape mission: arm when heat high, complete when cool while not busted
      if (this.activeMissionId) {
        const m = MISSIONS.find((x) => x.id === this.activeMissionId);
        if (m?.kind === "heat_escape") {
          if (this.heat.level > 0.55) this.heatEscapeArmed = true;
          if (this.heatEscapeArmed && this.heat.level < 0.12 && this.phase !== "busted") {
            this.missionProgress = m.goal;
            this.sessionCash += m.reward;
            this.activeMissionId = null;
            this.heatEscapeArmed = false;
          }
        }
      }
      if (this.phase === "busted" && this.heat.level < 0.12) this.phase = "driving";
    }
  }

  private updateRace(dt: number): void {
    // Green light — release rival after countdown
    if (
      this.phase === "race" &&
      this.raceCountdown != null &&
      this.raceCountdown <= 0 &&
      this.racePendingAgentId
    ) {
      const agent = this.agents.find((a) => a.id === this.racePendingAgentId);
      if (agent) {
        this.raceRivalId = agent.id;
        beginNpcRace(agent, this.carPos.x, this.raceStartZ);
      }
      this.racePendingAgentId = null;
    }

    if (this.phase === "race" && (this.raceCountdown == null || this.raceCountdown <= 0)) {
      this.raceProgress = Math.max(0, this.carPos.z - this.raceStartZ);
      const rival = this.raceRivalId
        ? this.agents.find((a) => a.id === this.raceRivalId)
        : this.agents.find((a) => a.behavior === "race");
      this.raceRivalProgress = rival?.raceMeters ?? 0;
      if (this.raceProgress >= this.raceLength) {
        const rivalDone = this.raceRivalProgress >= this.raceLength - 2;
        this.finishRace(!rivalDone || this.raceProgress >= this.raceRivalProgress);
      } else if (this.raceRivalProgress >= this.raceLength) {
        this.finishRace(false);
      }
    }
    if (this.phase === "results") {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) {
        this.phase = "driving";
        this._lastResult = null;
        this.raceRivalId = null;
      }
    }
  }

  private startStreetRace(
    rivalName: string,
    poi: WorldPoI | null,
    rivalAgentId?: string,
  ): void {
    this.phase = "race";
    this.raceCountdown = 3.2;
    this.raceProgress = 0;
    this.raceRivalProgress = 0;
    this.raceRivalName = rivalName;
    this.raceLength = poi?.raceLength ?? RACE_LEN;
    this._lastResult = null;
    if (poi) {
      this.carPos.x = poi.x;
      this.carPos.z = poi.z;
      this.heading = 0;
      this.raceStartZ = poi.z;
    } else {
      this.raceStartZ = this.carPos.z;
    }
    this.gearbox.reset();
    this.nitro.reset();
    this.speed = 0;
    this.forceSeatInCar();
    this.phase = "race";

    const agent =
      (rivalAgentId ? this.agents.find((a) => a.id === rivalAgentId) : null) ??
      this.agents.find((a) => a.role === "racer" && a.challenging) ??
      this.agents.find((a) => a.role === "racer");
    // Stage rival at line; start motion after countdown green
    if (agent) {
      this.raceRivalId = agent.id;
      this.racePendingAgentId = agent.id;
      agent.x = this.carPos.x + 3.5;
      agent.z = this.raceStartZ;
      agent.yaw = 0;
      agent.raceMeters = 0;
      agent.behavior = "park";
      agent.path = null;
    } else {
      this.raceRivalId = null;
      this.racePendingAgentId = null;
    }
  }

  private finishRace(won: boolean): void {
    const payout = won ? 700 : 180;
    this.sessionCash += payout;
    if (won) this.racesWon += 1;
    this.phase = "results";
    this.raceCountdown = null;
    this.resultTimer = 3.2;
    this._lastResult = { won, cash: payout };
    // Return rival to wait
    if (this.raceRivalId) {
      const a = this.agents.find((x) => x.id === this.raceRivalId);
      if (a) {
        a.behavior = "race_wait";
        a.challengeCd = 16;
        a.raceMeters = 0;
      }
    }
  }

  private cycleMission(): void {
    const idx = MISSIONS.findIndex((m) => m.id === this.activeMissionId);
    const next = MISSIONS[(idx + 1 + MISSIONS.length) % MISSIONS.length];
    this.activeMissionId = next.id;
    this.missionProgress = 0;
  }

  private tickMissionProgress(): void {
    if (!this.activeMissionId) return;
    const m = MISSIONS.find((x) => x.id === this.activeMissionId);
    if (!m) return;
    if (m.kind === "district_tour") {
      const east = DISTRICTS.filter((d) => d.zone === "east").map((d) => d.id);
      this.missionProgress = east.filter((id) => this.discoveredDistricts.has(id)).length;
    } else if (m.kind === "collect_raves") {
      this.missionProgress = this.discoveredRaves.size;
    }
    if (this.missionProgress >= m.goal) {
      this.sessionCash += m.reward;
      this.activeMissionId = null;
    }
  }

  private render(dt: number): void {
    if (
      this.phase === "onfoot" ||
      this.phase === "combat" ||
      this.phase === "dialogue"
    ) {
      // Orbit free-look (camYaw/pitch) — tighter over-shoulder when gun drawn
      const bound = Math.max(80, this.worldHalf || 400);
      if (this.gunDrawn || this.aim.focusEnabled) {
        updateDangerRoomCamera(this.camera, this.footPos, this.camYaw, this.camPitch, dt, {
          distance: 3.6,
          height: 1.55,
          fov: 56,
          bound,
          followLerp: 14,
        });
      } else {
        updateDangerRoomCamera(this.camera, this.footPos, this.camYaw, this.camPitch, dt, {
          distance: 6.8,
          height: 2.6,
          fov: 62,
          bound,
          followLerp: 9,
        });
      }
    } else if (this.phase === "exiting" || this.phase === "entering") {
      const lookAt = this.playerRoot?.position ?? this.footPos;
      const yaw = this.playerRoot?.rotation.y ?? this.footYaw;
      updateFootChaseCamera(
        this.camera,
        lookAt,
        yaw,
        { distance: 5.5, height: 2.8, targetHeight: 1.35, lerp: 0.2 },
        dt,
      );
    } else {
      // Sync free-look with car heading when driving
      this.camYaw = this.heading;
      updateChaseCamera(
        this.camera,
        {
          subject: this.carPos,
          yaw: this.heading,
          speed: Math.abs(this.speed),
          maxSpeed: MAX_SPEED,
          steer: this.steerIn,
          slip: 0,
          boosting: this.nitro.active,
          dt,
        },
        {
          fov: CONFIG.camera.fov,
          speedFovKick: CONFIG.camera.speedFovKick,
          nosFovKick: 6,
          drive: CONFIG.camera.drive,
        },
      );
      const frac = Math.max(0, (Math.abs(this.speed) - 12) / (MAX_SPEED - 12));
      this.speedFx?.update(frac, this.nitro.active, dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Project nearby NPCs / hostiles to screen for nameplate identifiers. */
  private collectNameplates(): CruiseHudState["nameplates"] {
    const out: CruiseHudState["nameplates"] = [];
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const add = (
      id: string,
      name: string,
      role: string,
      accent: string,
      x: number,
      y: number,
      z: number,
    ) => {
      const dx = x - this.camera.position.x;
      const dz = z - this.camera.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 42 || dist < 0.5) return;
      this._proj.set(x, y + 2.05, z);
      this._proj.project(this.camera);
      if (this._proj.z > 1) return;
      const sx = (this._proj.x * 0.5 + 0.5) * w;
      const sy = (-this._proj.y * 0.5 + 0.5) * h;
      if (sx < -40 || sx > w + 40 || sy < -20 || sy > h + 20) return;
      out.push({ id, name, role, accent, sx, sy, dist });
    };
    for (const s of this.street) {
      add(s.npc.id, s.npc.name, s.npc.role, s.npc.accent, s.x, s.mesh.position.y, s.z);
    }
    for (const c of this.combatants) {
      if (c.hp <= 0) continue;
      add(c.id, c.name, c.team, c.accent, c.x, c.y, c.z);
    }
    out.sort((a, b) => b.dist - a.dist);
    return out.slice(0, 24);
  }

  private pushHud(): void {
    const onFoot =
      this.phase === "onfoot" || this.phase === "combat" || this.phase === "dialogue";
    const px = onFoot ? this.footPos.x : this.carPos.x;
    const pz = onFoot ? this.footPos.z : this.carPos.z;
    const label = districtLabel(districtAt(px, pz));
    const m = this.activeMissionId
      ? MISSIONS.find((x) => x.id === this.activeMissionId)
      : null;
    const nearCar =
      (this.phase === "onfoot" || this.phase === "combat") &&
      Math.hypot(this.footPos.x - this.carPos.x, this.footPos.z - this.carPos.z) <= CAR_ENTER_R;

    let prompt = "WASD · E exit · H honk · Shift NOS · M mission";
    if (this.phase === "stopping") {
      prompt = "🛑 Braking… (must full-stop to exit)";
    } else if (this.phase === "exiting") {
      prompt = "🚶 Exiting car…";
    } else if (this.phase === "entering") {
      prompt = "🚗 Entering car…";
    } else if (this.phase === "onfoot" || this.phase === "combat") {
      if (this.gunDrawn || this.aim.focusEnabled) {
        prompt = layerPrompt(
          "gunfight",
          `GUN OUT · LMB fire · R reload · RMB/Q holster · ${this.gun.label} ${this.mag}/${this.gun.magSize}`,
        );
      } else if (nearCar) prompt = "[E] Enter vehicle · RMB draw gun · LMB select";
      else if (this.nearStreet)
        prompt = `[E] Talk ${this.nearStreet.npc.name} · F race if offered · RMB gun`;
      else if (this.nearPoi) prompt = `[E] ${this.nearPoi.name}`;
      else
        prompt = layerPrompt(
          "free_roam",
          "WASD · hold RMB look · click RMB draw gun · E talk/car",
        );
    } else if (this.phase === "driving" || this.phase === "mission") {
      if (Math.abs(this.speed) > STOPPED_SPEED) {
        prompt = layerPrompt(
          this.heat.level > 0.45 ? "wanted" : "free_roam",
          "[E] Brake & exit · H honk · Shift NOS · F accept race",
        );
      } else if (this.nearChallenge) {
        prompt = layerPrompt(
          "street_race",
          `[E] or [F] Race ${this.nearChallenge.name}`,
        );
      } else if (this.nearPoi?.kind === "race") {
        prompt = layerPrompt("street_race", `[E]/[F] Start ${this.nearPoi.name}`);
      } else {
        prompt = "Stopped · [E] exit on foot · find race meets";
      }
    } else if (this.phase === "dialogue") {
      prompt = "E continue · F accept race · Esc leave";
    } else if (this.phase === "race") {
      prompt =
        this.raceCountdown && this.raceCountdown > 0
          ? `Race vs ${this.raceRivalName} — ${Math.ceil(this.raceCountdown)}`
          : `YOU ${Math.floor(this.raceProgress)}m  ·  RIVAL ${Math.floor(this.raceRivalProgress)}m  / ${this.raceLength}m`;
    } else if (this.phase === "results" && this._lastResult) {
      prompt = this._lastResult.won
        ? `WIN +$${this._lastResult.cash}`
        : `LOSS +$${this._lastResult.cash}`;
    } else if (this.phase === "busted") {
      prompt = "BUSTED — cool heat before cops leave";
    }

    const blips = [
      ...agentsToBlips(this.agents),
      ...this.street.map((s) => ({
        id: s.npc.id,
        x: s.x,
        z: s.z,
        kind: "npc" as const,
        accent: s.npc.accent,
      })),
      ...this.combatants
        .filter((c) => c.hp > 0)
        .map((c) => ({
          id: c.id,
          x: c.x,
          z: c.z,
          kind: (c.team === "police" ? "police" : "npc") as "police" | "npc",
          accent: c.accent,
        })),
      ...this.worldPois.map((p) => ({
        id: p.id,
        x: p.x,
        z: p.z,
        kind: p.kind as "race" | "mission" | "rave" | "garage",
      })),
      {
        id: "car",
        x: this.carPos.x,
        z: this.carPos.z,
        kind: "car" as const,
        accent: this.cfg.carAccent,
      },
      {
        id: "player",
        x: px,
        z: pz,
        kind: "player" as const,
        accent: "#00f0ff",
      },
    ];

    // Dialogue canChallenge when on last line
    let dialogue = this.dialogue;
    if (dialogue) {
      const npc = streetNpcById(dialogue.npcId);
      if (npc && this.dialogueLineIdx >= npc.lines.length - 1) {
        dialogue = { ...dialogue, canChallenge: npc.canChallenge };
      }
    }

    this.onHud(
      emptyCruiseHud({
        phase: this.phase,
        carName: this.cfg.carName,
        driverName: this.cfg.driverName,
        speed: Math.abs(this.speed) * SPEED_DISPLAY,
        gear: this.gearbox.gear,
        rpm: this.gearbox.rpm,
        autoShift: this.autoShift,
        heat: this.heat.level,
        overheat: this.heat.level >= 0.85,
        nos: this.nitro.level,
        boosting: this.nitro.active,
        district: label.name,
        districtAccent: label.accent,
        prompt,
        nearPoi: this.nearPoi,
        nearNpcName: this.nearStreet?.npc.name ?? this.nearChallenge?.name ?? null,
        nearCar,
        dialogue,
        missionTitle: m?.title ?? null,
        missionProgress: this.missionProgress,
        missionGoal: m?.goal ?? 0,
        raceRivalProgress: this.raceRivalProgress,
        raceLength: this.raceLength,
        challengeOffer: this.nearChallenge
          ? {
              id: this.nearChallenge.id,
              name: this.nearChallenge.name,
              accent: this.nearChallenge.accent,
            }
          : null,
        taunt: this.lastTaunt,
        sessionCash: this.sessionCash,
        discoveredDistricts: [...this.discoveredDistricts],
        discoveredRaves: [...this.discoveredRaves],
        racesWon: this.racesWon,
        raceCountdown: this.raceCountdown,
        raceProgress: this.raceProgress,
        raceRivalName: this.raceRivalName,
        blips,
        playerX: px,
        playerZ: pz,
        playerYaw:
          this.phase === "onfoot" || this.phase === "combat" || this.phase === "dialogue"
            ? this.footYaw
            : this.heading,
        peers: this.peers,
        netStatus: this.netStatus,
        result: this._lastResult ? (this._lastResult.won ? "win" : "lose") : null,
        resultCash: this._lastResult?.cash ?? 0,
        focusAim: this.aim.focusEnabled || this.gunDrawn,
        gunDrawn: this.gunDrawn,
        playerHp: this.playerHp,
        playerMaxHp: this.playerMaxHp,
        gunLabel: this.gun.label,
        mag: this.mag,
        magSize: this.gun.magSize,
        targetName: this.aim.selected && this.aim.selected.hp > 0
          ? this.combatants.find((c) => c.id === this.aim.selected!.id)?.name ?? "Target"
          : null,
        targetHp: this.aim.selected?.hp ?? 0,
        mapCredit: this.gangMap ? this.mapCredit : null,
        worldName: this.gangMap ? "LA Gangwar Streets" : "Houston Cruise",
        nameplates: this.collectNameplates(),
        raceBanner:
          this.phase === "race" && this.raceCountdown != null && this.raceCountdown > 0
            ? this.raceCountdown > 2.2
              ? "READY"
              : this.raceCountdown > 1.1
                ? "SET"
                : "GO!"
            : this.phase === "race"
              ? `RACE · ${this.raceRivalName ?? "Rival"}`
              : this.phase === "results" && this._lastResult
                ? this._lastResult.won
                  ? "VICTORY"
                  : "DEFEAT"
                : null,
      }),
    );
  }
}
