import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { decodePacket, encodePacket } from '../../denops/overleaf/protocol/socketio_parser.ts';
import { PacketType } from '../../denops/overleaf/protocol/socketio_types.ts';

Deno.test('encodePacket - disconnect', () => {
  assertEquals(encodePacket({ type: PacketType.Disconnect }), '0');
});

Deno.test('encodePacket - connect', () => {
  assertEquals(encodePacket({ type: PacketType.Connect }), '1::');
});

Deno.test('encodePacket - connect with endpoint', () => {
  assertEquals(encodePacket({ type: PacketType.Connect, endpoint: '/chat' }), '1::/chat');
});

Deno.test('encodePacket - heartbeat', () => {
  assertEquals(encodePacket({ type: PacketType.Heartbeat }), '2::');
});

Deno.test('encodePacket - message', () => {
  assertEquals(
    encodePacket({ type: PacketType.Message, data: 'hello' }),
    '3:::hello',
  );
});

Deno.test('encodePacket - json', () => {
  assertEquals(
    encodePacket({ type: PacketType.Json, data: { key: 'value' } }),
    '4:::{"key":"value"}',
  );
});

Deno.test('encodePacket - event', () => {
  assertEquals(
    encodePacket({ type: PacketType.Event, data: { name: 'joinDoc', args: ['abc123'] } }),
    '5:::{"name":"joinDoc","args":["abc123"]}',
  );
});

Deno.test('encodePacket - event with ack id', () => {
  assertEquals(
    encodePacket({
      type: PacketType.Event,
      id: '7',
      ack: true,
      data: { name: 'joinDoc', args: ['abc123'] },
    }),
    '5:7+::{"name":"joinDoc","args":["abc123"]}',
  );
});

Deno.test('encodePacket - ack', () => {
  assertEquals(
    encodePacket({ type: PacketType.Ack, id: '3', data: ['result'] }),
    '6:::3+["result"]',
  );
});

Deno.test('encodePacket - noop', () => {
  assertEquals(encodePacket({ type: PacketType.Noop }), '8');
});

// --- Decode tests ---

Deno.test('decodePacket - disconnect', () => {
  const pkt = decodePacket('0');
  assertEquals(pkt.type, PacketType.Disconnect);
});

Deno.test('decodePacket - connect', () => {
  const pkt = decodePacket('1::');
  assertEquals(pkt.type, PacketType.Connect);
  assertEquals(pkt.endpoint, '');
});

Deno.test('decodePacket - connect with endpoint', () => {
  const pkt = decodePacket('1::/chat');
  assertEquals(pkt.type, PacketType.Connect);
  assertEquals(pkt.endpoint, '/chat');
});

Deno.test('decodePacket - heartbeat', () => {
  const pkt = decodePacket('2::');
  assertEquals(pkt.type, PacketType.Heartbeat);
});

Deno.test('decodePacket - message', () => {
  const pkt = decodePacket('3:::hello world');
  assertEquals(pkt.type, PacketType.Message);
  assertEquals(pkt.data, 'hello world');
});

Deno.test('decodePacket - json', () => {
  const pkt = decodePacket('4:::{"key":"value"}');
  assertEquals(pkt.type, PacketType.Json);
  assertEquals(pkt.data, { key: 'value' });
});

Deno.test('decodePacket - event', () => {
  const pkt = decodePacket('5:::{"name":"otUpdateApplied","args":[{"v":5}]}');
  assertEquals(pkt.type, PacketType.Event);
  assertEquals(pkt.data, { name: 'otUpdateApplied', args: [{ v: 5 }] });
});

Deno.test('decodePacket - event with ack id', () => {
  const pkt = decodePacket('5:7+::{"name":"joinDoc","args":["abc"]}');
  assertEquals(pkt.type, PacketType.Event);
  assertEquals(pkt.id, '7');
  assertEquals(pkt.ack, true);
});

Deno.test('decodePacket - ack with data', () => {
  const pkt = decodePacket('6:::3+["ok",{"status":"done"}]');
  assertEquals(pkt.type, PacketType.Ack);
  assertEquals(pkt.id, '3');
  assertEquals(pkt.data, ['ok', { status: 'done' }]);
});

Deno.test('decodePacket - ack without data', () => {
  const pkt = decodePacket('6:::3');
  assertEquals(pkt.type, PacketType.Ack);
  assertEquals(pkt.id, '3');
  assertEquals(pkt.data, undefined);
});

Deno.test('decodePacket - noop', () => {
  const pkt = decodePacket('8');
  assertEquals(pkt.type, PacketType.Noop);
});

Deno.test('decodePacket - error', () => {
  const pkt = decodePacket('7:::auth+unauthorized');
  assertEquals(pkt.type, PacketType.Error);
  assertEquals(pkt.data, 'auth+unauthorized');
});

Deno.test('decodePacket - invalid type throws', () => {
  assertThrows(() => decodePacket('9:::data'));
});

// --- Round-trip tests ---

Deno.test('round-trip - event packet', () => {
  const original = {
    type: PacketType.Event,
    id: '12',
    ack: true,
    data: { name: 'applyOtUpdate', args: ['doc1', { op: [{ i: 'x', p: 0 }], v: 3 }] },
  };
  const encoded = encodePacket(original);
  const decoded = decodePacket(encoded);
  assertEquals(decoded.type, original.type);
  assertEquals(decoded.id, original.id);
  assertEquals(decoded.ack, original.ack);
  assertEquals(decoded.data, original.data);
});

Deno.test('round-trip - heartbeat', () => {
  const encoded = encodePacket({ type: PacketType.Heartbeat });
  const decoded = decodePacket(encoded);
  assertEquals(decoded.type, PacketType.Heartbeat);
});
