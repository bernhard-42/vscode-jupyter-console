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

    // Get the filename from the active editor
    const editor = vscode.window.activeTextEditor;
    const filename = editor
      ? path.basename(editor.document.fileName)
      : "editor";

    try {
      // Execute via Jupyter protocol
      // ConsoleViewer subscribes to iopub and displays all outputs
      // Prepend the Out[filename] label to the code as a single execution
      const codeWithLabel = `print("\\n\\033[31mOut[${filename}]:\\033[0m")\n${code}`;
      await this.kernelClient.executeCode(codeWithLabel);
    } catch (error) {
      vscode.window.showErrorMessage(`Execution error: ${error}`);
    }
  }

  /**
   * Common helper to execute code and optionally advance cursor
   */
  private executeAndAdvance(type: ExecutionType, advance: boolean): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    let code: string | null | undefined = null;
    let advancer: (editor: vscode.TextEditor) => void;

    switch (type) {
      case ExecutionType.Line:
        code = CellDetector.getCurrentLine(editor);
        advancer = (ed) => CellDetector.moveCursorToNextLine(ed);
        break;

      case ExecutionType.Selection:
        code = CellDetector.getSelectedText(editor);
        if (!code?.trim()) {
          // Fallback to line if no selection
          this.executeAndAdvance(ExecutionType.Line, advance);
          return;
        }
        advancer = (ed) => CellDetector.moveCursorToEndOfSelection(ed);
        break;

      case ExecutionType.Cell:
        const cell = CellDetector.getCurrentCell(editor);
        code = cell?.code;
        if (!cell?.code.trim()) {
          vscode.window.showWarningMessage("No cell found at cursor position");
          return;
        }
        advancer = (ed) => CellDetector.moveCursorToNextCell(ed);
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
    this.executeAndAdvance(ExecutionType.Selection, false);
  }

  /**
   * Run the selected text (or current line if no selection) and advance cursor
   */
  runSelectionAndAdvance(): void {
    this.executeAndAdvance(ExecutionType.Selection, true);
  }

  /**
   * Run the current cell (code between # %% markers)
   */
  runCell(): void {
    this.executeAndAdvance(ExecutionType.Cell, false);
  }

  /**
   * Run the current cell and advance to the next cell
   */
  runCellAndAdvance(): void {
    this.executeAndAdvance(ExecutionType.Cell, true);
  }
}
