import * as vscode from "vscode";
import { ConsoleManager } from "./consoleManager";
import { CellDetector } from "./cellDetector";
import { KernelClient } from "./kernelClient";

export class CodeExecutor {
  private consoleManager: ConsoleManager;
  private kernelClient: KernelClient | null = null;

  constructor(consoleManager: ConsoleManager) {
    this.consoleManager = consoleManager;
  }

  /**
   * Get the console manager
   */
  getConsoleManager(): ConsoleManager {
    return this.consoleManager;
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

        // Wait a bit for kernel to be ready and client to be set
        await new Promise(resolve => setTimeout(resolve, 1000));

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

    try {
      // Execute via Jupyter protocol
      // ConsoleViewer subscribes to iopub and displays all outputs
      await this.kernelClient.executeCode(code);
    } catch (error) {
      vscode.window.showErrorMessage(`Execution error: ${error}`);
    }
  }

  /**
   * Run the current line and keep cursor at position
   */
  runLine(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const line = CellDetector.getCurrentLine(editor);
    if (line.trim()) {
      this.executeCode(line);
    }
  }

  /**
   * Run the current line and advance to next line
   */
  runLineAndAdvance(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const line = CellDetector.getCurrentLine(editor);
    if (line.trim()) {
      this.executeCode(line);
    }

    CellDetector.moveCursorToNextLine(editor);
  }

  /**
   * Run the selected text and keep cursor at position
   */
  runSelection(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const selectedText = CellDetector.getSelectedText(editor);

    if (selectedText && selectedText.trim()) {
      this.executeCode(selectedText);
    } else {
      // If no selection, run current line
      this.runLine();
    }
  }

  /**
   * Run the selected text and advance cursor
   */
  runSelectionAndAdvance(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const selectedText = CellDetector.getSelectedText(editor);

    if (selectedText && selectedText.trim()) {
      this.executeCode(selectedText);
      CellDetector.moveCursorToEndOfSelection(editor);
    } else {
      // If no selection, run current line and advance
      this.runLineAndAdvance();
    }
  }

  /**
   * Run the current cell (code between # %% markers)
   */
  runCell(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const cell = CellDetector.getCurrentCell(editor);

    if (cell && cell.code.trim()) {
      this.executeCode(cell.code);
    } else {
      vscode.window.showWarningMessage("No cell found at cursor position");
    }
  }

  /**
   * Run the current cell and advance to the next cell
   */
  runCellAndAdvance(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const cell = CellDetector.getCurrentCell(editor);

    if (cell && cell.code.trim()) {
      this.executeCode(cell.code);
      CellDetector.moveCursorToNextCell(editor);
    } else {
      vscode.window.showWarningMessage("No cell found at cursor position");
    }
  }
}
