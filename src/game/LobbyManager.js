/**
 * LobbyManager — Multiplayer lobby, matchmaking, and game session management.
 *
 * Connects to the Grudge Studio WebSocket backend for:
 *   - Lobby creation/joining
 *   - Player readying, kart selection, track voting
 *   - Real-time race state sync (positions, weapons, health)
 *   - NPC fill when not enough human players
 *
 * Backend: wss://ws.grudge-studio.com (VITE_WS_URL override)
 * Auth: grudge_auth_token sent on connect
 */

import { GAME_MODES, TRACKS, getTrackById } from './TrackRegistry.js';
import { getKartById, getAvailableKarts, randomKartFromTier } from './KartRegistry.js';

const WS_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL)
  || 'wss://ws.grudge-studio.com';

// ── Lobby states ────────────────────────────────────────────────────

const STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING:   'connecting',
  IN_MENU:      'in_menu',
  IN_LOBBY:     'in_lobby',
  KART_SELECT:  'kart_select',
  LOADING:      'loading',
  RACING:       'racing',
  RESULTS:      'results',
};

// ── Lobby Manager ───────────────────────────────────────────────────

export class LobbyManager {
  constructor() {
    this.ws = null;
    this.state = STATE.DISCONNECTED;
    this.playerId = null;
    this.playerName = '';
    this.playerRaceId = '';
    this.lobby = null;           // { id, hostId, mode, trackId, players[], settings }
    this.gameSession = null;     // active race/battle session data
    this._listeners = {};
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
  }

  // ── Connection ────────────────────────────────────────────────────

  connect(authToken, grudgeId, username) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.state = STATE.CONNECTING;
    this.playerId = grudgeId;
    this.playerName = username;

