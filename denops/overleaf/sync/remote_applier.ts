// Apply remote OT operations to a Neovim buffer.
// Sets the applying_remote guard to prevent echo-back via on_bytes.

import type { Denops } from '@denops/std';
import type { OpList } from '../ot/types.ts';
import { isInsert } from '../ot/types.ts';
import { charToByte } from '../ot/unicode.ts';
import { logger } from '../util/logger.ts';

/**
 * Apply remote OT ops to a Neovim buffer.
 *
 * @param denops - Denops instance
 * @param bufnr - Buffer number
 * @param ops - OT operations to apply (already transformed for local state)
 * @param currentContent - Current content of the buffer (for position calculation)
 */
export async function applyRemoteOps(
  denops: Denops,
  bufnr: number,
  ops: OpList,
  currentContent: string,
): Promise<void> {
  if (ops.length === 0) return;

  // Set guard: prevent on_bytes from echoing these changes back
  await denops.cmd(
    `lua require('overleaf.bridge').set_applying_remote(${bufnr}, true)`,
  );

  try {
    let content = currentContent;

    for (const op of ops) {
      const byteOffset = charToByte(content, op.p);
      const { row, col } = byteOffsetToRowCol(content, byteOffset);

      if (isInsert(op)) {
        const lines = op.i.split('\n');
        const endRow = row + lines.length - 1;
        const endCol = lines.length === 1 ? col + new TextEncoder().encode(op.i).length : new TextEncoder().encode(lines[lines.length - 1]).length;

        await denops.call('nvim_buf_set_text', bufnr, row, col, row, col, lines);
        logger.debug('Applied insert at (%d,%d)->(%d,%d): %s', row, col, endRow, endCol, op.i.substring(0, 50));

        // Update content tracking
        const chars = Array.from(content);
        const insertChars = Array.from(op.i);
        content = [...chars.slice(0, op.p), ...insertChars, ...chars.slice(op.p)].join('');
      } else {
        // Delete
        const deleteBytes = new TextEncoder().encode(op.d);
        const endByteOffset = byteOffset + deleteBytes.length;
        const { row: endRow, col: endCol } = byteOffsetToRowCol(content, endByteOffset);

        await denops.call('nvim_buf_set_text', bufnr, row, col, endRow, endCol, ['']);
        logger.debug('Applied delete at (%d,%d)->(%d,%d): %s', row, col, endRow, endCol, op.d.substring(0, 50));

        // Update content tracking
        const chars = Array.from(content);
        const deleteChars = Array.from(op.d);
        content = [...chars.slice(0, op.p), ...chars.slice(op.p + deleteChars.length)].join('');
      }
    }
  } finally {
    // Always clear the guard
    await denops.cmd(
      `lua require('overleaf.bridge').set_applying_remote(${bufnr}, false)`,
    );
  }
}

/** Convert a byte offset in content to (row, col) for nvim_buf_set_text. */
function byteOffsetToRowCol(content: string, byteOffset: number): { row: number; col: number } {
  const bytes = new TextEncoder().encode(content);
  const prefix = new TextDecoder().decode(bytes.slice(0, byteOffset));
  const lines = prefix.split('\n');
  const row = lines.length - 1;
  const lastLine = lines[lines.length - 1];
  const col = new TextEncoder().encode(lastLine).length;
  return { row, col };
}
