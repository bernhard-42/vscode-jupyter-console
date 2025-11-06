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

interface CommandContext {
  kernelManager: KernelManager;
  consoleManager: ConsoleManager;
  codeExecutor: CodeExecutor;
  statusBarManager: StatusBarManager;
  kernelClient: KernelClient | null;
  setKernelClient: (client: KernelClient | null) => void;
  getPythonPath: () => Promise<string>;
  connectKernelClient: () => Promise<void>;
  cleanupKernelClient: () => Promise<void>;
}

/**
 * Register all extension commands
 */
export function registerCommands(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  // Status bar action command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.statusBarAction",
      async () => {
        if (ctx.kernelManager.isRunning()) {
          // Kernel is running -> Interrupt it
          Logger.log("Status bar clicked: Interrupting kernel");
          await vscode.commands.executeCommand(
            "jupyterConsole.interruptKernel"
          );
        } else {
          // Kernel is stopped -> Start it
          Logger.log("Status bar clicked: Starting kernel");
          await vscode.commands.executeCommand("jupyterConsole.startKernel");
        }
      }
    )
  );

  // Start kernel command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.startKernel", async () => {
      try {
        // Get the current Python interpreter before starting
        const pythonPath = await ctx.getPythonPath();
        ctx.kernelManager.setPythonPath(pythonPath);
        ctx.statusBarManager.setPythonEnv(pythonPath);

        ctx.statusBarManager.setState(KernelState.Starting);

        await ctx.kernelManager.startKernel();
        await ctx.connectKernelClient();

        ctx.statusBarManager.setState(KernelState.Running);
      } catch (error) {
        ctx.statusBarManager.setState(KernelState.Stopped);
        vscode.window.showErrorMessage(`Failed to start kernel: ${error}`);
      }
    })
  );

  // Stop kernel command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.stopKernel", async () => {
      try {
        await ctx.cleanupKernelClient();
        ctx.kernelManager.stopKernel();
        ctx.statusBarManager.setState(KernelState.Stopped);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to stop kernel: ${error}`);
      }
    })
  );

  // Restart kernel command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.restartKernel",
      async () => {
        try {
          await ctx.cleanupKernelClient();

          // Get the current Python interpreter before restarting
          const pythonPath = await ctx.getPythonPath();
          ctx.kernelManager.setPythonPath(pythonPath);
          ctx.statusBarManager.setPythonEnv(pythonPath);

          ctx.statusBarManager.setState(KernelState.Starting);
          await ctx.kernelManager.restartKernel();
          await ctx.connectKernelClient();

          ctx.statusBarManager.setState(KernelState.Running);
        } catch (error) {
          ctx.statusBarManager.setState(KernelState.Stopped);
          vscode.window.showErrorMessage(`Failed to restart kernel: ${error}`);
        }
      }
    )
  );

  // Interrupt kernel command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.interruptKernel",
      async () => {
        try {
          if (ctx.kernelClient && ctx.kernelClient.isKernelConnected()) {
            // Use proper Jupyter protocol interrupt via control channel
            await ctx.kernelClient.interrupt();
            Logger.log("Kernel interrupted via control channel");
          } else {
            // Fallback to process signal (less reliable)
            ctx.kernelManager.interruptKernel();
          }
          // Return to running state after interrupt
          ctx.statusBarManager.setState(KernelState.Running);
        } catch (error) {
          Logger.error("Failed to interrupt kernel:", error);
          vscode.window.showErrorMessage(
            `Failed to interrupt kernel: ${error}`
          );
        }
      }
    )
  );

  // Start console command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.startConsole", async () => {
      try {
        await ctx.consoleManager.startConsole();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start console: ${error}`);
      }
    })
  );

  // Run line command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runLine", () => {
      ctx.codeExecutor.runLine();
    })
  );

  // Run line and advance command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runLineAndAdvance", () => {
      ctx.codeExecutor.runLineAndAdvance();
    })
  );

  // Run selection command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runSelection", () => {
      ctx.codeExecutor.runSelection();
    })
  );

  // Run selection and advance command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.runSelectionAndAdvance",
      () => {
        ctx.codeExecutor.runSelectionAndAdvance();
      }
    )
  );

  // Run cell command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runCell", () => {
      ctx.codeExecutor.runCell();
    })
  );

  // Run cell and advance command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runCellAndAdvance", () => {
      ctx.codeExecutor.runCellAndAdvance();
    })
  );
}
