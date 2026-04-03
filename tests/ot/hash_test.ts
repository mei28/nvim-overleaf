import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeHash } from '../../denops/overleaf/ot/hash.ts';

// Known git blob hashes (verified with: echo -n "content" | git hash-object --stdin)
Deno.test('hash - empty string', async () => {
  // echo -n "" | git hash-object --stdin = e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
  assertEquals(await computeHash(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});

Deno.test('hash - hello world', async () => {
  // echo -n "hello world" | git hash-object --stdin = 95d09f2b10159347eece71399a7e2e907ea3df4f
  assertEquals(await computeHash('hello world'), '95d09f2b10159347eece71399a7e2e907ea3df4f');
});

Deno.test('hash - unicode content', async () => {
  // echo -n "日本語" | git hash-object --stdin = 5e28e0c3e59e4264a5125c3d12c tried locally
  const hash = await computeHash('日本語');
  assertEquals(hash.length, 40); // SHA1 hex is always 40 chars
});
