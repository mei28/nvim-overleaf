# overleaf.nvim

[Japanese / 日本語](README.ja.md)

Neovim plugin for real-time bidirectional sync with [Overleaf](https://www.overleaf.com).

Edit your LaTeX projects locally in Neovim. Changes sync to Overleaf on save, and collaborators' edits appear on your disk in real-time.

<!-- TODO: screenshot -->

## Features

- Bidirectional sync: local `:w` pushes to Overleaf, remote edits write to your files
- Real-time collaboration via Operational Transformation (OT)
- Local files on disk — use any tool (LSP, git, grep, etc.)
- Automatic reconnection on network failure
- Statusline integration

## Requirements

- Neovim >= 0.10
- [Deno](https://deno.land/) >= 2.0
- [denops.vim](https://github.com/vim-denops/denops.vim)

## Installation

### lazy.nvim

```lua
{
  'your-username/overleaf.nvim',
  dependencies = {
    'vim-denops/denops.vim',
  },
  cmd = { 'OverleafInit', 'OverleafSync', 'OverleafStatus' },
}
```

If you don't have Deno:

```sh
# macOS
brew install deno

# or curl (Linux/macOS)
curl -fsSL https://deno.land/install.sh | sh
```

## Setup

### 1. Get your session cookie

1. Open [overleaf.com](https://www.overleaf.com) in your browser and log in
2. Open Developer Tools (F12)
3. Go to **Application** > **Cookies** > `https://www.overleaf.com`
4. Find `overleaf_session2` and copy the value (starts with `s%3A`)

<!-- TODO: screenshot of DevTools cookie -->

> The cookie expires after about 5 days. Recopy it when it expires.

### 2. Get your project ID

Copy it from your Overleaf URL:

```
https://www.overleaf.com/project/64a1b2c3d4e5f6g7h8i9j0
                                   ^^^^^^^^^^^^^^^^^^^^^^^^
```

### 3. Initialize the project

```sh
mkdir my-thesis && cd my-thesis
nvim
```

```vim
:OverleafInit
```

You'll be prompted for the cookie and project ID. The plugin will:
1. Connect to Overleaf
2. Download all files to the current directory
3. Save connection info to `.overleaf/config.json` (including cookie)

```
my-thesis/
├── .overleaf/
│   └── config.json
├── main.tex
├── chapters/
│   └── intro.tex
└── references.bib
```

## Usage

### Daily workflow

```vim
:OverleafSync       " connect and sync (reads saved cookie from .overleaf/)
```

Then just edit files and `:w`. Changes push to Overleaf automatically. Collaborators' edits appear in your local files in real-time.

### Commands

| Command | Description |
|---|---|
| `:OverleafInit` | First-time setup. Prompts for cookie and project ID. |
| `:OverleafSync` | Connect and sync. Uses saved cookie from `.overleaf/`. |
| `:OverleafOpen` | Pick a document to open in a buffer with real-time OT sync. |
| `:OverleafStatus` | Show connection state and project info. |
| `:OverleafDisconnect` | Disconnect from Overleaf. |
| `:OverleafLogLevel {level}` | Set log verbosity (`debug` `info` `warn` `error`). |

### Statusline

```lua
-- lualine.nvim
require('lualine').setup {
  sections = {
    lualine_x = {
      { function() return vim.fn['overleaf#statusline']() end },
    },
  },
}
```

Shows `[OL:ok]` when connected, `[OL:...]` during reconnection.

## How it works

```
 Local files                        Overleaf
 +----------+    :w (save)          +----------------+
 | main.tex | ──────────────────>   |                |
 |          |    OT operations      | real-time      |
 | (disk)   | <──────────────────   | collaboration  |
 +----------+    remote changes     +----------------+
      |                                    |
      | file watcher                       | Socket.IO v0.9
      | Deno.watchFs                       | WebSocket
      v                                    v
 +---------------------------------------------+
 |              Deno (denops)                   |
 |  OT engine | Document state | Socket.IO     |
 +---------------------------------------------+
```

- `:w` triggers file watcher -> diff against server state -> OT ops -> send to Overleaf
- Remote edits arrive as OT updates -> transform against local state -> write to disk
- All documents stay joined for the duration of the session
- Custom Socket.IO v0.9 client (Overleaf's server requires this protocol version)
- Automatic reconnection with exponential backoff

## Architecture

```
denops/overleaf/
├── main.ts              -- Denops entry point
├── app.ts               -- Orchestrator
├── auth/                -- Cookie auth, CSRF extraction
├── document/            -- OT state machine (inflight/pending/version)
├── ot/                  -- OT engine (apply, transform, unicode)
├── protocol/            -- Socket.IO v0.9 client, Overleaf events
├── project/             -- File tree, entity ID mapping, .overleaf/ config
├── sync/                -- File watcher, remote applier, echo guard
└── util/                -- EventEmitter, logger, debounce
```

## Development

```sh
just ci          # fmt + lint + check + test
deno task test   # run tests only
deno task check  # type check only
```

## Limitations

- **www.overleaf.com only** (self-hosted Overleaf support planned)
- Requires **manual cookie** from browser DevTools
- No PDF preview (use [VimTeX](https://github.com/lervag/vimtex) or an external viewer)
- No LaTeX compilation trigger yet

## Related projects

- [Overleaf-Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) -- VS Code extension
- [richwomanbtc/overleaf.nvim](https://github.com/richwomanbtc/overleaf.nvim) -- Neovim plugin (Lua + Node.js)
- [AirLatex.vim](https://github.com/da-h/AirLatex.vim) -- Vim plugin (Python)

## License

MIT
