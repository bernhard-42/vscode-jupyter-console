import * as vscode from "vscode";

/**
 * Get timeout constants from workspace configuration
 */

function getConfig() {
  return vscode.workspace.getConfiguration("jupyterConsole");
}

/** Delay before starting viewer terminal */
export function getViewerTerminalStartDelay(): number {
  return getConfig().get<number>("advanced.viewerTerminalStartDelay", 300);
}

/** Delay before starting console terminal */
export function getConsoleTerminalStartDelay(): number {
  return getConfig().get<number>("advanced.consoleTerminalStartDelay", 500);
}

/** Wait time for kernel operations (restart, initial connection) */
export function getKernelOperationWait(): number {
  return getConfig().get<number>("advanced.kernelOperationWait", 1000);
}

/** Timeout for kernel connection file to appear */
export function getKernelConnectionTimeout(): number {
  return getConfig().get<number>("advanced.kernelConnectionTimeout", 10000);
}

/** Timeout for code execution to complete */
export function getCodeExecutionTimeout(): number {
  return getConfig().get<number>("advanced.codeExecutionTimeout", 30000);
}
