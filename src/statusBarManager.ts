import * as vscode from "vscode";
import { KernelManager } from "./kernelManager";
import { Logger } from "./logger";

export enum KernelState {
  Stopped = "stopped",
  Starting = "starting",
  Running = "running",
  Busy = "busy",
}

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;
  private kernelManager: KernelManager;
  private currentState: KernelState = KernelState.Stopped;
  private pythonEnvName: string = "Python";
  private disposables: vscode.Disposable[] = [];

  constructor(kernelManager: KernelManager) {
    this.kernelManager = kernelManager;

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );

    // Set command for status bar click
    this.statusBarItem.command = "jupyterConsole.statusBarAction";

    // Initially hide status bar, will show when Python file is opened
    this.updateStatusBar();

    // Register event handlers to show/hide status bar based on active editor
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.updateStatusBar();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this.updateStatusBar();
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges(() => {
        this.updateStatusBar();
      })
    );
  }

  /**
   * Update the status bar based on current state
   */
  private updateStatusBar(): void {
    // Only show status bar when a Python file is open
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "python") {
      this.statusBarItem.hide();
      return;
    }

    let icon: string;
    let color: vscode.ThemeColor | undefined;
    let tooltip: string;

    switch (this.currentState) {
      case KernelState.Stopped:
        icon = "$(circle-slash)";
        color = undefined; // No special background
        tooltip = "Jupyter Kernel: Stopped (Click to start)";
        break;
      case KernelState.Starting:
        icon = "$(loading~spin)";
        color = new vscode.ThemeColor("statusBarItem.warningBackground");
        tooltip = "Jupyter Kernel: Starting...";
        break;
      case KernelState.Running:
        icon = "$(pass)"; // Green checkmark icon
        color = undefined; // No background, icon is green by default
        tooltip = "Jupyter Kernel: Running (Click to interrupt)";
        break;
      case KernelState.Busy:
        icon = "$(sync~spin)";
        color = new vscode.ThemeColor("statusBarItem.warningBackground");
        tooltip = "Jupyter Kernel: Busy (Click to interrupt)";
        break;
    }

    this.statusBarItem.text = `${icon} $(notebook-kernel-select) (${this.pythonEnvName})`;
    this.statusBarItem.backgroundColor = color;
    this.statusBarItem.tooltip = tooltip;

    // Show status bar for Python files
    this.statusBarItem.show();
  }

  /**
   * Set the kernel state
   */
  setState(state: KernelState): void {
    this.currentState = state;
    this.updateStatusBar();
    Logger.log(`Kernel state changed to: ${state}`);
  }

  /**
   * Set the Python environment name
   */
  setPythonEnv(pythonPath: string): void {
    // Extract environment name from path
    const parts = pythonPath.split("/");

    // Look for common virtual environment indicators
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] === "bin" && i > 0) {
        // Get the environment name (parent of bin)
        this.pythonEnvName = parts[i - 1];

        // If it's a local venv (.venv, venv, env), show project name instead
        if (this.pythonEnvName === ".venv" || this.pythonEnvName === "venv" || this.pythonEnvName === "env") {
          // Get workspace folder name (project name)
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder) {
            const projectName = workspaceFolder.name;
            this.pythonEnvName = projectName;
          }
        }
        break;
      }
    }

    // If no env name found, try to get a meaningful name from the path
    if (this.pythonEnvName === "Python") {
      if (pythonPath.includes("venv")) {
        // Check if it's a local venv in the workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder && pythonPath.startsWith(workspaceFolder.uri.fsPath)) {
          // It's a local venv, use project name
          this.pythonEnvName = workspaceFolder.name;
        } else {
          this.pythonEnvName = "venv";
        }
      } else if (pythonPath.includes(".conda")) {
        const condaMatch = pythonPath.match(/envs\/([^\/]+)/);
        if (condaMatch) {
          this.pythonEnvName = condaMatch[1];
        } else {
          this.pythonEnvName = "conda";
        }
      } else if (pythonPath.includes("virtualenv")) {
        this.pythonEnvName = "virtualenv";
      } else {
        // Just show "Python" for system python
        this.pythonEnvName = "Python";
      }
    }

    this.updateStatusBar();
  }

  /**
   * Get current state
   */
  getState(): KernelState {
    return this.currentState;
  }

  /**
   * Dispose of the status bar item and event handlers
   */
  dispose(): void {
    this.statusBarItem.dispose();

    // Dispose all event handlers
    this.disposables.forEach((disposable) => disposable.dispose());
    this.disposables = [];
  }
}
