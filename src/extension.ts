// The VS Code extension is deliberately thin: it starts phh-ls and hosts
// the LSP client. No parsing, no validation logic, no PHH-specific
// protocol extensions live here; all of that is phh-ls, shared
// byte-for-byte with Neovim, Vim, and Zed.

import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("phh");
  const serverPath = config.get<string>("serverPath", "phh-ls");
  const registryPath = config.get<string>("registryPath", "");

  if (!registryPath) {
    vscode.window.showErrorMessage(
      'PHH: the "phh.registryPath" setting is not set. phh-ls needs the path ' +
        "to the phh/registry directory to start."
    );
    return;
  }

  const serverOptions: ServerOptions = {
    command: serverPath,
    args: [registryPath],
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "phh" }],
  };

  client = new LanguageClient("phh-ls", "PHH Language Server", serverOptions, clientOptions);

  client.start().catch((err: unknown) => {
    vscode.window.showErrorMessage(
      `PHH: failed to start phh-ls at "${serverPath}": ${String(err)}`
    );
  });

  context.subscriptions.push({
    dispose: () => {
      void client?.stop();
    },
  });
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
