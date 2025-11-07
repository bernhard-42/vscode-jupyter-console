/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import { KernelManager } from "./kernelManager";
import { StatusBarManager, KernelState } from "./statusBarManager";
import { Logger } from "./logger";

/**
 * Get the active Python interpreter path
 */
export async function getPythonPath(): Promise<string> {
  try {
    // Try to use the Python extension's API
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");

    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }

      const pythonApi = pythonExtension.exports;

      // Get active environment for current workspace
      if (pythonApi && pythonApi.environments) {
        const activeEnv = pythonApi.environments.getActiveEnvironmentPath();
        if (activeEnv && activeEnv.path) {
          return activeEnv.path;
        }
      }
    }

    // Fallback: try to get from settings
    const config = vscode.workspace.getConfiguration("python");
    const defaultPath = config.get<string>("defaultInterpreterPath");
    if (defaultPath) {
      return defaultPath;
    }

    // Last resort: use 'python' from PATH
    return "python3";
  } catch (error) {
    Logger.error("Error getting Python path:", error);
    return "python3";
  }
}

/**
 * Register Python interpreter change listener
 */
export async function registerPythonInterpreterListener(
  context: vscode.ExtensionContext,
  kernelManager: KernelManager,
  statusBarManager: StatusBarManager,
  cleanupKernelClient: () => Promise<void>
): Promise<void> {
  Logger.log("Setting up Python interpreter change listener...");
  const pythonExtension = vscode.extensions.getExtension("ms-python.python");

  if (!pythonExtension) {
    return;
  }

  if (!pythonExtension.isActive) {
    await pythonExtension.activate();
  }

  const pythonApi = pythonExtension.exports;
  if (!pythonApi?.environments) {
    return;
  }

  // Listen for environment changes
  context.subscriptions.push(
    pythonApi.environments.onDidChangeActiveEnvironmentPath(async (e: any) => {
      Logger.log("Python interpreter changed!");
      Logger.log(`New interpreter path: ${e.path}`);

      // Check if kernel was running before cleanup
      const wasRunning = kernelManager.isRunning();

      // Clean up without confirmation
      await cleanupKernelClient();
      Logger.log("✓ Terminals closed and kernel client disconnected");

      // Stop kernel process
      if (wasRunning) {
        kernelManager.stopKernel();
        Logger.log("✓ Kernel stopped");
      }

      // Update kernel manager with new Python path
      const newPythonPath = e.path;
      kernelManager.setPythonPath(newPythonPath);
      Logger.log(`✓ Kernel manager updated with new path: ${newPythonPath}`);

      // Update status bar
      statusBarManager.setPythonEnv(newPythonPath);
      statusBarManager.setState(KernelState.Stopped);
      Logger.log("✓ Status bar updated");

      // Show temporary status message only if kernel was running
      if (wasRunning) {
        vscode.window.setStatusBarMessage(
          "$(notebook-kernel-select) Python interpreter changed. Kernel stopped.",
          3000
        );
      }
    })
  );

  Logger.log("✓ Python interpreter change listener registered");
}
