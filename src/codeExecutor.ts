/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import * as path from "path";
import { ConsoleManager } from "./consoleManager";
import { CellDetector } from "./cellDetector";
import { KernelClient } from "./kernelClient";
import { getKernelOperationWait } from "./constants";

enum ExecutionType {
  Line,
  Selection,
  Cell,
  Range,
  All,
}

export class CodeExecutor {
  private consoleManager: ConsoleManager;
  private kernelClient: KernelClient | null = null;

  constructor(consoleManager: ConsoleManager) {
    this.consoleManager = consoleManager;
  }

  /**
   * Set the kernel client for direct code execution
   */
  setKernelClient(client: KernelClient | null): void {
    this.kernelClient = client;
  }

  /**
   * Execute code via Jupyter protocol - outputs appear in Console Viewer
   */
  private async executeCode(code: string): Promise<void> {
    if (!this.kernelClient || !this.kernelClient.isKernelConnected()) {
      // Ask user if they want to start the kernel
      const answer = await vscode.window.showInformationMessage(
        "No kernel is running. Start kernel now?",
        "Yes",
        "No"
      );

      if (answer === "Yes") {
        // Start the kernel
        await vscode.commands.executeCommand("jupyterConsole.startKernel");

        // Wait for kernel to be ready and client to be set
        await new Promise((resolve) =>
          setTimeout(resolve, getKernelOperationWait())
        );

        // Check if kernel client is now available
        if (!this.kernelClient || !this.kernelClient.isKernelConnected()) {
          vscode.window.showErrorMessage("Failed to start kernel");
          return;
        }
      } else {
        // User chose not to start kernel
        return;
      }
    }

    // If terminals are closed, start them automatically
    if (!this.consoleManager.isActive()) {
      await this.consoleManager.startConsole();
    }

    // Always show the Jupyter Output terminal when executing code
    this.consoleManager.showViewer();

    // Check if Output Viewer is enabled
    const config = vscode.workspace.getConfiguration("jupyterConsole");
    const enableOutputViewer = config.get<boolean>("enableOutputViewer", false);

    // In single-terminal mode, add label to distinguish outputs from different files
    let codeToExecute = code;
    if (!enableOutputViewer) {
      const editor = vscode.window.activeTextEditor;
      const filename = editor
        ? path.basename(editor.document.fileName)
        : "editor";
      codeToExecute = `print("\\n\\033[31mOut[${filename}]:\\033[0m")\n${code}`;
    }

    try {
      // Execute via Jupyter protocol
      // In two-terminal mode: Output Viewer shows outputs
      // In single-terminal mode: Label helps distinguish which file output came from
      await this.kernelClient.executeCode(codeToExecute);
    } catch (error) {
      vscode.window.showErrorMessage(`Execution error: ${error}`);
    }
  }

  /**
   * Common helper to execute code and optionally advance cursor
   * @param type Type of execution (Line, Selection, Cell, Range, All)
   * @param lineNumber Line number to execute from (undefined = use cursor position)
   * @param advance Whether to advance cursor after execution
   * @param options For Range type: { fromTop?: boolean, toEnd?: boolean }
   */
  private executeAndAdvance(
    type: ExecutionType,
    lineNumber: number | undefined,
    advance: boolean,
    options: { fromTop?: boolean; toEnd?: boolean } = {}
  ): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let code: string | null | undefined = null;
    let advancer: (editor: vscode.TextEditor) => void = () => {};

    // Use cursor line if lineNumber not provided
    const line = lineNumber ?? editor.selection.active.line;
    const fromTop = options.fromTop ?? false;
    const toEnd = options.toEnd ?? false;

    switch (type) {
      case ExecutionType.Line:
        code = CellDetector.getCurrentLine(editor);
        advancer = (ed) => CellDetector.moveCursorToNextLine(ed);
        break;

      case ExecutionType.Selection:
        code = CellDetector.getSelectedText(editor);
        if (!code?.trim()) {
          // Fallback to line if no selection
          this.executeAndAdvance(ExecutionType.Line, lineNumber, advance);
          return;
        }
        advancer = (ed) => CellDetector.moveCursorToEndOfSelection(ed);
        break;

      case ExecutionType.Cell:
        code = CellDetector.getCodeAtLine(editor.document, line);
        if (!code?.trim()) {
          vscode.window.showWarningMessage("No cell found at cursor position");
          return;
        }
        advancer = (ed) => CellDetector.moveCursorToNextCell(ed);
        break;

      case ExecutionType.Range:
        code = CellDetector.getCodeAtLine(editor.document, line, fromTop, toEnd);
        if (!code?.trim()) {
          const msg = fromTop
            ? "No code to execute above"
            : "No code to execute below";
          vscode.window.showWarningMessage(msg);
          return;
        }
        // No cursor movement for Range type
        break;

      case ExecutionType.All:
        code = CellDetector.getCodeAtLine(editor.document, 0, true, true);
        if (!code?.trim()) {
          vscode.window.showWarningMessage("No code to execute in this file");
          return;
        }
        // No cursor movement for All type
        break;
    }

    if (code?.trim()) {
      this.executeCode(code);
      if (advance) {
        advancer(editor);
      }
    }
  }

  /**
   * Run the selected text (or current line if no selection)
   */
  runSelection(): void {
    this.executeAndAdvance(ExecutionType.Selection, undefined, false);
  }

  /**
   * Run the selected text (or current line if no selection) and advance cursor
   */
  runSelectionAndAdvance(): void {
    this.executeAndAdvance(ExecutionType.Selection, undefined, true);
  }

  /**
   * Run the current cell (code between # %% markers)
   */
  runCell(): void {
    this.executeAndAdvance(ExecutionType.Cell, undefined, false);
  }

  /**
   * Run the current cell and advance to the next cell
   */
  runCellAndAdvance(): void {
    this.executeAndAdvance(ExecutionType.Cell, undefined, true);
  }

  /**
   * CodeLens: Run Cell - run this cell and advance to next cell
   */
  codeLensRunCell(markerLine: number): void {
    CellDetector.moveCursorToLine(markerLine + 1);
    this.executeAndAdvance(ExecutionType.Cell, undefined, true);
  }

  /**
   * CodeLens: Run Cell Above - run cell above and move cursor to this cell
   */
  codeLensRunCellAbove(markerLine: number): void {
    this.executeAndAdvance(ExecutionType.Cell, markerLine > 0 ? markerLine - 1 : 0, false);
    // CellDetector.moveCursorToLine(markerLine + 1);
  }

  /**
   * CodeLens: Run All Below - run all code from marker to end, keep cursor
   */
  codeLensRunAllBelow(markerLine: number): void {
    this.executeAndAdvance(ExecutionType.Range, markerLine + 1, false, { toEnd: true });
  }

  /**
   * CodeLens: Run All Above - run all code from start to marker, keep cursor
   */
  codeLensRunAllAbove(markerLine: number): void {
    this.executeAndAdvance(ExecutionType.Range, markerLine, false, { fromTop: true });
  }

  /**
   * Run all code in the file (excluding cell markers)
   */
  runAll(): void {
    this.executeAndAdvance(ExecutionType.All, undefined, false);
  }
}
