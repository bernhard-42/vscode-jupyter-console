/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import * as path from "path";
import { KernelManager } from "./kernelManager";
import {
  getViewerTerminalStartDelay,
  getConsoleTerminalStartDelay,
  getConsoleIsCompleteTimeout,
} from "./constants";

export class ConsoleManager {
  private viewerTerminal: vscode.Terminal | null = null;
  private consoleTerminal: vscode.Terminal | null = null;
  private kernelManager: KernelManager;
  private extensionPath: string;
  private terminalCloseListener: vscode.Disposable | null = null;
  private configChangeListener: vscode.Disposable | null = null;

  constructor(kernelManager: KernelManager, extensionPath: string) {
    this.kernelManager = kernelManager;
    this.extensionPath = extensionPath;
    this.setupTerminalCloseHandler();
    this.setupConfigChangeHandler();
  }

  /**
   * Setup handler to restart terminals when config changes
   */
  private setupConfigChangeHandler(): void {
    this.configChangeListener = vscode.workspace.onDidChangeConfiguration(
      (e) => {
        // Check if our config changed
        if (
          e.affectsConfiguration("jupyterConsole.truncateInputLinesMax") ||
          e.affectsConfiguration("jupyterConsole.enableOutputViewer")
        ) {
          // If terminals are active and kernel is running, restart them
          if (this.isActive() && this.kernelManager.isRunning()) {
            // Show temporary status message
            vscode.window.setStatusBarMessage(
              "$(notebook-kernel-select) Jupyter Console config changed. Restarting terminals...",
              3000
            );
            // Restart terminals with new config
            this.startConsole().catch((error) => {
              vscode.window.showErrorMessage(
                `Failed to restart terminals: ${error}`
              );
            });
          }
        }
      }
    );
  }

  /**
   * Setup handler to close paired terminal when one is closed
   */
  private setupTerminalCloseHandler(): void {
    this.terminalCloseListener = vscode.window.onDidCloseTerminal(
      async (closedTerminal) => {
        // Check if one of our terminals was closed
        const isViewerClosed =
          this.viewerTerminal && closedTerminal === this.viewerTerminal;
        const isConsoleClosed =
          this.consoleTerminal && closedTerminal === this.consoleTerminal;

        if (isViewerClosed || isConsoleClosed) {
          // Clear reference to closed terminal
          if (isViewerClosed) {
            this.viewerTerminal = null;
          } else if (isConsoleClosed) {
            this.consoleTerminal = null;
          }

          // Automatically close the other terminal
          if (this.viewerTerminal) {
            this.viewerTerminal.dispose();
            this.viewerTerminal = null;
          }
          if (this.consoleTerminal) {
            this.consoleTerminal.dispose();
            this.consoleTerminal = null;
          }

          // Determine message based on configuration
          const config = vscode.workspace.getConfiguration("jupyterConsole");
          const enableOutputViewer = config.get<boolean>(
            "enableOutputViewer",
            false
          );
          const message = enableOutputViewer
            ? "Both terminals closed. Stop the kernel?"
            : "Jupyter Console closed. Stop the kernel?";

          // Ask if user wants to stop the kernel
          const answer = await vscode.window.showInformationMessage(
            message,
            "Yes",
            "No"
          );

          if (answer === "Yes") {
            // Stop the kernel
            if (this.kernelManager.isRunning()) {
              await vscode.commands.executeCommand("jupyterConsole.stopKernel");
            }
          }
          // If "No", kernel keeps running and can be reconnected later
        }
      }
    );
  }

