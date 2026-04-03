// Socket.IO v0.9 packet encoder/decoder.
// Wire format: "type:id[+]:endpoint[:data]"
// Connect/Heartbeat have no data field: "type::endpoint"
// Message/Json/Event/Error have data: "type:id[+]:endpoint:data"
// Ack: "6:::id+[json]"

import type { Packet, PacketTypeValue } from './socketio_types.ts';
import { PacketType } from './socketio_types.ts';

const VALID_TYPES = new Set(Object.values(PacketType));

const HAS_DATA: ReadonlySet<PacketTypeValue> = new Set([
  PacketType.Message,
  PacketType.Json,
  PacketType.Event,
  PacketType.Ack,
  PacketType.Error,
]);

/** Encode a Packet to the Socket.IO v0.9 wire format. */
export function encodePacket(pkt: Packet): string {
  const t = String(pkt.type);

  if (pkt.type === PacketType.Disconnect || pkt.type === PacketType.Noop) {
    return t;
  }

  const id = pkt.id ?? '';
  const ackSuffix = pkt.ack ? '+' : '';
  const endpoint = pkt.endpoint ?? '';

  // Ack has a special data format: "6:::id+[json]"
  if (pkt.type === PacketType.Ack && pkt.id != null) {
    const ackData = pkt.data != null ? JSON.stringify(pkt.data) : '';
    return `${t}:::${pkt.id}+${ackData}`;
  }

  // Connect and Heartbeat have no data field
  if (!HAS_DATA.has(pkt.type)) {
    return `${t}:${id}${ackSuffix}:${endpoint}`;
  }

  // Message/Json/Event/Error have data
  let data = '';
  if (pkt.type === PacketType.Json || pkt.type === PacketType.Event) {
    data = pkt.data != null ? JSON.stringify(pkt.data) : '';
  } else {
    data = pkt.data != null ? String(pkt.data) : '';
  }

  return `${t}:${id}${ackSuffix}:${endpoint}:${data}`;
}

/** Decode a Socket.IO v0.9 wire-format string to a Packet. */
export function decodePacket(raw: string): Packet {
  if (raw.length === 0) {
    throw new Error('Empty packet');
  }

  const typeNum = Number(raw[0]) as PacketTypeValue;
  if (!VALID_TYPES.has(typeNum)) {
    throw new Error(`Invalid packet type: ${raw[0]}`);
  }

  if (typeNum === PacketType.Disconnect || typeNum === PacketType.Noop) {
    return { type: typeNum };
  }

  // Split on colons: "type:id[+]:endpoint[:data]"
  // Use manual parsing to handle data that may contain colons
  const firstColon = raw.indexOf(':', 1);
  if (firstColon === -1) return { type: typeNum };

  const secondColon = raw.indexOf(':', firstColon + 1);
  if (secondColon === -1) return { type: typeNum };

  // id field
  const idField = raw.substring(firstColon + 1, secondColon);
  let id: string | undefined;
  let ack = false;
  if (idField.length > 0) {
    if (idField.endsWith('+')) {
      id = idField.slice(0, -1);
      ack = true;
    } else {
      id = idField;
    }
  }

  // For types without data, everything after second colon is endpoint
  if (!HAS_DATA.has(typeNum)) {
    const endpoint = raw.substring(secondColon + 1);
    const pkt: Packet = { type: typeNum };
    if (id != null) pkt.id = id;
    if (ack) pkt.ack = true;
    pkt.endpoint = endpoint;
    return pkt;
  }

  // For types with data, find third colon
  const thirdColon = raw.indexOf(':', secondColon + 1);
  const endpoint = thirdColon !== -1 ? raw.substring(secondColon + 1, thirdColon) : '';
  const dataStr = thirdColon !== -1 ? raw.substring(thirdColon + 1) : '';

  const pkt: Packet = { type: typeNum };
  if (id != null) pkt.id = id;
  if (ack) pkt.ack = true;
  if (endpoint) pkt.endpoint = endpoint;

  if (dataStr.length > 0) {
    switch (typeNum) {
      case PacketType.Message:
      case PacketType.Error:
        pkt.data = dataStr;
        break;
      case PacketType.Json:
      case PacketType.Event:
        pkt.data = JSON.parse(dataStr);
        break;
      case PacketType.Ack: {
        const plusIdx = dataStr.indexOf('+');
        if (plusIdx !== -1) {
          pkt.id = dataStr.substring(0, plusIdx);
          const jsonPart = dataStr.substring(plusIdx + 1);
          if (jsonPart.length > 0) {
            pkt.data = JSON.parse(jsonPart);
          }
        } else {
          pkt.id = dataStr;
        }
        break;
      }
    }
  }

  return pkt;
}
