import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { Document, DocumentState } from '../../denops/overleaf/document/document.ts';

function makeDoc(content = 'hello', version = 1): Document {
  return new Document('doc1', content, version);
}

Deno.test('Document - initial state is IDLE', () => {
  const doc = makeDoc();
  assertEquals(doc.state, DocumentState.Idle);
  assertEquals(doc.version, 1);
  assertEquals(doc.serverContent, 'hello');
  assertEquals(doc.localContent, 'hello');
});

Deno.test('Document - submitOp transitions to PENDING', () => {
  const doc = makeDoc();
  doc.submitOp([{ i: ' world', p: 5 }]);
  assertEquals(doc.state, DocumentState.Pending);
  assertEquals(doc.localContent, 'hello world');
  assertEquals(doc.serverContent, 'hello'); // unchanged until ACK
});

Deno.test('Document - flush transitions PENDING -> INFLIGHT', () => {
  const doc = makeDoc();
  const sent: unknown[] = [];
  doc.onSend = (ops, version) => sent.push({ ops, version });

  doc.submitOp([{ i: ' world', p: 5 }]);
  doc.flush();

  assertEquals(doc.state, DocumentState.Inflight);
  assertEquals(sent.length, 1);
});

Deno.test('Document - ACK transitions INFLIGHT -> IDLE', () => {
  const doc = makeDoc();
  doc.onSend = () => {};
  doc.submitOp([{ i: ' world', p: 5 }]);
  doc.flush();
  doc.onAck();

  assertEquals(doc.state, DocumentState.Idle);
  assertEquals(doc.version, 2);
  assertEquals(doc.serverContent, 'hello world');
  assertEquals(doc.localContent, 'hello world');
});

Deno.test('Document - ACK with pending ops flushes immediately', () => {
  const doc = makeDoc();
  const sent: unknown[] = [];
  doc.onSend = (ops, version) => sent.push({ ops, version });

  doc.submitOp([{ i: 'X', p: 0 }]);
  doc.flush(); // INFLIGHT: [{i:'X', p:0}]
  doc.submitOp([{ i: 'Y', p: 2 }]); // INFLIGHT+PENDING

  assertEquals(doc.state, DocumentState.InflightPending);
  doc.onAck(); // ACK the first, auto-flush pending

  assertEquals(doc.state, DocumentState.Inflight);
  assertEquals(sent.length, 2); // two flushes
  assertEquals(doc.version, 2);
});

Deno.test('Document - remote op in IDLE state', () => {
  const doc = makeDoc('ab', 1);
  const appliedOps: unknown[] = [];
  doc.onRemoteApply = (ops) => appliedOps.push(ops);

  doc.onRemoteOp({ op: [{ i: 'X', p: 1 }], v: 1 });

  assertEquals(doc.version, 2);
  assertEquals(doc.serverContent, 'aXb');
  assertEquals(doc.localContent, 'aXb');
  assertEquals(appliedOps.length, 1);
});

Deno.test('Document - remote op transforms against inflight', () => {
  const doc = makeDoc('ab', 1);
  doc.onSend = () => {};
  doc.onRemoteApply = () => {};

  // Local insert at position 0
  doc.submitOp([{ i: 'L', p: 0 }]); // local: "Lab"
  doc.flush(); // inflight: [{i:'L', p:0}]

  // Remote insert at position 1
  doc.onRemoteOp({ op: [{ i: 'R', p: 1 }], v: 1 });

  // Remote 'R' should be transformed: since inflight inserts 'L' at 0,
  // the remote insert at 1 becomes insert at 2 (shifted by L)
  assertEquals(doc.version, 2);
  assertEquals(doc.serverContent, 'aRb'); // server doesn't know about L
  assertEquals(doc.localContent, 'LaRb'); // local has both L and transformed R
});

Deno.test('Document - remote op with version mismatch triggers error', () => {
  const doc = makeDoc('ab', 5);
  let errorMsg = '';
  doc.onError = (msg) => {
    errorMsg = msg;
  };

  doc.onRemoteOp({ op: [{ i: 'X', p: 0 }], v: 3 }); // v=3 but doc is at v=5

  assertEquals(errorMsg.includes('version'), true);
});

Deno.test('Document - reset clears all state', () => {
  const doc = makeDoc('old', 5);
  doc.onSend = () => {};
  doc.submitOp([{ i: 'X', p: 0 }]);
  doc.flush();

  doc.reset('new content', 10);

  assertEquals(doc.state, DocumentState.Idle);
  assertEquals(doc.version, 10);
  assertEquals(doc.serverContent, 'new content');
  assertEquals(doc.localContent, 'new content');
});
