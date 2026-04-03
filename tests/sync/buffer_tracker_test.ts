import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type OnBytesParams, onBytesToOps } from '../../denops/overleaf/sync/buffer_tracker.ts';

function makeParams(overrides: Partial<OnBytesParams>): OnBytesParams {
  return {
    bufnr: 1,
    changedtick: 1,
    startRow: 0,
    startCol: 0,
    byteOffset: 0,
    oldEndRow: 0,
    oldEndCol: 0,
    oldEndByte: 0,
    newEndRow: 0,
    newEndCol: 0,
    newEndByte: 0,
    ...overrides,
  };
}

Deno.test('onBytesToOps - simple insert at start', () => {
  const ops = onBytesToOps(
    makeParams({ byteOffset: 0, newEndByte: 1, newEndCol: 1 }),
    'hello',
    'X',
  );
  assertEquals(ops, [{ i: 'X', p: 0 }]);
});

Deno.test('onBytesToOps - insert in middle', () => {
  const ops = onBytesToOps(
    makeParams({ byteOffset: 3, newEndByte: 2, newEndCol: 2 }),
    'hello',
    'XY',
  );
  assertEquals(ops, [{ i: 'XY', p: 3 }]);
});

Deno.test('onBytesToOps - simple delete', () => {
  const ops = onBytesToOps(
    makeParams({ byteOffset: 1, oldEndByte: 3, oldEndCol: 3 }),
    'hello',
    '',
  );
  assertEquals(ops, [{ d: 'ell', p: 1 }]);
});

Deno.test('onBytesToOps - replace (delete + insert)', () => {
  const ops = onBytesToOps(
    makeParams({ byteOffset: 1, oldEndByte: 3, oldEndCol: 3, newEndByte: 1, newEndCol: 1 }),
    'hello',
    'X',
  );
  assertEquals(ops, [{ d: 'ell', p: 1 }, { i: 'X', p: 1 }]);
});

Deno.test('onBytesToOps - no change', () => {
  const ops = onBytesToOps(
    makeParams({}),
    'hello',
    '',
  );
  assertEquals(ops, []);
});

Deno.test('onBytesToOps - CJK insert', () => {
  // '東京' is 6 bytes. Insert '大' (3 bytes) at byte offset 3 (after '東')
  const ops = onBytesToOps(
    makeParams({ byteOffset: 3, newEndByte: 3, newEndCol: 3 }),
    '東京',
    '大',
  );
  assertEquals(ops, [{ i: '大', p: 1 }]); // char offset 1
});

Deno.test('onBytesToOps - CJK delete', () => {
  // Delete '京' (3 bytes) at byte offset 3
  const ops = onBytesToOps(
    makeParams({ byteOffset: 3, oldEndByte: 3, oldEndCol: 3 }),
    '東京都',
    '',
  );
  assertEquals(ops, [{ d: '京', p: 1 }]);
});