    const url = `${WS_URL}/drive?token=${encodeURIComponent(authToken)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.state = STATE.IN_MENU;
      this._startHeartbeat();
      this._send('identify', { grudgeId, username });
      this._emit('connected');
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this._handleMessage(msg);
      } catch (e) {
        console.warn('[Lobby] Bad message:', e);
      }
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      this.state = STATE.DISCONNECTED;
      this._emit('disconnected');
      // Auto-reconnect after 3s
      this._reconnectTimer = setTimeout(() => {
        if (authToken) this.connect(authToken, grudgeId, username);
      }, 3000);
    };

    this.ws.onerror = (e) => {
      console.warn('[Lobby] WebSocket error:', e);
    };
  }

  disconnect() {
    clearTimeout(this._reconnectTimer);
    this._stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.state = STATE.DISCONNECTED;
    this.lobby = null;
  }

  // ── Lobby actions ─────────────────────────────────────────────────

  /** Create a new lobby. */
  createLobby(modeId, trackId, settings = {}) {
    this._send('lobby:create', {
      mode: modeId,
      trackId,
      maxPlayers: GAME_MODES[modeId]?.maxPlayers || 8,
      fillWithNPC: settings.fillWithNPC !== false,
      isPrivate: settings.isPrivate || false,
      ...settings,
    });
  }

  /** Join an existing lobby by ID or quickmatch. */
  joinLobby(lobbyId) {
    this._send('lobby:join', { lobbyId });
  }

  /** Quick match — find or create a lobby for the given mode. */
  quickMatch(modeId) {
    this._send('lobby:quickmatch', { mode: modeId });
  }

  /** Leave the current lobby. */
  leaveLobby() {
    this._send('lobby:leave', {});
    this.lobby = null;
    this.state = STATE.IN_MENU;
    this._emit('lobby:left');
  }

  /** Toggle ready status. */
  setReady(ready) {
    this._send('lobby:ready', { ready });
  }

  /** Select a kart for the current lobby. */
  selectKart(kartId) {
    this._send('lobby:kart', { kartId });
  }

  /** Vote for a track (host picks, others vote). */
  voteTrack(trackId) {
    this._send('lobby:vote_track', { trackId });
  }

  /** Host starts the game. */
  startGame() {
    this._send('lobby:start', {});
  }

  // ── In-game sync ──────────────────────────────────────────────────

  /** Send player state to all peers each frame. */
  sendPlayerState(position, rotation, speed, health, nitro) {
    if (this.state !== STATE.RACING) return;
    this._send('game:state', {
      pos: [position.x, position.y, position.z],
      rot: [rotation.x, rotation.y, rotation.z, rotation.w],
      spd: speed,
      hp: health,
      ni: nitro,
    });
  }

  /** Send a weapon fire event. */
  sendWeaponFire(weaponType, targetPos) {
    this._send('game:weapon', { type: weaponType, target: targetPos });
  }

  /** Send checkpoint reached. */
  sendCheckpoint(checkpointIndex, lap) {
    this._send('game:checkpoint', { cp: checkpointIndex, lap });
  }

  /** Send race finished. */
  sendFinish(totalTime) {
    this._send('game:finish', { time: totalTime });
  }

  // ── Message handling ──────────────────────────────────────────────

  _handleMessage(msg) {
    switch (msg.type) {
      case 'lobby:created':
      case 'lobby:joined':
        this.lobby = msg.lobby;
        this.state = STATE.IN_LOBBY;
        this._emit('lobby:updated', this.lobby);
        break;

      case 'lobby:updated':
        this.lobby = msg.lobby;
        this._emit('lobby:updated', this.lobby);
        break;

      case 'lobby:player_joined':
        if (this.lobby) {
          this.lobby.players = msg.players;
          this._emit('lobby:player_joined', msg.player);
        }
        break;

      case 'lobby:player_left':
        if (this.lobby) {
          this.lobby.players = msg.players;
          this._emit('lobby:player_left', msg.playerId);
        }
        break;

      case 'lobby:countdown':
        this.state = STATE.LOADING;
        this._emit('lobby:countdown', msg.seconds);
        break;

      case 'game:start':
        this.state = STATE.RACING;
        this.gameSession = msg.session;
        this._emit('game:start', msg.session);
        break;

      case 'game:peer_state':
        this._emit('game:peer_state', msg);
        break;

      case 'game:peer_weapon':
        this._emit('game:peer_weapon', msg);
        break;

      case 'game:peer_checkpoint':
        this._emit('game:peer_checkpoint', msg);
        break;

      case 'game:peer_finish':
        this._emit('game:peer_finish', msg);
        break;

      case 'game:results':
        this.state = STATE.RESULTS;
        this._emit('game:results', msg.results);
        break;

      case 'error':
        console.warn('[Lobby] Server error:', msg.error);
        this._emit('error', msg.error);
        break;

      case 'pong':
        break; // heartbeat response

      default:
        console.debug('[Lobby] Unknown message:', msg.type);
    }
  }

  // ── Event system ──────────────────────────────────────────────────

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error(`[Lobby] Event handler error (${event}):`, e); }
    });
  }

  // ── Internal ──────────────────────────────────────────────────────

  _send(type, data) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('[Lobby] Not connected, dropping message:', type);
      return;
    }
    this.ws.send(JSON.stringify({ type, ...data }));
  }

  _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      this._send('ping', {});
    }, 25000);
  }

  _stopHeartbeat() {
    clearInterval(this._heartbeatTimer);
    this._heartbeatTimer = null;
  }

  // ── Static helpers ────────────────────────────────────────────────

  get isConnected() { return this.ws?.readyState === WebSocket.OPEN; }
  get isInLobby() { return this.state === STATE.IN_LOBBY || this.state === STATE.KART_SELECT; }
  get isRacing() { return this.state === STATE.RACING; }
  get isHost() { return this.lobby?.hostId === this.playerId; }

  /** Build a lobby-ready player summary. */
  getPlayerSummary() {
    return {
      id: this.playerId,
      name: this.playerName,
      raceId: this.playerRaceId,
    };
  }
}

// Export singleton
export const lobbyManager = new LobbyManager();
export { STATE as LOBBY_STATE };
