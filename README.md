# vscode-phh

VS Code extension for `.phh`/`.phhs` files.

## Build

```sh
npm install
npm run compile      # emits out/extension.js
node test/tokenize-corpus.js   # grammar verification, see below
```

To actually run it in VS Code: open this folder, press F5 (Extension
Development Host), then set `phh.registryPath` to the absolute path of
`../phh-data/registry` and `phh.serverPath` to `../phh-ls/build/phh-ls` if it
isn't on `PATH`.

**Not published to the VS Code Marketplace.** This repo is pushed to
`github.com/MrPoloGit/vscode-phh`, but there's no marketplace listing,
`vsce publish` has not been run, and `package.json` has no `repository`
field yet. The only ways to run this today are the Extension
Development Host above or a manually-built `.vsix`
(`npx @vscode/vsce package`), sideloaded via "Install from VSIX".
