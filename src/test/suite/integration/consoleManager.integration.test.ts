/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for ConsoleManager module
 * Tests Jupyter Console terminal integration
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import { ConsoleManager } from "../../../consoleManager";
import { KernelManager } from "../../../kernelManager";
import { getKernelConnectionTimeout } from "../../../constants";

describe("ConsoleManager Integration Tests", () => {
  let kernelManager: KernelManager;
  let consoleManager: ConsoleManager;
  const testTimeout = getKernelConnectionTimeout() + 10000; // Extra buffer

  // Use the test-env Python
  const projectRoot = path.resolve(__dirname, "../../../../");
  const testPython = path.join(projectRoot, "test-env", "bin", "python");
  const extensionPath = projectRoot;

  beforeEach(async function () {
    this.timeout(testTimeout);
    // Create managers
    kernelManager = new KernelManager(testPython);
    consoleManager = new ConsoleManager(kernelManager, extensionPath);

    // Start a kernel for console tests
    await kernelManager.startKernel();
  });

  afterEach(() => {
    // Clean up
    consoleManager.closeTerminals();
    consoleManager.dispose();
    if (kernelManager.isRunning()) {
      await kernelManager.stopKernel();
      // stopKernel() now waits for process to exit, no additional delay needed
    }
  });

  describe("Console Startup", () => {
    it("Should start console terminals successfully", async function () {
      this.timeout(testTimeout);

      await consoleManager.startConsole();

      assert.strictEqual(
        consoleManager.isActive(),
        true,
        "Console should be active after start"
      );
    });

    it("Should fail to start console without kernel", async function () {
      this.timeout(testTimeout);

      // Stop the kernel first
      await kernelManager.stopKernel();

      // Create new console manager
      const newConsoleManager = new ConsoleManager(
        kernelManager,
        extensionPath
      );

      try {
        await newConsoleManager.startConsole();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          String(error).includes("No kernel is running"),
          "Should throw 'No kernel is running' error"
        );
      } finally {
        newConsoleManager.dispose();
      }
    });

    it("Should create Jupyter Console terminal", async function () {
      this.timeout(testTimeout);

      const terminalsBefore = vscode.window.terminals.length;

      await consoleManager.startConsole();

      // Wait a bit for terminals to be created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const terminalsAfter = vscode.window.terminals.length;

      // Should have created at least 1 terminal (console), maybe 2 if viewer enabled
      assert.ok(
        terminalsAfter > terminalsBefore,
        "Should create at least one terminal"
      );

      // Check for Jupyter Console terminal
      const consoleTerminal = vscode.window.terminals.find(
        (t) => t.name === "Jupyter Console"
      );
      assert.ok(consoleTerminal !== undefined, "Should create Jupyter Console terminal");
    });

    it("Should create Jupyter Output terminal when enabled", async function () {
      this.timeout(testTimeout);

      // Ensure output viewer is enabled
      const config = vscode.workspace.getConfiguration("jupyterConsole");
      await config.update("enableOutputViewer", true, true);

      await consoleManager.startConsole();

      // Wait for terminals to be created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check for both terminals
      const consoleTerminal = vscode.window.terminals.find(
        (t) => t.name === "Jupyter Console"
      );
      const outputTerminal = vscode.window.terminals.find(
        (t) => t.name === "Jupyter Output"
      );

      assert.ok(consoleTerminal !== undefined, "Should create Jupyter Console terminal");
      assert.ok(outputTerminal !== undefined, "Should create Jupyter Output terminal");
    });

    it("Should not create Jupyter Output terminal when disabled", async function () {
      this.timeout(testTimeout);

      // Disable output viewer
      const config = vscode.workspace.getConfiguration("jupyterConsole");
      await config.update("enableOutputViewer", false, true);

      // Create new console manager to pick up config
      consoleManager.dispose();
      consoleManager = new ConsoleManager(kernelManager, extensionPath);

      await consoleManager.startConsole();

      // Wait for terminal to be created
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check terminals
      const consoleTerminal = vscode.window.terminals.find(
        (t) => t.name === "Jupyter Console"
      );
      const outputTerminal = vscode.window.terminals.find(
        (t) => t.name === "Jupyter Output"
      );

      assert.ok(consoleTerminal !== undefined, "Should create Jupyter Console terminal");
      assert.strictEqual(
        outputTerminal,
        undefined,
        "Should not create Jupyter Output terminal when disabled"
      );

      // Reset config
      await config.update("enableOutputViewer", true, true);
    });
  });

  describe("Console State", () => {
    it("Should report active state correctly", async function () {
      this.timeout(testTimeout);

      assert.strictEqual(
        consoleManager.isActive(),
        false,
        "Should be inactive before start"
      );

      await consoleManager.startConsole();

      assert.strictEqual(
        consoleManager.isActive(),
        true,
        "Should be active after start"
      );

      consoleManager.closeTerminals();

      assert.strictEqual(
        consoleManager.isActive(),
        false,
        "Should be inactive after close"
      );
    });
  });

  describe("Console Reconnection", () => {
    it("Should allow reconnecting to existing kernel", async function () {
      this.timeout(testTimeout);

      // Start console first time
      await consoleManager.startConsole();
      assert.strictEqual(consoleManager.isActive(), true);

      // Close terminals
      consoleManager.closeTerminals();
      assert.strictEqual(consoleManager.isActive(), false);

      // Kernel should still be running
      assert.strictEqual(kernelManager.isRunning(), true);

      // Reconnect - should work without restarting kernel
      await consoleManager.startConsole();
      assert.strictEqual(
        consoleManager.isActive(),
        true,
        "Should reconnect to existing kernel"
      );
    });

    it("Should handle multiple startConsole calls", async function () {
      this.timeout(testTimeout);

      // Start console
      await consoleManager.startConsole();

      const terminalCountAfterFirst = vscode.window.terminals.filter(
        (t) => t.name === "Jupyter Console" || t.name === "Jupyter Output"
      ).length;

      // Call startConsole again (should close old terminals and create new ones)
      await consoleManager.startConsole();

      // Wait for terminals to be recreated
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const terminalCountAfterSecond = vscode.window.terminals.filter(
        (t) => t.name === "Jupyter Console" || t.name === "Jupyter Output"
      ).length;

      // Should have same number of terminals (old ones replaced)
      assert.strictEqual(
        terminalCountAfterSecond,
        terminalCountAfterFirst,
        "Should replace old terminals with new ones"
      );
    });
  });

  describe("Console Interaction", () => {
    it("Should send text to console terminal", async function () {
      this.timeout(testTimeout);

      await consoleManager.startConsole();

      // Wait for console to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should not throw when sending text
      assert.doesNotThrow(() => {
        consoleManager.sendToConsole("1 + 1");
      });
    });

    it("Should show console terminal", async function () {
      this.timeout(testTimeout);

      await consoleManager.startConsole();

      // Wait for terminal
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should not throw
      assert.doesNotThrow(() => {
        consoleManager.showConsole();
      });
    });

    it("Should show viewer terminal when enabled", async function () {
      this.timeout(testTimeout);

      const config = vscode.workspace.getConfiguration("jupyterConsole");
      await config.update("enableOutputViewer", true, true);

      await consoleManager.startConsole();

      // Wait for terminals
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should not throw
      assert.doesNotThrow(() => {
        consoleManager.showViewer();
      });
    });

    it("Should show console when viewer is disabled", async function () {
      this.timeout(testTimeout);

      const config = vscode.workspace.getConfiguration("jupyterConsole");
      await config.update("enableOutputViewer", false, true);

      // Recreate console manager to pick up config
      consoleManager.dispose();
      consoleManager = new ConsoleManager(kernelManager, extensionPath);

      await consoleManager.startConsole();

      // Wait for terminal
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // showViewer should fall back to showConsole when viewer disabled
      assert.doesNotThrow(() => {
        consoleManager.showViewer();
      });

      // Reset config
      await config.update("enableOutputViewer", true, true);
    });
  });

  describe("Console Cleanup", () => {
    it("Should close terminals when closeTerminals called", async function () {
      this.timeout(testTimeout);

      await consoleManager.startConsole();

      assert.strictEqual(consoleManager.isActive(), true);

      consoleManager.closeTerminals();

      assert.strictEqual(
        consoleManager.isActive(),
        false,
        "Should be inactive after closing terminals"
      );
    });

    it("Should dispose cleanly", async function () {
      this.timeout(testTimeout);

      await consoleManager.startConsole();

      assert.strictEqual(consoleManager.isActive(), true);

      // Should not throw
      assert.doesNotThrow(() => {
        consoleManager.dispose();
      });

      assert.strictEqual(
        consoleManager.isActive(),
        false,
        "Should be inactive after dispose"
      );
    });
  });

  describe("Configuration Changes", () => {
    it("Should handle truncateInputLinesMax config change", async function () {
      this.timeout(testTimeout * 2);

      await consoleManager.startConsole();

      assert.strictEqual(consoleManager.isActive(), true);

      // Change config
      const config = vscode.workspace.getConfiguration("jupyterConsole");
      await config.update("truncateInputLinesMax", 20, true);

      // Wait for config change to be processed
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Console should still be active (restarted with new config)
      assert.strictEqual(
        consoleManager.isActive(),
        true,
        "Console should still be active after config change"
      );

      // Reset config
      await config.update("truncateInputLinesMax", undefined, true);
    });
  });
});
