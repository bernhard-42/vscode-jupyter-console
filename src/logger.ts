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

  static log(message: string) {
    if (!this.outputChannel) {
      this.initialize();
    }
    const timestamp = new Date().toLocaleTimeString();
    this.outputChannel?.appendLine(`[${timestamp}] ${message}`);
    console.log(`[JupyterConsole] ${message}`);
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
