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
 * Helper function to set up Python environment for kernel operations
 * Used by both startKernel and restartKernel commands
 */
async function setupPythonEnvironment(ctx: CommandContext): Promise<void> {
  const pythonPath = await ctx.getPythonPath();
  ctx.kernelManager.setPythonPath(pythonPath);
  await ctx.statusBarManager.updatePythonEnv();
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
        // Set up Python environment before starting
        await setupPythonEnvironment(ctx);

        ctx.codeExecutor.resetCounter();
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
        await ctx.kernelManager.stopKernel();
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

          // Set up Python environment before restarting
          await setupPythonEnvironment(ctx);

          ctx.codeExecutor.resetCounter();
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
          // KernelManager sends INTERRUPT command to Python wrapper via stdin
          // The wrapper calls km.interrupt_kernel() - the "Jupyter way" (cross-platform)
          await ctx.kernelManager.interruptKernel();

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

  // Run selection command (or current line if no selection)
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

  // CodeLens: Run Cell - run this cell and advance to next
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.codeLensRunCell",
      (markerLine: number) => {
        ctx.codeExecutor.codeLensRunCell(markerLine);
      }
    )
  );

  // CodeLens: Run Cell Above - run cell above and move cursor to this cell
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.codeLensRunCellAbove",
      (markerLine: number) => {
        ctx.codeExecutor.codeLensRunCellAbove(markerLine);
      }
    )
  );

  // CodeLens: Run All Below - run all code from marker to end
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.codeLensRunAllBelow",
      (markerLine: number) => {
        ctx.codeExecutor.codeLensRunAllBelow(markerLine);
      }
    )
  );

  // CodeLens: Run All Above - run all code from start to marker
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupyterConsole.codeLensRunAllAbove",
      (markerLine: number) => {
        ctx.codeExecutor.codeLensRunAllAbove(markerLine);
      }
    )
  );

  // Run cell and advance command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runCellAndAdvance", () => {
      ctx.codeExecutor.runCellAndAdvance();
    })
  );

  // Run all command
  context.subscriptions.push(
    vscode.commands.registerCommand("jupyterConsole.runAll", () => {
      ctx.codeExecutor.runAll();
    })
  );
}
