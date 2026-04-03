// Custom Socket.IO v0.9 client.
// Uses npm:ws for WebSocket (Deno's built-in WebSocket cannot send custom headers,
// but Overleaf requires Cookie headers on the WebSocket upgrade for GCLB affinity).

import { encodePacket, decodePacket } from './socketio_parser.ts';
import {
  ConnectionState,
  PacketType,
  type ConnectionStateValue,
  type HandshakeResult,
  type Packet,
  type SocketIOClientOptions,
} from './socketio_types.ts';
import { EventEmitter } from '../util/event_emitter.ts';
import { logger } from '../util/logger.ts';
import WS from 'npm:ws@^8.18.0';

type AckCallback = (err: Error | null, ...args: unknown[]) => void;

interface SocketIOEvents {
  connect: () => void;
  disconnect: (reason: string) => void;
  error: (err: Error) => void;
  // deno-lint-ignore no-explicit-any
  event: (name: string, args: any[]) => void;
  stateChange: (state: ConnectionStateValue) => void;
}

export class SocketIOClient extends EventEmitter<SocketIOEvents> {
  private options: SocketIOClientOptions;
  private ws: WS | null = null;
  private heartbeatTimer: number | null = null;
  private heartbeatTimeout = 25;
  closeTimeout = 60;
  private sessionId = '';
  private ackCounter = 0;
  private pendingAcks = new Map<string, AckCallback>();
  private _state: ConnectionStateValue = ConnectionState.Disconnected;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: number | null = null;

  constructor(options: SocketIOClientOptions) {
    super();
    this.options = options;
  }

  get state(): ConnectionStateValue {
    return this._state;
  }

  private setState(state: ConnectionStateValue): void {
    if (this._state === state) return;
    this._state = state;
    this.emit('stateChange', state);
  }

  /** Connect to the Socket.IO server (handshake + WebSocket). */
  async connect(): Promise<void> {
    if (
      this._state !== ConnectionState.Disconnected &&
      this._state !== ConnectionState.Reconnecting
    ) {
      throw new Error(`Cannot connect in state: ${this._state}`);
    }

    this.setState(ConnectionState.Handshaking);

    let hs: HandshakeResult;
    try {
      hs = await this.handshake();
    } catch (err) {
      this.setState(ConnectionState.Disconnected);
      throw err;
    }

    this.sessionId = hs.sessionId;
    this.heartbeatTimeout = hs.heartbeatTimeout;
    this.closeTimeout = hs.closeTimeout;

    this.setState(ConnectionState.Connecting);
    try {
      await this.openWebSocket();
    } catch (err) {
      this.setState(ConnectionState.Disconnected);
      throw err;
    }
  }

  /** Disconnect and clean up. */
  disconnect(): void {
    this.clearTimers();
    if (this.ws) {
      try {
        if (this.ws.readyState === WS.OPEN) {
          this.ws.send(encodePacket({ type: PacketType.Disconnect }));
        }
      } catch { /* ignore send errors on close */ }
      this.ws.close();
      this.ws = null;
    }
    this.pendingAcks.clear();
    this.sessionId = '';
    this.reconnectAttempts = 0;
    this.setState(ConnectionState.Disconnected);
    this.emit('disconnect', 'client');
  }

  /** Emit a Socket.IO event to the server. */
  emitEvent(name: string, args: unknown[], callback?: AckCallback): void {
    const pkt: Packet = {
      type: PacketType.Event,
      data: { name, args },
    };

    if (callback) {
      const id = String(++this.ackCounter);
      pkt.id = id;
      pkt.ack = true;
      this.pendingAcks.set(id, callback);
    }

    this.sendPacket(pkt);
  }

  private sendPacket(pkt: Packet): void {
    if (!this.ws || this.ws.readyState !== WS.OPEN) {
      logger.warn('Cannot send packet, WebSocket not open');
      return;
    }
    const encoded = encodePacket(pkt);
    logger.debug('>>> %s', encoded.substring(0, 200));
    this.ws.send(encoded);
  }

  private buildQueryString(): string {
    const params = new URLSearchParams(this.options.query ?? {});
    params.set('t', String(Date.now()));
    return params.toString();
  }

