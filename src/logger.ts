/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";

export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;

  static initialize() {
    if (!this.outputChannel) {
      this.outputChannel = vscode.window.createOutputChannel("Jupyter Console");
      this.outputChannel.appendLine("=== Jupyter Console Extension Log ===");
      this.outputChannel.appendLine(
        `Started at: ${new Date().toLocaleString()}`
      );
      this.outputChannel.appendLine("");
    }
  }

  /**
   * Check if debug logging is enabled in workspace configuration
   */
  private static isDebugEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("jupyterConsole");
    return config.get<boolean>("debug", false);
  }

  /**
   * Log info-level message (always logged)
   * Use for important events like extension startup, kernel start/restart
   */
  static info(message: string) {
    if (!this.outputChannel) {
      this.initialize();
    }
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel?.appendLine(`[${timestamp}] INFO: ${message}`);
    console.log(`[JupyterConsole] INFO: ${message}`);
  }

  /**
   * Log debug-level message (only when debug config is enabled)
   * Use for detailed execution flow, state changes, etc.
   */
  static debug(message: string) {
    if (!this.isDebugEnabled()) {
      return;
    }
    if (!this.outputChannel) {
      this.initialize();
    }
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel?.appendLine(`[${timestamp}] DEBUG: ${message}`);
    console.log(`[JupyterConsole] DEBUG: ${message}`);
  }

  static error(message: string, error?: any) {
    if (!this.outputChannel) {
      this.initialize();
    }
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel?.appendLine(`[${timestamp}] ERROR: ${message}`);
    if (error) {
      this.outputChannel?.appendLine(`  ${error}`);
    }
    console.error(`[JupyterConsole] ERROR: ${message}`, error);
  }

  static show() {
    this.outputChannel?.show(true);
  }

  static dispose() {
    this.outputChannel?.dispose();
    this.outputChannel = null;
  }
}
