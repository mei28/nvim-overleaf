local M = {}

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
