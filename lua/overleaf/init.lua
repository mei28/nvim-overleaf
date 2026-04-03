local M = {}

---@class OverleafConfig
---@field autoread boolean Silently reload buffers on remote changes (default: true)

---@type OverleafConfig
local defaults = {
  autoread = true,
}

---@type OverleafConfig
M.config = vim.deepcopy(defaults)

--- Configure the plugin. Call from Lazy opts or manually.
---@param opts OverleafConfig?
function M.setup(opts)
  M.config = vim.tbl_deep_extend('force', defaults, opts or {})
  if M.config.autoread then
    vim.o.autoread = true
  end
end

--- Get the current connection state as a raw string.
---@return "connected" | "authenticating" | "connecting" | "reconnecting" | "disconnected"
function M.get_state()
  local ok, state = pcall(vim.fn['denops#request'], 'overleaf', 'getState', {})
  if not ok then
    return 'disconnected'
  end
  return state
end

--- Get full status information.
---@return { state: string, projectName: string?, projectId: string?, openDocs: integer, syncedFiles: integer, permissions: string?, cwd: string }
function M.get_status()
  local ok, status = pcall(vim.fn['denops#request'], 'overleaf', 'getStatus', {})
  if not ok then
    return { state = 'disconnected' }
  end
  return status
end

return M
