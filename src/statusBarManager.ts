/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import { KernelManager } from "./kernelManager";
import { Logger } from "./logger";
import { getPythonEnvName } from "./pythonIntegration";

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
      vscode.window.onDidChangeActiveTextEditor((_editor) => {
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
   * Update the Python environment name from the active Python interpreter
   */
  async updatePythonEnv(): Promise<void> {
    this.pythonEnvName = await getPythonEnvName();
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
