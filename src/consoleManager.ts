import * as vscode from "vscode";
import * as path from "path";
import { KernelManager } from "./kernelManager";
import { getViewerTerminalStartDelay, getConsoleTerminalStartDelay } from "./constants";

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
    this.configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
      // Check if our config changed
      if (e.affectsConfiguration("jupyterConsole.truncateInputLinesMax")) {
        // If terminals are active and kernel is running, restart them
        if (this.isActive() && this.kernelManager.isRunning()) {
          // Show temporary status message
          vscode.window.setStatusBarMessage(
            "$(notebook-kernel-select) Jupyter Console config changed. Restarting terminals...",
            3000
          );
          // Restart terminals with new config
          this.startConsole().catch((error) => {
            vscode.window.showErrorMessage(`Failed to restart terminals: ${error}`);
          });
        }
      }
    });
  }

  /**
   * Setup handler to close paired terminal when one is closed
   */
  private setupTerminalCloseHandler(): void {
    this.terminalCloseListener = vscode.window.onDidCloseTerminal(async (closedTerminal) => {
      // Check if one of our terminals was closed
      const isViewerClosed = this.viewerTerminal && closedTerminal === this.viewerTerminal;
      const isConsoleClosed = this.consoleTerminal && closedTerminal === this.consoleTerminal;

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

        // Ask if user wants to stop the kernel
        const answer = await vscode.window.showInformationMessage(
          "Both terminals closed. Stop the kernel?",
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
    });
  }

  /**
   * Start terminals: iopub viewer (shown) + jupyter console (background)
   * Can be called to reconnect to an existing kernel
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

      // Get truncate lines configuration
      const config = vscode.workspace.getConfiguration("jupyterConsole");
      const truncateLines = config.get<number>("truncateInputLinesMax", 10);

      // Create iopub viewer terminal (shown by default)
      try {
        this.viewerTerminal = vscode.window.createTerminal({
          name: "Jupyter Output",
          hideFromUser: false,
        });
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
          this.viewerTerminal.show();
        }
      }, getViewerTerminalStartDelay());

      // Create Jupyter console terminal (separate, not shown by default)
      try {
        this.consoleTerminal = vscode.window.createTerminal({
          name: "Jupyter Console",
          hideFromUser: false,
        });
      } catch (error) {
        throw new Error(`Failed to create console terminal: ${error}`);
      }

      // Start jupyter console
      setTimeout(() => {
        if (this.consoleTerminal) {
          const command = `"${pythonPath}" -m jupyter console --existing "${connectionFile}"`;
          this.consoleTerminal.sendText(command, true);
        }
      }, getConsoleTerminalStartDelay());
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
   * Show the output viewer terminal
   */
  showConsole(): void {
    if (this.viewerTerminal) {
      this.viewerTerminal.show(true);
    }
  }

  /**
   * Check if terminals are active
   */
  isActive(): boolean {
    return this.viewerTerminal !== null || this.consoleTerminal !== null;
  }

  /**
   * Close both terminals
   */
  closeConsole(): void {
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
    this.closeConsole();
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
