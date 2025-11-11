/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";

/**
 * Get timeout constants from workspace configuration
 */

function getConfig() {
  return vscode.workspace.getConfiguration("jupyterConsole");
}

/** Delay before starting viewer terminal */
export function getViewerTerminalStartDelay(): number {
  return getConfig().get<number>("advanced.viewerTerminalStartDelay", 1000);
}

/** Delay before starting console terminal (to allow conda/venv activation to complete) */
export function getConsoleTerminalStartDelay(): number {
  return getConfig().get<number>("advanced.consoleTerminalStartDelay", 1000);
}

/** Wait time for kernel operations (restart, initial connection) */
export function getKernelOperationWait(): number {
  return getConfig().get<number>("advanced.kernelOperationWait", 1000);
}

/** Timeout for kernel connection file to appear */
export function getKernelConnectionTimeout(): number {
  return getConfig().get<number>("advanced.kernelConnectionTimeout", 10000);
}

/** Timeout before force-killing an unresponsive kernel after interrupt */
export function getInterruptTimeout(): number {
  return getConfig().get<number>("advanced.interruptTimeout", 3000);
}

/** Timeout (in seconds) for Jupyter Console to wait for kernel's is_complete response */
export function getConsoleIsCompleteTimeout(): number {
  return getConfig().get<number>("advanced.consoleIsCompleteTimeout", 3600);
}