  /** HTTP handshake: GET /socket.io/1/?query */
  private async handshake(): Promise<HandshakeResult> {
    const url = `${this.options.serverUrl}/socket.io/1/?${this.buildQueryString()}`;
    logger.debug('Handshake: %s', url);

    const headers: Record<string, string> = {
      Cookie: this.options.cookies,
      Origin: this.options.serverUrl,
      ...this.options.extraHeaders,
    };

    const resp = await fetch(url, { headers, redirect: 'manual' });

    // Merge Set-Cookie from handshake response (may contain updated session cookies)
    const setCookies = resp.headers.getSetCookie();
    if (setCookies.length > 0) {
      this.mergeCookies(setCookies);
    }

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Handshake failed (${resp.status}): ${body}`);
    }

    const text = await resp.text();
    const parts = text.split(':');
    if (parts.length < 4) {
      throw new Error(`Invalid handshake response: ${text}`);
    }

    logger.debug('Handshake OK: session=%s transports=%s', parts[0], parts[3]);

    return {
      sessionId: parts[0],
      heartbeatTimeout: Number(parts[1]),
      closeTimeout: Number(parts[2]),
      transports: parts[3].split(','),
    };
  }

  /** Merge Set-Cookie headers into our cookie string. */
  private mergeCookies(setCookies: string[]): void {
    const existing = new Map<string, string>();
    for (const part of this.options.cookies.split(';')) {
      const eq = part.indexOf('=');
      if (eq !== -1) {
        existing.set(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
      }
    }
    for (const sc of setCookies) {
      const nameValue = sc.split(';')[0];
      const eq = nameValue.indexOf('=');
      if (eq !== -1) {
        existing.set(nameValue.substring(0, eq).trim(), nameValue.substring(eq + 1).trim());
      }
    }
    this.options.cookies = [...existing.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Open WebSocket with npm:ws (supports custom headers). */
  private openWebSocket(): Promise<void> {
    const wsProtocol = this.options.serverUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.options.serverUrl.replace(/^https?/, '');
    const query = this.buildQueryString();
    const url = `${wsProtocol}${host}/socket.io/1/websocket/${this.sessionId}?${query}`;
    logger.debug('WebSocket connecting: %s', url);

    return new Promise((resolve, reject) => {
      let settled = false;

      const ws = new WS(url, {
        headers: {
          Cookie: this.options.cookies,
          Origin: this.options.serverUrl,
        },
      });
      this.ws = ws;

      ws.on('open', () => {
        logger.debug('WebSocket opened');
      });

      ws.on('message', (data: WS.Data) => {
        const raw = String(data);
        this.onMessage(raw);

        if (!settled && this._state === ConnectionState.Connected) {
          settled = true;
          resolve();
        }
      });

      ws.on('error', (err: Error) => {
        logger.error('WebSocket error: %s', err.message);
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket error: ${err.message}`));
        }
      });

      ws.on('close', (code: number, reason: Uint8Array) => {
        const reasonStr = new TextDecoder().decode(reason);
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket closed before connect: ${code} ${reasonStr}`));
        }
        this.onClose(code, reasonStr);
      });
    });
  }

  private onMessage(raw: string): void {
    logger.debug('<<< %s', raw.substring(0, 200));
    let pkt: Packet;
    try {
      pkt = decodePacket(raw);
    } catch (err) {
      logger.error('Failed to decode packet: %s', err);
      return;
    }

    switch (pkt.type) {
      case PacketType.Connect:
        this.setState(ConnectionState.Connected);
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        this.emit('connect');
        break;

      case PacketType.Heartbeat:
        this.sendPacket({ type: PacketType.Heartbeat });
        break;

      case PacketType.Event: {
        const data = pkt.data as { name: string; args: unknown[] };
        this.emit('event', data.name, data.args ?? []);
        break;
      }

      case PacketType.Ack: {
        if (pkt.id) {
          const cb = this.pendingAcks.get(pkt.id);
          if (cb) {
            this.pendingAcks.delete(pkt.id);
            const args = Array.isArray(pkt.data) ? pkt.data : [];
            // Server sends error-first: [err, ...data].
            // Pass through directly — err is args[0], rest is data.
            const err = args[0] != null ? new Error(String(args[0])) : null;
            cb(err, ...args.slice(1));
          }
        }
        break;
      }

      case PacketType.Error:
        this.emit('error', new Error(`Server error: ${pkt.data}`));
        break;

      case PacketType.Disconnect:
        this.disconnect();
        break;

      case PacketType.Noop:
        break;

      default:
        logger.debug('Unhandled packet type: %d', pkt.type);
    }
  }

  private onClose(code: number, reason: string): void {
    logger.info('WebSocket closed: code=%d reason=%s', code, reason);
    this.clearTimers();
    this.ws = null;

    if (
      this._state !== ConnectionState.Disconnected &&
      this._state !== ConnectionState.Reconnecting
    ) {
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.clearHeartbeatTimer();
    const interval = this.heartbeatTimeout * 0.8 * 1000;
    this.heartbeatTimer = setInterval(() => {
      this.sendPacket({ type: PacketType.Heartbeat });
    }, interval);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHeartbeatTimer();
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnect attempts (%d) exhausted', this.maxReconnectAttempts);
      this.setState(ConnectionState.Disconnected);
      this.emit('disconnect', 'max_retries');
      return;
    }

    this.setState(ConnectionState.Reconnecting);
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 16000);
    this.reconnectAttempts++;
    logger.info('Reconnecting in %dms (attempt %d)', delay, this.reconnectAttempts);

    this.reconnectTimer = setTimeout(async () => {
      if (this._state !== ConnectionState.Reconnecting) return;
      try {
        await this.connect();
      } catch (err) {
        logger.error('Reconnect failed: %s', err);
        this.scheduleReconnect();
      }
    }, delay);
  }
}
