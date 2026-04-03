// Apply OT operations to a content string.
// Positions are Unicode character offsets (via Array.from for correct surrogate pair handling).

import type { OpList } from './types.ts';
import { isInsert } from './types.ts';

/** Apply a list of OT operations to content, returning the new content. */
export function apply(content: string, ops: OpList): string {
  let chars = Array.from(content);

  for (const op of ops) {
    if (isInsert(op)) {
      if (op.p < 0 || op.p > chars.length) {
        throw new Error(`Insert position ${op.p} out of bounds (length ${chars.length})`);
      }
      const insertChars = Array.from(op.i);
      chars = [...chars.slice(0, op.p), ...insertChars, ...chars.slice(op.p)];
    } else {
      // Delete
      if (op.p < 0 || op.p + Array.from(op.d).length > chars.length) {
        throw new Error(`Delete position ${op.p} out of bounds (length ${chars.length})`);
      }
      const deleteChars = Array.from(op.d);
      const actual = chars.slice(op.p, op.p + deleteChars.length).join('');
      if (actual !== op.d) {
        throw new Error(
          `Delete content mismatch at ${op.p}: expected "${op.d}", got "${actual}"`,
        );
      }
      chars = [...chars.slice(0, op.p), ...chars.slice(op.p + deleteChars.length)];
    }
  }

  return chars.join('');
}
