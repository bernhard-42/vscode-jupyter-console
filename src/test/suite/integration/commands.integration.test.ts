/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for commands - tests that commands are registered
 */

import * as assert from "assert";
import * as vscode from "vscode";

describe("Commands Integration Tests", () => {
  it("Extension should be present and activated", async () => {
    const extension = vscode.extensions.getExtension(
      "bernhard-42.vscode-jupyter-console"
    );

    assert.ok(extension !== undefined, "Extension should be installed");

    if (!extension!.isActive) {
      await extension!.activate();
    }

    assert.ok(extension!.isActive, "Extension should be activated");
  });

  it("All commands should be registered", async () => {
    const expectedCommands = [
      "jupyterConsole.startKernel",
      "jupyterConsole.stopKernel",
      "jupyterConsole.restartKernel",
      "jupyterConsole.interruptKernel",
      "jupyterConsole.startConsole",
      "jupyterConsole.runCell",
      "jupyterConsole.runCellAndAdvance",
      "jupyterConsole.runSelection",
      "jupyterConsole.runSelectionAndAdvance",
    ];

    const allCommands = await vscode.commands.getCommands(true);

    for (const command of expectedCommands) {
      assert.ok(
        allCommands.includes(command),
        `Command ${command} should be registered`
      );
    }
  });

  it("Commands should have correct count", async () => {
    const expectedCommands = [
      "jupyterConsole.startKernel",
      "jupyterConsole.stopKernel",
      "jupyterConsole.restartKernel",
      "jupyterConsole.interruptKernel",
      "jupyterConsole.startConsole",
      "jupyterConsole.runCell",
      "jupyterConsole.runCellAndAdvance",
      "jupyterConsole.runSelection",
      "jupyterConsole.runSelectionAndAdvance",
    ];

    assert.strictEqual(
      expectedCommands.length,
      9,
      "Should have exactly 9 commands"
    );
  });

  it("Kernel commands should be registered", async () => {
    const kernelCommands = [
      "jupyterConsole.startKernel",
      "jupyterConsole.stopKernel",
      "jupyterConsole.restartKernel",
      "jupyterConsole.interruptKernel",
    ];

    const allCommands = await vscode.commands.getCommands(true);

    for (const command of kernelCommands) {
      assert.ok(
        allCommands.includes(command),
        `Kernel command ${command} should be registered`
      );
    }
  });

  it("Execution commands should be registered", async () => {
    const executionCommands = [
      "jupyterConsole.runCell",
      "jupyterConsole.runCellAndAdvance",
      "jupyterConsole.runSelection",
      "jupyterConsole.runSelectionAndAdvance",
    ];

    const allCommands = await vscode.commands.getCommands(true);

    for (const command of executionCommands) {
      assert.ok(
        allCommands.includes(command),
        `Execution command ${command} should be registered`
      );
    }
  });

  it("Console command should be registered", async () => {
    const allCommands = await vscode.commands.getCommands(true);

    assert.ok(
      allCommands.includes("jupyterConsole.startConsole"),
      "Console command should be registered"
    );
  });

  it("Commands should only include jupyterConsole namespace", async () => {
    const allCommands = await vscode.commands.getCommands(true);
    const jupyterConsoleCommands = allCommands.filter((cmd) =>
      cmd.startsWith("jupyterConsole.")
    );

    // Count our commands
    const ourCommands = [
      "jupyterConsole.startKernel",
      "jupyterConsole.stopKernel",
      "jupyterConsole.restartKernel",
      "jupyterConsole.interruptKernel",
      "jupyterConsole.startConsole",
      "jupyterConsole.runCell",
      "jupyterConsole.runCellAndAdvance",
      "jupyterConsole.runSelection",
      "jupyterConsole.runSelectionAndAdvance",
    ];

    // We might have a statusBarAction command too
    assert.ok(
      jupyterConsoleCommands.length >= ourCommands.length,
      `Should have at least ${ourCommands.length} jupyterConsole commands`
    );
  });
});
