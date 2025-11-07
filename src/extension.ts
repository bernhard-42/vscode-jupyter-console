/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import { KernelManager } from "./kernelManager";
import { ConsoleManager } from "./consoleManager";
import { CodeExecutor } from "./codeExecutor";
import { StatusBarManager, KernelState } from "./statusBarManager";
import { KernelClient } from "./kernelClient";
import { Logger } from "./logger";
import { registerCommands } from "./commands";
import {
  getPythonPath,
  registerPythonInterpreterListener,
} from "./pythonIntegration";

let kernelManager: KernelManager;
let consoleManager: ConsoleManager;
let codeExecutor: CodeExecutor;
let statusBarManager: StatusBarManager;
let kernelClient: KernelClient | null = null;

/**
 * Connect kernel client and set up terminals
 */
async function connectKernelClient(): Promise<void> {
  const connectionFile = kernelManager.getConnectionFile();
  if (!connectionFile) {
    throw new Error("Connection file not available");
  }

  kernelClient = new KernelClient();
  await kernelClient.connect(connectionFile);
  codeExecutor.setKernelClient(kernelClient);

  // Set up status callback to update status bar during execution
  kernelClient.setStatusCallback((state) => {
    if (state === "busy") {
      statusBarManager.setState(KernelState.Busy);
    } else if (state === "idle") {
      statusBarManager.setState(KernelState.Running);
    }
  });

  Logger.log("Kernel client connected");

  // Automatically start terminals (iopub viewer + jupyter console)
  await consoleManager.startConsole();
}

/**
 * Cleanup: disconnect kernel client and close terminals
 */
async function cleanupKernelClient(): Promise<void> {
  // Close terminals
  consoleManager.closeTerminals();

  // Disconnect kernel client
  if (kernelClient) {
    await kernelClient.disconnect();
    kernelClient = null;
    codeExecutor.setKernelClient(null);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Initialize logger first
  try {
    Logger.initialize();
    Logger.log("=== ACTIVATION START ===");
    Logger.log("Starting activation...");
  } catch (e) {
    console.error("Failed to initialize logger:", e);
  }

  try {
    // Initialize managers with a default python path
    Logger.log("Initializing managers...");
    kernelManager = new KernelManager("python3");
    Logger.log("✓ KernelManager created");

    consoleManager = new ConsoleManager(kernelManager, context.extensionPath);
    Logger.log("✓ ConsoleManager created");

    codeExecutor = new CodeExecutor(consoleManager);
    Logger.log("✓ CodeExecutor created");

    statusBarManager = new StatusBarManager(kernelManager);
    Logger.log("✓ StatusBarManager created");

    // Detect and set Python environment on activation
    Logger.log("Detecting Python environment...");
    const pythonPath = await getPythonPath();
    Logger.log(`Python path detected: ${pythonPath}`);
    statusBarManager.setPythonEnv(pythonPath);
    Logger.log("✓ Python environment set in status bar");

    // Register status bar
    context.subscriptions.push(statusBarManager);
    Logger.log("✓ Status bar registered");

    // Register all commands
    Logger.log("Registering commands...");
    registerCommands(context, {
      kernelManager,
      consoleManager,
      codeExecutor,
      statusBarManager,
      kernelClient,
      setKernelClient: (client) => {
        kernelClient = client;
      },
      getPythonPath,
      connectKernelClient,
      cleanupKernelClient,
    });
    Logger.log("✓ All commands registered");

    // Listen for Python interpreter changes
    await registerPythonInterpreterListener(
      context,
      kernelManager,
      statusBarManager,
      cleanupKernelClient
    );

    Logger.log("✓ Activation complete - all commands registered");
    Logger.log("Kernel actions button registered in editor/title");
    Logger.log(`Button should appear when: editorLangId == python`);
  } catch (error) {
    Logger.error("Activation failed", error);
    vscode.window.showErrorMessage(
      `Failed to activate Jupyter Console extension: ${error}`
    );
    throw error;
  }
}

export async function deactivate() {
  Logger.log("Deactivating extension...");

  // Clean up
  if (kernelClient) {
    await kernelClient.disconnect();
    kernelClient = null;
  }

  if (consoleManager) {
    consoleManager.dispose();
  }

  if (kernelManager && kernelManager.isRunning()) {
    kernelManager.stopKernel();
  }

  Logger.log("Deactivation complete");
  Logger.dispose();
}
