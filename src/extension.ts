import * as vscode from "vscode";
import { start as startRepl } from "node:repl";
import { Duplex } from "node:stream";
import { Context } from "node:vm";

class ExtensionHostRepl implements vscode.Pseudoterminal {
  private _writeEmitter: vscode.EventEmitter<string> =
    new vscode.EventEmitter<string>();
  private _closeEmitter: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();

  private _stream: Duplex = new Duplex({
    read: (size) => {},
    write: (chunk, encoding, callback) => {
      // Completions include a LF character, but to render properly left
      // aligned in VS Code it needs to be CR LF.
      const data = (chunk as Buffer).toString("ascii");
      const replaced = data.replace(/(?<!\r)\n/g, "\r\n");
      this._writeEmitter.fire(replaced);
      callback();
    },
    final: (callback) => callback(),
  });

  public onDidWrite: vscode.Event<string> = this._writeEmitter.event;
  public onDidClose: vscode.Event<void> = this._closeEmitter.event;

  public open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this._writeEmitter.fire(
      '\x1b[2mUse the predefined "vscode" variable to interact with the VS Code API in this terminal.\x1b[0m\r\n\n'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this._stream as any).isTTY = true;

    if (initialDimensions) this.setDimensions(initialDimensions);

    const repl = startRepl({
      input: this._stream,
      output: this._stream,
    });

    const initialize = (context: Context): void => {
      context.vscode = vscode;
    };
    initialize(repl.context);

    repl.on("close", () => this._closeEmitter.fire());
    repl.on("reset", initialize);
  }

  public handleInput(data: string): void {
    this._stream.push(data);
  }

  public setDimensions(dimensions: vscode.TerminalDimensions): void {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (this._stream as any).rows = dimensions.rows;
    (this._stream as any).columns = dimensions.columns;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    this._stream.emit("resize");
  }

  public close(): void {
    this._closeEmitter.dispose();
    this._writeEmitter.dispose();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.window.registerTerminalProfileProvider(
    "vscode-api-explorer.terminal",
    {
      provideTerminalProfile: (cancel) =>
        new vscode.TerminalProfile({
          iconPath: new vscode.ThemeIcon("code"),
          name: "VS Code API Explorer",
          pty: new ExtensionHostRepl(),
        }),
    }
  );
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