  /**
   * Start terminals: iopub viewer (shown) + jupyter console (background)
   * Can be called to reconnect to an existing kernel
   * Returns a promise that resolves after terminals are fully started
   */
  async startConsole(): Promise<void> {
    try {
      if (!this.kernelManager.isRunning()) {
        throw new Error("No kernel is running. Start a kernel first.");
      }

      const connectionFile = this.kernelManager.getConnectionFile();
      if (!connectionFile) {
        throw new Error("Could not find kernel connection file");
      }

      // Close existing terminals if any (allows reconnecting)
      if (this.viewerTerminal) {
        this.viewerTerminal.dispose();
        this.viewerTerminal = null;
      }
      if (this.consoleTerminal) {
        this.consoleTerminal.dispose();
        this.consoleTerminal = null;
      }

      const pythonPath = this.kernelManager.getPythonPath();

      // Get configuration
      const config = vscode.workspace.getConfiguration("jupyterConsole");
      const enableOutputViewer = config.get<boolean>(
        "enableOutputViewer",
        false
      );
      const truncateLines = config.get<number>("truncateInputLinesMax", 10);

      // Create iopub viewer terminal (shown by default) if enabled
      if (enableOutputViewer) {
        try {
          this.viewerTerminal = vscode.window.createTerminal(
            "Jupyter Output",
            process.platform === "win32" ? process.env.COMSPEC : undefined
          );
        } catch (error) {
          throw new Error(`Failed to create output viewer terminal: ${error}`);
        }

        // Start the iopub viewer
        setTimeout(() => {
          if (this.viewerTerminal) {
            const viewerScript = path.join(
              this.extensionPath,
              "out",
              "iopub_viewer.py"
            );
            const command = `"${pythonPath}" "${viewerScript}" "${connectionFile}" ${truncateLines}`;
            this.viewerTerminal.sendText(command, true);
            this.viewerTerminal.show(true); // preserveFocus = true
          }
        }, getViewerTerminalStartDelay());
      }

      // Create Jupyter console terminal (separate, not shown by default)
      try {
        this.consoleTerminal = vscode.window.createTerminal(
          "Jupyter Console",
          process.platform === "win32" ? process.env.COMSPEC : undefined
        );
      } catch (error) {
        throw new Error(`Failed to create console terminal: ${error}`);
      }

      // Start jupyter console
      setTimeout(() => {
        if (this.consoleTerminal) {
          // Only include other output if Jupyter Output viewer is disabled
          const includeOtherOutput = !enableOutputViewer
            ? " --ZMQTerminalInteractiveShell.include_other_output=True"
            : "";

          // Increase is_complete timeout to prevent console from giving up on multi-line editing
          // when kernel is busy. Default is 1 second, which is too short.
          // With a longer timeout (default 3600s = 1 hour), the console waits for kernel to become idle
          // before checking if code is complete, preserving multi-line prompt functionality.
          // Note: If you press Enter in the console while kernel is busy longer than this timeout,
          // the console will permanently switch to multi-line mode requiring 3 Enters.
          // This timeout is configurable via jupyterConsole.advanced.consoleIsCompleteTimeout
          const timeoutSeconds = getConsoleIsCompleteTimeout();
          const isCompleteTimeout = ` --ZMQTerminalInteractiveShell.kernel_is_complete_timeout=${timeoutSeconds}`;

          const command = `"${pythonPath}" -m jupyter_console${includeOtherOutput}${isCompleteTimeout} --existing "${connectionFile}"`;
          this.consoleTerminal.sendText(command, true);
        }
      }, getConsoleTerminalStartDelay());

      // Wait for terminals to be fully started before resolving
      // Use the longer of the two delays plus buffer for sendText to complete
      const maxDelay = Math.max(
        enableOutputViewer ? getViewerTerminalStartDelay() : 0,
        getConsoleTerminalStartDelay()
      );
      await new Promise((resolve) => setTimeout(resolve, maxDelay + 200));
    } catch (error) {
      // Clean up terminals on error
      if (this.viewerTerminal) {
        this.viewerTerminal.dispose();
        this.viewerTerminal = null;
      }
      if (this.consoleTerminal) {
        this.consoleTerminal.dispose();
        this.consoleTerminal = null;
      }
      throw error;
    }
  }

  /**
   * Show the output viewer terminal (if enabled)
   */
  showViewer(): void {
    const config = vscode.workspace.getConfiguration("jupyterConsole");
    const enableOutputViewer = config.get<boolean>("enableOutputViewer", false);

    if (!enableOutputViewer) {
      // If viewer is disabled, show the console instead
      this.showConsole();
      return;
    }

    if (this.viewerTerminal) {
      this.viewerTerminal.show(true);
    }
  }

  /**
   * Show the Jupyter Console terminal
   */
  showConsole(): void {
    if (this.consoleTerminal) {
      this.consoleTerminal.show(true);
    }
  }

  /**
   * Send text to the Jupyter Console terminal
   */
  sendToConsole(text: string): void {
    if (this.consoleTerminal) {
      this.consoleTerminal.sendText(text, false);
    }
  }

  /**
   * Check if terminals are active
   */
  isActive(): boolean {
    return this.viewerTerminal !== null || this.consoleTerminal !== null;
  }

  /**
   * Check if a terminal is one of the Jupyter Console terminals
   */
  isJupyterTerminal(terminal: vscode.Terminal | undefined): boolean {
    if (!terminal) {
      return false;
    }
    return terminal === this.viewerTerminal || terminal === this.consoleTerminal;
  }

  /**
   * Close both terminals
   */
  closeTerminals(): void {
    if (this.viewerTerminal) {
      this.viewerTerminal.dispose();
      this.viewerTerminal = null;
    }
    if (this.consoleTerminal) {
      this.consoleTerminal.dispose();
      this.consoleTerminal = null;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.closeTerminals();
    if (this.terminalCloseListener) {
      this.terminalCloseListener.dispose();
      this.terminalCloseListener = null;
    }
    if (this.configChangeListener) {
      this.configChangeListener.dispose();
      this.configChangeListener = null;
    }
  }
}
