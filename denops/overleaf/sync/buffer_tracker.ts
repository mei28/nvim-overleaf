// Convert Neovim on_bytes events to OT operations.
// on_bytes reports byte-level changes; Overleaf OT uses character offsets.

import type { OpList } from '../ot/types.ts';
import { byteToChar } from '../ot/unicode.ts';
import { logger } from '../util/logger.ts';

/** Parameters from nvim_buf_attach's on_bytes callback. */
export interface OnBytesParams {
  bufnr: number;
  changedtick: number;
  startRow: number;
  startCol: number;
  byteOffset: number;
  oldEndRow: number;
  oldEndCol: number;
  oldEndByte: number;
  newEndRow: number;
  newEndCol: number;
  newEndByte: number;
}

/** Parse on_bytes args from the Denops notification. */
export function parseOnBytesArgs(args: unknown[]): OnBytesParams {
  return {
    bufnr: args[0] as number,
    changedtick: args[1] as number,
    startRow: args[2] as number,
    startCol: args[3] as number,
    byteOffset: args[4] as number,
    oldEndRow: args[5] as number,
    oldEndCol: args[6] as number,
    oldEndByte: args[7] as number,
    newEndRow: args[8] as number,
    newEndCol: args[9] as number,
    newEndByte: args[10] as number,
  };
}

/**
 * Convert on_bytes event to OT operations.
 *
 * @param params - The on_bytes callback parameters
 * @param contentBeforeChange - The document content BEFORE this change was applied
 * @param insertedText - The text that was inserted (read from buffer after change)
 * @returns OT operations representing this change
 */
export function onBytesToOps(
  params: OnBytesParams,
  contentBeforeChange: string,
  insertedText: string,
): OpList {
  const ops: OpList = [];

  // Convert byte offset to character offset
  const charOffset = byteToChar(contentBeforeChange, params.byteOffset);

  // Handle deletion
  if (params.oldEndByte > 0) {
    const encoder = new TextEncoder();
    const contentBytes = encoder.encode(contentBeforeChange);
    const deletedBytes = contentBytes.slice(
      params.byteOffset,
      params.byteOffset + params.oldEndByte,
    );
    const deletedText = new TextDecoder().decode(deletedBytes);

    if (deletedText.length > 0) {
      ops.push({ d: deletedText, p: charOffset });
    }
  }

  // Handle insertion
  if (params.newEndByte > 0 && insertedText.length > 0) {
    ops.push({ i: insertedText, p: charOffset });
  }

  logger.debug(
    'on_bytes -> ops: byte_offset=%d, old=%d, new=%d, ops=%s',
    params.byteOffset,
    params.oldEndByte,
    params.newEndByte,
    JSON.stringify(ops),
  );

  return ops;
}
