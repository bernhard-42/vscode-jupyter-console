/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";

/**
 * CodeLens provider that adds "Run Cell | Interrupt" buttons above cell markers
 */
export class CellCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  /**
   * Notify that CodeLens should be refreshed
   */
  public refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  /**
   * Provide CodeLens for all cell markers in the document
   */
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    // Only for Python files
    if (document.languageId !== "python") {
      return codeLenses;
    }

    // Find all cell markers ("# %%")
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const trimmed = line.text.trim();

      if (trimmed.startsWith("# %%")) {
        // Create a range for the cell marker line
        const range = new vscode.Range(i, 0, i, 0);

        // Add "Run Cell" - run this cell and advance to next cell
        const runCellLens = new vscode.CodeLens(range, {
          title: "▶ Cell",
          command: "jupyterConsole.codeLensRunCell",
          tooltip: "Run this cell and advance to next cell",
          arguments: [i], // The marker line
        });
        codeLenses.push(runCellLens);

        // Add "Run Cell Above" - run cell above and move cursor to first line after this marker
        const runCellAboveLens = new vscode.CodeLens(range, {
          title: "▶ Cell Above",
          command: "jupyterConsole.codeLensRunCellAbove",
          tooltip: "Run cell above and move cursor to this cell",
          arguments: [i], // The marker line
        });
        codeLenses.push(runCellAboveLens);

        // Add "Run All Below" - run all cells from this marker to end, keep cursor
        const runAllBelowLens = new vscode.CodeLens(range, {
          title: "▶ All Below",
          command: "jupyterConsole.codeLensRunAllBelow",
          tooltip: "Run all code from this marker to end of file",
          arguments: [i], // The marker line
        });
        codeLenses.push(runAllBelowLens);

        // Add "Run All Above" - run all code from start to this marker, keep cursor
        const runAllAboveLens = new vscode.CodeLens(range, {
          title: "▶ All Above",
          command: "jupyterConsole.codeLensRunAllAbove",
          tooltip: "Run all code from start to this marker",
          arguments: [i], // The marker line
        });
        codeLenses.push(runAllAboveLens);

        // Add "Interrupt" CodeLens
        const interruptLens = new vscode.CodeLens(range, {
          title: "⏹ Interrupt",
          command: "jupyterConsole.interruptKernel",
          tooltip: "Interrupt kernel execution",
        });
        codeLenses.push(interruptLens);
      }
    }

    return codeLenses;
  }
}
