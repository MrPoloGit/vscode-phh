# vscode-phh

The first editor integration built: a
VS Code extension for `.phh`/`.phhs` files. Deliberately thin:
no parsing or validation logic lives here. It contributes a TextMate
grammar (VS Code has no built-in tree-sitter highlighting path, unlike
Neovim/Zed, so this is a second, independent artifact from
`../tree-sitter-phh`, kept in sync by testing both against the same
corpus, not by sharing code) and a thin `vscode-languageclient` shell that
starts `../phh-ls` and does nothing else.

## Build

```sh
npm install
npm run compile      # emits out/extension.js
node test/tokenize-corpus.js   # grammar verification, see below
```

To actually run it in VS Code: open this folder, press F5 (Extension
Development Host), then set `phh.registryPath` to the absolute path of
`../phh/registry` and `phh.serverPath` to `../phh-ls/build/phh-ls` if it
isn't on `PATH`.

**Not published to the VS Code Marketplace.** This repo is pushed to
`github.com/MrPoloGit/vscode-phh`, but there's no marketplace listing,
`vsce publish` has not been run, and `package.json` has no `repository`
field yet. The only ways to run this today are the Extension
Development Host above or a manually-built `.vsix`
(`npx @vscode/vsce package`), sideloaded via "Install from VSIX".

## What's implemented

- **Language registration**: `.phh` and `.phhs` → language id `phh`
  (`package.json`, `language-configuration.json`): line comments (`#`),
  bracket matching/auto-closing for `[`/`]` and both quote styles.
- **TextMate grammar** (`syntaxes/phh.tmLanguage.json`): comments, table
  headers, generic `key = value` pairs with full value typing (strings,
  booleans, numbers incl. `inf`/`nan`, local time, arrays), a dedicated
  highlight for the `variant` field's value, and, the one genuinely new
  piece, mirroring `tree-sitter-phh`'s injection, a nested sub-grammar
  for the contents of every string inside the `actions` array (actor,
  verb, cards, amount, in-string commentary), distinct from the generic
  string rule the same way `tree-sitter-phh-actions` is a separate grammar
  from `tree-sitter-phh`.
- **Snippets** (`snippets/phh.code-snippets`): one per variant code,
  **generated from `phh/registry/variants.json`** (not hand-typed) so each
  snippet's field set can never silently drift from the registry; each
  pre-fills exactly that variant's required fields with sensible
  placeholders and real tabstops.
- **Language client** (`src/extension.ts`): starts `phh-ls` over stdio with
  `vscode-languageclient`, full-document sync, surfaces a clear error if
  `phh.registryPath` isn't configured or the server fails to launch.
- **Settings**: `phh.serverPath`, `phh.registryPath`. Packaging a bundled
  binary, so these wouldn't need to be set by hand, is later work, not
  part of this step.

## How this was verified (not just "it compiles")

1. **TypeScript compiles clean** (`npm run compile`), and the extension
   **packages correctly** with the real `vsce` CLI
   (`npx @vscode/vsce package`): 7 files, 6.87 KB, no errors (two cosmetic
   warnings about a missing `repository`/`LICENSE` field, expected at this
   stage and not functional problems).
2. **The TextMate grammar was tokenized against the real corpus** with
   `vscode-textmate` + `vscode-oniguruma`, the same engine VS Code itself
   uses, run as a plain Node library, with **no GUI window** (deliberately
   not using `@vscode/test-electron`'s Extension Development Host for this
   check, since it would launch a real VS Code window as a side effect for
   something a library call can verify just as well). `test/tokenize-corpus.js`
   checks every corpus file tokenizes without an `invalid` scope, plus
   targeted scope assertions (variant code, action actor/verb/card tokens,
   comments). **17/17 checks pass.**
3. **Two real bugs were caught by that test, not by reading the grammar:**
   - The card-token pattern was `\b[2-9TJQKA?][cdhs?]\b`. Concatenated
     cards (`"Ac2d"`, phh-std/required.rst "Card Notation") are one
     continuous run of word characters, so `\b` never falls between the
     first card's suit and the second card's rank: only the *last* 2-char
     chunk of a run ever matched. Fixed by dropping the word-boundary
     anchors entirely, since the tokenizer already advances
     position-by-position, so a plain 2-char match is correct (same
     lesson `tree-sitter-phh-actions`'s own unanchored `card` token
     already encoded, independently).
   - `generic-pair` was written as a plain `match` rule with a nested
     `patterns` field. TextMate's `patterns` field only takes effect on
     `begin`/`end` container rules; on a flat `match` rule it is silently
     ignored, so every non-`variant`/`actions` field's **value was never
     actually being tokenized**, including as a string. This surfaced
     concretely on `event = "2019 WSOP Event #58"` (a real field from
     `phh-std/examples.rst`): the untokenized string fell through to the
     top-level `#comment` pattern, which matched starting at the `#`
     *inside* the string, the same class of bug `tree-sitter-phh`'s
     first-draft string rule had (see `tree-sitter-phh/README.md`),
     caught the same way: by testing against real data containing a
     literal `#`, not by inspection. Fixed by making `generic-pair` a
     `begin`/`end` rule (`begin` = the `key =` match, `end` = end of
     line), so its nested `#value` patterns actually apply.

## Known limitations / explicitly not done here

- **The language client itself was not driven end-to-end against a real
  VS Code window in this step.** `phh-ls`'s LSP behavior (diagnostics,
  hover, completion) was already verified directly against the server
  binary over real JSON-RPC in `../phh-ls/tests/lsp_smoke_test.py`; this
  extension's own job, starting that exact binary and wiring it to VS
  Code's language-client APIs, has not separately been exercised inside
  an Extension Development Host, since doing so via `@vscode/test-electron`
  launches a real GUI window as a side effect, which this session avoided
  triggering without being asked to. Press F5 locally to check this by
  hand.
- **No bundled/downloaded server binary.** `phh.serverPath` must point at
  a locally built `phh-ls`; per-platform bundling or first-use download is
  later work, not this step.
- **No custom FoldingRangeProvider for "fold a whole hand in a `.phhs`
  file."** VS Code's bracket-based folding (from `language-configuration.json`'s
  `brackets`) already folds the `actions` array for free; folding each
  `[N]` table as its own region the way `tree-sitter-phh/queries/folds.scm`
  does for Neovim/Zed would need either a provider in this extension or a
  `textDocument/foldingRange` handler in `phh-ls`, neither built yet.
- **No separate `ohh`/`openppl` extensions.** Out of scope here:
  those are entirely separate packages, built in their own turn.
