// Socket.IO v0.9 protocol types.
// Reference: https://github.com/socketio/socket.io-protocol (v1, used by Overleaf)

/** Socket.IO v0.9 packet types */
export const PacketType = {
  Disconnect: 0,
  Connect: 1,
  Heartbeat: 2,
  Message: 3,
  Json: 4,
  Event: 5,
  Ack: 6,
  Error: 7,
  Noop: 8,
} as const;

export type PacketTypeValue = (typeof PacketType)[keyof typeof PacketType];

/** A decoded Socket.IO v0.9 packet */
export interface Packet {
  type: PacketTypeValue;
  id?: string;
  ack?: boolean; // true if id ends with '+' (expects data ack)
  endpoint?: string;
  data?: unknown;
}

/** Handshake response from the server */
export interface HandshakeResult {
  sessionId: string;
  heartbeatTimeout: number;
  closeTimeout: number;
  transports: string[];
}

/** Socket.IO client state */
export const ConnectionState = {
  Disconnected: 'disconnected',
  Handshaking: 'handshaking',
  Connecting: 'connecting',
  Connected: 'connected',
  Reconnecting: 'reconnecting',
} as const;

export type ConnectionStateValue = (typeof ConnectionState)[keyof typeof ConnectionState];

/** Configuration for the Socket.IO client */
export interface SocketIOClientOptions {
  serverUrl: string;
  cookies: string;
  query?: Record<string, string>;
  extraHeaders?: Record<string, string>;
}
