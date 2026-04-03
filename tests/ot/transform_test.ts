import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { transformOps } from '../../denops/overleaf/ot/transform.ts';
import { apply } from '../../denops/overleaf/ot/apply.ts';
import type { OpList } from '../../denops/overleaf/ot/types.ts';

// The fundamental OT property:
// apply(apply(doc, op1), transform(op2, op1, 'left')) === apply(apply(doc, op2), transform(op1, op2, 'right'))
function assertConvergence(doc: string, op1: OpList, op2: OpList): void {
  const op2prime = transformOps(op2, op1, 'left');
  const op1prime = transformOps(op1, op2, 'right');
  const result1 = apply(apply(doc, op1), op2prime);
  const result2 = apply(apply(doc, op2), op1prime);
  assertEquals(result1, result2, `Convergence failed for doc="${doc}"`);
}

// --- Insert vs Insert ---

Deno.test('transform - insert vs insert at different positions', () => {
  const doc = 'hello';
  const op1: OpList = [{ i: 'X', p: 1 }]; // "hXello"
  const op2: OpList = [{ i: 'Y', p: 4 }]; // "hellYo"
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - insert vs insert at same position (left wins)', () => {
  const doc = 'ab';
  const op1: OpList = [{ i: 'X', p: 1 }];
  const op2: OpList = [{ i: 'Y', p: 1 }];
  assertConvergence(doc, op1, op2);

  // left side keeps position, right side shifts
  const op2prime = transformOps(op2, op1, 'left');
  assertEquals(op2prime[0].p, 1); // left keeps position
  const op1prime = transformOps(op1, op2, 'right');
  assertEquals(op1prime[0].p, 2); // right shifts
});

Deno.test('transform - insert vs insert, op1 before op2', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 2 }];
  const op2: OpList = [{ i: 'Y', p: 5 }];
  assertConvergence(doc, op1, op2);
});

// --- Insert vs Delete ---

Deno.test('transform - insert vs delete at different positions', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 1 }]; // insert at 1
  const op2: OpList = [{ d: 'e', p: 4 }]; // delete at 4
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - insert inside deleted range', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 3 }]; // insert at 3
  const op2: OpList = [{ d: 'bcde', p: 1 }]; // delete range [1,5)
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - insert at delete start', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 2 }];
  const op2: OpList = [{ d: 'cd', p: 2 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - insert after delete', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 5 }];
  const op2: OpList = [{ d: 'bc', p: 1 }];
  assertConvergence(doc, op1, op2);
});

// --- Delete vs Insert ---

Deno.test('transform - delete vs insert before', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ d: 'cd', p: 2 }];
  const op2: OpList = [{ i: 'X', p: 1 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs insert inside', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ d: 'bcde', p: 1 }];
  const op2: OpList = [{ i: 'X', p: 3 }];
  assertConvergence(doc, op1, op2);
});

// --- Delete vs Delete ---

Deno.test('transform - delete vs delete, no overlap', () => {
  const doc = 'abcdefgh';
  const op1: OpList = [{ d: 'bc', p: 1 }];
  const op2: OpList = [{ d: 'fg', p: 5 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs delete, same range', () => {
  const doc = 'abcdef';
  const op1: OpList = [{ d: 'cd', p: 2 }];
  const op2: OpList = [{ d: 'cd', p: 2 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs delete, overlapping from left', () => {
  const doc = 'abcdefgh';
  const op1: OpList = [{ d: 'bcd', p: 1 }]; // delete [1,4)
  const op2: OpList = [{ d: 'cdef', p: 2 }]; // delete [2,6)
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs delete, overlapping from right', () => {
  const doc = 'abcdefgh';
  const op1: OpList = [{ d: 'cdef', p: 2 }]; // delete [2,6)
  const op2: OpList = [{ d: 'bcd', p: 1 }]; // delete [1,4)
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs delete, one contains the other', () => {
  const doc = 'abcdefgh';
  const op1: OpList = [{ d: 'bcdefg', p: 1 }]; // delete [1,7)
  const op2: OpList = [{ d: 'cd', p: 2 }]; // delete [2,4)
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - delete vs delete, contained in other', () => {
  const doc = 'abcdefgh';
  const op1: OpList = [{ d: 'cd', p: 2 }]; // delete [2,4)
  const op2: OpList = [{ d: 'bcdefg', p: 1 }]; // delete [1,7)
  assertConvergence(doc, op1, op2);
});

// --- Multiple single-op rounds (the common Overleaf pattern) ---

Deno.test('transform - sequential single-op convergence', () => {
  // Simulate two clients typing in the same document.
  // Each client sends one op at a time (standard Overleaf behavior).
  const doc = 'abcdef';
  const op1: OpList = [{ i: 'X', p: 1 }];
  const op2: OpList = [{ d: 'c', p: 2 }];
  assertConvergence(doc, op1, op2);

  // Apply both and verify the result makes sense
  const op2p = transformOps(op2, op1, 'left');
  const result = apply(apply(doc, op1), op2p);
  assertEquals(result, 'aXbdef');
});

Deno.test('transform - insert at same position, different sides', () => {
  const doc = 'abc';
  const op1: OpList = [{ i: 'X', p: 2 }];
  const op2: OpList = [{ i: 'Y', p: 2 }];
  assertConvergence(doc, op1, op2);
});

// --- Empty ops ---

Deno.test('transform - empty op1', () => {
  const doc = 'hello';
  const op1: OpList = [];
  const op2: OpList = [{ i: 'X', p: 2 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - empty op2', () => {
  const doc = 'hello';
  const op1: OpList = [{ i: 'X', p: 2 }];
  const op2: OpList = [];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - both empty', () => {
  const op1prime = transformOps([], [], 'left');
  assertEquals(op1prime, []);
});

// --- Unicode ---

Deno.test('transform - CJK insert vs insert convergence', () => {
  const doc = '東京都';
  const op1: OpList = [{ i: '大', p: 1 }];
  const op2: OpList = [{ i: '市', p: 3 }];
  assertConvergence(doc, op1, op2);
});

Deno.test('transform - emoji in ops', () => {
  const doc = 'a😀b';
  const op1: OpList = [{ i: 'X', p: 1 }]; // before emoji
  const op2: OpList = [{ i: 'Y', p: 2 }]; // after emoji
  assertConvergence(doc, op1, op2);
});
