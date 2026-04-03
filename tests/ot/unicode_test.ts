import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { byteToChar, charToByte } from '../../denops/overleaf/ot/unicode.ts';

Deno.test('byteToChar - ASCII', () => {
  assertEquals(byteToChar('hello', 0), 0);
  assertEquals(byteToChar('hello', 3), 3);
  assertEquals(byteToChar('hello', 5), 5);
});

Deno.test('byteToChar - CJK (3 bytes per char)', () => {
  // '東京都' = 3 chars, 9 bytes
  assertEquals(byteToChar('東京都', 0), 0);
  assertEquals(byteToChar('東京都', 3), 1);
  assertEquals(byteToChar('東京都', 6), 2);
  assertEquals(byteToChar('東京都', 9), 3);
});

Deno.test('byteToChar - emoji (4 bytes)', () => {
  // '😀' = 1 char, 4 bytes
  assertEquals(byteToChar('a😀b', 0), 0); // 'a'
  assertEquals(byteToChar('a😀b', 1), 1); // start of emoji
  assertEquals(byteToChar('a😀b', 5), 2); // 'b' (1 + 4 = 5)
  assertEquals(byteToChar('a😀b', 6), 3); // end
});

Deno.test('byteToChar - mixed ASCII and CJK', () => {
  // 'a東b' = 3 chars, 1 + 3 + 1 = 5 bytes
  assertEquals(byteToChar('a東b', 0), 0);
  assertEquals(byteToChar('a東b', 1), 1);
  assertEquals(byteToChar('a東b', 4), 2);
  assertEquals(byteToChar('a東b', 5), 3);
});

Deno.test('charToByte - ASCII', () => {
  assertEquals(charToByte('hello', 0), 0);
  assertEquals(charToByte('hello', 3), 3);
  assertEquals(charToByte('hello', 5), 5);
});

Deno.test('charToByte - CJK', () => {
  assertEquals(charToByte('東京都', 0), 0);
  assertEquals(charToByte('東京都', 1), 3);
  assertEquals(charToByte('東京都', 2), 6);
  assertEquals(charToByte('東京都', 3), 9);
});

Deno.test('charToByte - emoji', () => {
  assertEquals(charToByte('a😀b', 0), 0);
  assertEquals(charToByte('a😀b', 1), 1);
  assertEquals(charToByte('a😀b', 2), 5);
  assertEquals(charToByte('a😀b', 3), 6);
});

Deno.test('round-trip - byte->char->byte', () => {
  const content = '東a京😀b都';
  for (let byteOff = 0; byteOff <= new TextEncoder().encode(content).length;) {
    const charOff = byteToChar(content, byteOff);
    assertEquals(charToByte(content, charOff), byteOff);
    // Advance to next valid byte offset
    const charLen = charOff < Array.from(content).length
      ? new TextEncoder().encode(Array.from(content)[charOff]).length
      : 1;
    byteOff += charLen;
  }
});
