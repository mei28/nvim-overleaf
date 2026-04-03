# overleaf.nvim

[Overleaf](https://www.overleaf.com) とリアルタイム双方向同期する Neovim プラグイン。

LaTeX プロジェクトをローカルのファイルとして編集できます。保存すると Overleaf に反映され、共同編集者の変更はリアルタイムにローカルファイルへ書き出されます。

<!-- TODO: スクリーンショット -->

## 特徴

- 双方向同期: `:w` で Overleaf に反映、リモート編集はローカルファイルに即時反映
- Operational Transformation (OT) によるリアルタイム共同編集
- 通常のファイルとしてディスクに保存 — LSP, git, grep など既存ツールがそのまま使える
- ネットワーク切断時の自動再接続
- ステータスライン表示

## 必要なもの

- Neovim >= 0.10
- [Deno](https://deno.land/) >= 2.0
- [denops.vim](https://github.com/vim-denops/denops.vim)

## インストール

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

Deno が未インストールの場合:

```sh
# macOS
brew install deno

# curl (Linux/macOS)
curl -fsSL https://deno.land/install.sh | sh
```

## セットアップ

### 1. セッション Cookie を取得

1. ブラウザで [overleaf.com](https://www.overleaf.com) にログイン
2. 開発者ツールを開く (F12)
3. **Application** > **Cookies** > `https://www.overleaf.com`
4. `overleaf_session2` の値をコピー (`s%3A` で始まる文字列)

<!-- TODO: DevTools のスクリーンショット -->

> Cookie の有効期限は約5日です。期限切れの場合は再取得してください。

### 2. プロジェクト ID を取得

Overleaf の URL からコピー:

```
https://www.overleaf.com/project/64a1b2c3d4e5f6g7h8i9j0
                                   ^^^^^^^^^^^^^^^^^^^^^^^^
                                   これがプロジェクト ID
```

### 3. プロジェクトを初期化

```sh
mkdir my-thesis && cd my-thesis
nvim
```

```vim
:OverleafInit
```

Cookie とプロジェクト ID を入力すると:
1. Overleaf に接続
2. 全ファイルをカレントディレクトリにダウンロード
3. 接続情報を `.overleaf/config.json` に保存 (Cookie 含む)

```
my-thesis/
├── .overleaf/
│   └── config.json       <- 接続情報
├── main.tex              <- Overleaf から同期
├── chapters/
│   └── intro.tex
└── references.bib
```

## 使い方

### 毎日のワークフロー

```vim
:OverleafSync       " 接続して同期 (.overleaf/ の保存済み Cookie を使用)
```

あとは普通にファイルを編集して `:w` で保存するだけ。変更は自動的に Overleaf に反映されます。共同編集者の変更もリアルタイムにローカルファイルに書き出されます。

### コマンド一覧

| コマンド | 説明 |
|---|---|
| `:OverleafInit` | 初回セットアップ。Cookie とプロジェクト ID を入力。 |
| `:OverleafSync` | 接続して同期。`.overleaf/` の保存済み Cookie を使用。 |
| `:OverleafOpen` | ドキュメントを選択してリアルタイム OT 同期で開く。 |
| `:OverleafStatus` | 接続状態とプロジェクト情報を表示。 |
| `:OverleafDisconnect` | Overleaf との接続を切断。 |
| `:OverleafLogLevel {level}` | ログレベル設定 (`debug` `info` `warn` `error`)。 |

### ステータスライン

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

接続中は `[OL:ok]`、再接続中は `[OL:...]` と表示されます。

## 仕組み

```
 ローカルファイル                    Overleaf サーバー
 +----------+    :w (保存)          +------------------+
 | main.tex | ──────────────────>   |                  |
 |          |    OT 操作            | リアルタイム      |
 | (ディスク) | <──────────────────   | 共同編集         |
 +----------+    リモート変更       +------------------+
      |                                    |
      | ファイル監視                         | Socket.IO v0.9
      | Deno.watchFs                       | WebSocket
      v                                    v
 +---------------------------------------------+
 |              Deno (denops)                   |
 |  OT エンジン | ドキュメント状態 | Socket.IO    |
 +---------------------------------------------+
```

- `:w` → ファイル監視が検知 → サーバー状態との差分を計算 → OT 操作として送信
- リモート編集 → OT 更新を受信 → ローカル状態と変換 → ディスクに書き出し
- セッション中は全ドキュメントが join 状態を維持
- Socket.IO v0.9 クライアントを自前実装 (Overleaf サーバーがこのバージョンを要求)
- 指数バックオフによる自動再接続

## 制限事項

- **www.overleaf.com のみ対応** (セルフホスト版は将来対応予定)
- ブラウザの開発者ツールから **Cookie を手動取得** する必要あり
- PDF プレビューなし ([VimTeX](https://github.com/lervag/vimtex) や外部ビューアを使用)
- LaTeX コンパイルトリガーは未実装

## 関連プロジェクト

- [Overleaf-Workshop](https://github.com/overleaf-workshop/Overleaf-Workshop) -- VS Code 拡張
- [richwomanbtc/overleaf.nvim](https://github.com/richwomanbtc/overleaf.nvim) -- Neovim プラグイン (Lua + Node.js)
- [AirLatex.vim](https://github.com/da-h/AirLatex.vim) -- Vim プラグイン (Python)

## ライセンス

MIT
