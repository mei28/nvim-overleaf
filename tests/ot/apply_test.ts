import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { apply } from '../../denops/overleaf/ot/apply.ts';
import type { OpList } from '../../denops/overleaf/ot/types.ts';

Deno.test('apply - empty ops returns same content', () => {
  assertEquals(apply('hello', []), 'hello');
});

Deno.test('apply - single insert at start', () => {
  assertEquals(apply('world', [{ i: 'hello ', p: 0 }]), 'hello world');
});

Deno.test('apply - single insert at end', () => {
  assertEquals(apply('hello', [{ i: ' world', p: 5 }]), 'hello world');
});

Deno.test('apply - single insert in middle', () => {
  assertEquals(apply('hllo', [{ i: 'e', p: 1 }]), 'hello');
});

Deno.test('apply - single delete at start', () => {
  assertEquals(apply('hello world', [{ d: 'hello ', p: 0 }]), 'world');
});

Deno.test('apply - single delete at end', () => {
  assertEquals(apply('hello world', [{ d: 'world', p: 6 }]), 'hello ');
});

Deno.test('apply - single delete in middle', () => {
  assertEquals(apply('hello world', [{ d: 'lo wo', p: 3 }]), 'helrld');
});

Deno.test('apply - multiple ops (insert then delete)', () => {
  // Ops are applied in order; positions must account for prior ops
  const ops: OpList = [
    { i: 'X', p: 0 }, // "Xhello" (cursor shifts)
    { d: 'h', p: 1 }, // "Xello"
  ];
  assertEquals(apply('hello', ops), 'Xello');
});

Deno.test('apply - delete verifies text content', () => {
  assertThrows(
    () => apply('hello', [{ d: 'xyz', p: 0 }]),
    Error,
    'mismatch',
  );
});

Deno.test('apply - insert into empty string', () => {
  assertEquals(apply('', [{ i: 'hello', p: 0 }]), 'hello');
});

Deno.test('apply - delete entire string', () => {
  assertEquals(apply('hello', [{ d: 'hello', p: 0 }]), '');
});

// Unicode tests
Deno.test('apply - insert with CJK characters', () => {
  assertEquals(apply('東京', [{ i: 'は', p: 1 }]), '東は京');
});

Deno.test('apply - delete CJK character', () => {
  assertEquals(apply('東京都', [{ d: '京', p: 1 }]), '東都');
});

Deno.test('apply - insert with emoji', () => {
  // '😀' is a single Unicode character but 2 UTF-16 code units
  assertEquals(apply('ab', [{ i: '😀', p: 1 }]), 'a😀b');
});

Deno.test('apply - position beyond string length throws', () => {
  assertThrows(
    () => apply('hi', [{ i: 'x', p: 100 }]),
    Error,
  );
});
