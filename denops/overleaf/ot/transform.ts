// OT transformation for Overleaf's position-based insert/delete operations.
// Implements the standard OT transform function where:
//   apply(apply(doc, op1), transform(op2, op1, 'left'))
//   === apply(apply(doc, op2), transform(op1, op2, 'right'))

import type { Op, OpList } from './types.ts';
import { isInsert } from './types.ts';

type Side = 'left' | 'right';

/** Transform a single op component against another. Returns transformed op(s). */
function transformComponent(op: Op, other: Op, side: Side): Op[] {
  if (isInsert(op)) {
    if (isInsert(other)) {
      return transformInsertInsert(op, other, side);
    } else {
      return transformInsertDelete(op, other);
    }
  } else {
    if (isInsert(other)) {
      return transformDeleteInsert(op, other);
    } else {
      return transformDeleteDelete(op, other);
    }
  }
}

function transformInsertInsert(
  op: { i: string; p: number },
  other: { i: string; p: number },
  side: Side,
): Op[] {
  if (op.p < other.p || (op.p === other.p && side === 'left')) {
    // op is before or wins tie: keep position
    return [{ i: op.i, p: op.p }];
  } else {
    // op is after or loses tie: shift by other's insert length
    return [{ i: op.i, p: op.p + charLen(other.i) }];
  }
}

function transformInsertDelete(
  op: { i: string; p: number },
  other: { d: string; p: number },
): Op[] {
  const delEnd = other.p + charLen(other.d);

  if (op.p <= other.p) {
    // Insert is before or at the start of delete: keep position
    return [{ i: op.i, p: op.p }];
  } else if (op.p >= delEnd) {
    // Insert is after delete: shift back by delete length
    return [{ i: op.i, p: op.p - charLen(other.d) }];
  } else {
    // Insert is inside deleted range: move to delete start
    return [{ i: op.i, p: other.p }];
  }
}

function transformDeleteInsert(
  op: { d: string; p: number },
  other: { i: string; p: number },
): Op[] {
  const delEnd = op.p + charLen(op.d);
  const insertLen = charLen(other.i);

  if (delEnd <= other.p) {
    // Delete ends before insert: keep position
    return [{ d: op.d, p: op.p }];
  } else if (op.p >= other.p) {
    // Delete starts at or after insert: shift forward
    return [{ d: op.d, p: op.p + insertLen }];
  } else {
    // Insert is inside delete range: split delete around the insert.
    // The two parts are applied sequentially, so the second part's position
    // accounts for the first part already being removed.
    const chars = Array.from(op.d);
    const splitAt = other.p - op.p;
    const before = chars.slice(0, splitAt).join('');
    const after = chars.slice(splitAt).join('');
    const result: Op[] = [];
    if (before.length > 0) result.push({ d: before, p: op.p });
    // After removing 'before' (splitAt chars), the insert point shifts left by splitAt.
    // The 'after' text sits right after the inserted text: op.p + insertLen
    if (after.length > 0) result.push({ d: after, p: op.p + insertLen });
    return result;
  }
}

function transformDeleteDelete(
  op: { d: string; p: number },
  other: { d: string; p: number },
): Op[] {
  const opEnd = op.p + charLen(op.d);
  const otherEnd = other.p + charLen(other.d);

  // No overlap cases
  if (opEnd <= other.p) {
    // op is entirely before other
    return [{ d: op.d, p: op.p }];
  }
  if (op.p >= otherEnd) {
    // op is entirely after other: shift back
    return [{ d: op.d, p: op.p - charLen(other.d) }];
  }

  // Overlap cases
  const opChars = Array.from(op.d);

  if (op.p >= other.p && opEnd <= otherEnd) {
    // op is contained within other: already deleted
    return [];
  }

  if (op.p <= other.p && opEnd >= otherEnd) {
    // op contains other: remove overlapping portion
    const beforeLen = other.p - op.p;
    const afterStart = otherEnd - op.p;
    const remaining = [
      ...opChars.slice(0, beforeLen),
      ...opChars.slice(afterStart),
    ].join('');
    if (remaining.length === 0) return [];
    return [{ d: remaining, p: op.p }];
  }

  if (op.p < other.p) {
    // op starts before other, overlaps from left
    const keepLen = other.p - op.p;
    const remaining = opChars.slice(0, keepLen).join('');
    if (remaining.length === 0) return [];
    return [{ d: remaining, p: op.p }];
  }

  // op starts inside other, extends past it
  const skipLen = otherEnd - op.p;
  const remaining = opChars.slice(skipLen).join('');
  if (remaining.length === 0) return [];
  return [{ d: remaining, p: other.p }];
}

/** Transform ops1 against ops2. Returns the transformed ops1. */
export function transformOps(ops1: OpList, ops2: OpList, side: Side): OpList {
  let result = [...ops1];

  for (const op2 of ops2) {
    const newResult: Op[] = [];
    for (const op1 of result) {
      newResult.push(...transformComponent(op1, op2, side));
    }
    result = newResult;
  }

  return result;
}

/** Count Unicode characters (not UTF-16 code units). */
function charLen(s: string): number {
  return Array.from(s).length;
}
