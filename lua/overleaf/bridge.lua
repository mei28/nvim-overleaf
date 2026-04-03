-- Lua bridge for on_bytes forwarding to Denops.
-- nvim_buf_attach's on_bytes callback is Lua-only (not available over RPC),
-- so this thin shim forwards byte-level changes to the Deno side.

local M = {}

--- Buffers currently receiving remote ops (skip echo-back)
---@type table<integer, boolean>
M._applying_remote = {}

--- Attached buffers
---@type table<integer, boolean>
M._attached = {}

--- Attach on_bytes listener to a buffer and forward events to Denops.
---@param bufnr integer
---@param plugin_name string Denops plugin name (e.g., "overleaf")
function M.attach(bufnr, plugin_name)
  if M._attached[bufnr] then
    return
  end
  M._attached[bufnr] = true

  vim.api.nvim_buf_attach(bufnr, false, {
    on_bytes = function(_, buf, changedtick, start_row, start_col, byte_offset, old_end_row, old_end_col, old_end_byte, new_end_row, new_end_col, new_end_byte)
      if M._applying_remote[buf] then
        return
      end
      vim.fn['denops#notify'](plugin_name, 'on_bytes', {
        buf,
        changedtick,
        start_row,
        start_col,
        byte_offset,
        old_end_row,
        old_end_col,
        old_end_byte,
        new_end_row,
        new_end_col,
        new_end_byte,
      })
    end,
    on_detach = function(_, buf)
      M._attached[buf] = nil
      M._applying_remote[buf] = nil
      vim.fn['denops#notify'](plugin_name, 'on_detach', { buf })
    end,
  })
end

--- Detach from a buffer.
---@param bufnr integer
function M.detach(bufnr)
  M._attached[bufnr] = nil
  M._applying_remote[bufnr] = nil
end

--- Set the applying_remote guard for a buffer.
---@param bufnr integer
---@param value boolean
function M.set_applying_remote(bufnr, value)
  M._applying_remote[bufnr] = value or nil
end

return M
