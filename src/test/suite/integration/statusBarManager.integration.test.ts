/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for StatusBarManager module
 * Tests status bar UI updates and state transitions
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import { StatusBarManager, KernelState } from "../../../statusBarManager";
import { KernelManager } from "../../../kernelManager";

describe("StatusBarManager Integration Tests", () => {
  let kernelManager: KernelManager;
  let statusBarManager: StatusBarManager;

  // Use the test-env Python
  const projectRoot = path.resolve(__dirname, "../../../../");
  const testPython = path.join(projectRoot, "test-env", "bin", "python");

  beforeEach(() => {
    kernelManager = new KernelManager(testPython);
    statusBarManager = new StatusBarManager(kernelManager);
  });

  afterEach(() => {
    statusBarManager.dispose();
    if (kernelManager.isRunning()) {
      await kernelManager.stopKernel();
      // stopKernel() now waits for process to exit, no additional delay needed
    }
  });

  describe("State Management", () => {
    it("Should initialize in Stopped state", () => {
      const state = statusBarManager.getState();
      assert.strictEqual(
        state,
        KernelState.Stopped,
        "Should start in Stopped state"
      );
    });

    it("Should transition to Starting state", () => {
      statusBarManager.setState(KernelState.Starting);

      const state = statusBarManager.getState();
      assert.strictEqual(
        state,
        KernelState.Starting,
        "Should be in Starting state"
      );
    });

    it("Should transition to Running state", () => {
      statusBarManager.setState(KernelState.Running);

      const state = statusBarManager.getState();
      assert.strictEqual(
        state,
        KernelState.Running,
        "Should be in Running state"
      );
    });

    it("Should transition to Busy state", () => {
      statusBarManager.setState(KernelState.Busy);

      const state = statusBarManager.getState();
      assert.strictEqual(state, KernelState.Busy, "Should be in Busy state");
    });

    it("Should transition back to Stopped state", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Stopped);

      const state = statusBarManager.getState();
      assert.strictEqual(
        state,
        KernelState.Stopped,
        "Should return to Stopped state"
      );
    });
  });

  describe("State Transitions", () => {
    it("Should handle full lifecycle: Stopped -> Starting -> Running", () => {
      // Start
      statusBarManager.setState(KernelState.Stopped);
      assert.strictEqual(statusBarManager.getState(), KernelState.Stopped);

      // Starting
      statusBarManager.setState(KernelState.Starting);
      assert.strictEqual(statusBarManager.getState(), KernelState.Starting);

      // Running
      statusBarManager.setState(KernelState.Running);
      assert.strictEqual(statusBarManager.getState(), KernelState.Running);
    });

    it("Should handle execution cycle: Running -> Busy -> Running", () => {
      // Start in Running state
      statusBarManager.setState(KernelState.Running);
      assert.strictEqual(statusBarManager.getState(), KernelState.Running);

      // Execute code (becomes busy)
      statusBarManager.setState(KernelState.Busy);
      assert.strictEqual(statusBarManager.getState(), KernelState.Busy);

      // Execution completes (back to running)
      statusBarManager.setState(KernelState.Running);
      assert.strictEqual(statusBarManager.getState(), KernelState.Running);
    });

    it("Should handle restart cycle: Running -> Stopped -> Starting -> Running", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Stopped);
      statusBarManager.setState(KernelState.Starting);
      statusBarManager.setState(KernelState.Running);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Running,
        "Should complete restart cycle"
      );
    });

    it("Should handle rapid state changes", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Busy);
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Busy);
      statusBarManager.setState(KernelState.Running);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Running,
        "Should handle rapid state changes"
      );
    });
  });

  describe("Python Environment", () => {
    it("Should update Python environment name", async () => {
      // Should not throw
      await assert.doesNotReject(async () => {
        await statusBarManager.updatePythonEnv();
      });
    });

    it("Should handle multiple environment updates", async () => {
      await statusBarManager.updatePythonEnv();
      await statusBarManager.updatePythonEnv();
      await statusBarManager.updatePythonEnv();

      assert.ok(true, "Handled multiple environment updates");
    });

    it("Should update environment while in different states", async () => {
      // Update in Stopped state
      await statusBarManager.updatePythonEnv();

      // Update in Running state
      statusBarManager.setState(KernelState.Running);
      await statusBarManager.updatePythonEnv();

      // Update in Busy state
      statusBarManager.setState(KernelState.Busy);
      await statusBarManager.updatePythonEnv();

      assert.ok(true, "Updated environment across different states");
    });
  });

  describe("Status Bar Visibility", () => {
    it("Should show status bar when Python file is open", async () => {
      // Create a Python document
      const document = await vscode.workspace.openTextDocument({
        content: "print('test')",
        language: "python",
      });

      await vscode.window.showTextDocument(document);

      // Give status bar time to update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Status bar should be visible (we can't directly test visibility, but it shouldn't throw)
      assert.ok(true, "Status bar updated for Python file");

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    it("Should handle switching between Python and non-Python files", async () => {
      // Create Python file
      const pythonDoc = await vscode.workspace.openTextDocument({
        content: "print('test')",
        language: "python",
      });

      await vscode.window.showTextDocument(pythonDoc);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Create non-Python file
      const textDoc = await vscode.workspace.openTextDocument({
        content: "plain text",
        language: "plaintext",
      });

      await vscode.window.showTextDocument(textDoc);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Switch back to Python
      await vscode.window.showTextDocument(pythonDoc);
      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.ok(true, "Handled file switching");

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });
  });

  describe("Integration with Kernel Lifecycle", () => {
    it("Should reflect kernel starting state", async () => {
      statusBarManager.setState(KernelState.Starting);

      // Simulate kernel start (actual kernel start tested elsewhere)
      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Starting,
        "Should show Starting state during kernel startup"
      );
    });

    it("Should reflect kernel running state", () => {
      statusBarManager.setState(KernelState.Running);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Running,
        "Should show Running state when kernel is ready"
      );
    });

    it("Should reflect kernel busy state during execution", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Busy);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Busy,
        "Should show Busy state during code execution"
      );
    });

    it("Should reflect kernel stopped state", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Stopped);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Stopped,
        "Should show Stopped state when kernel is stopped"
      );
    });
  });

  describe("Disposal", () => {
    it("Should dispose cleanly", () => {
      statusBarManager.setState(KernelState.Running);

      assert.doesNotThrow(() => {
        statusBarManager.dispose();
      });
    });

    it("Should handle disposal from different states", () => {
      // Test disposal from each state
      statusBarManager.setState(KernelState.Stopped);
      const manager1 = new StatusBarManager(kernelManager);
      manager1.dispose();

      statusBarManager.setState(KernelState.Starting);
      const manager2 = new StatusBarManager(kernelManager);
      manager2.dispose();

      statusBarManager.setState(KernelState.Running);
      const manager3 = new StatusBarManager(kernelManager);
      manager3.dispose();

      statusBarManager.setState(KernelState.Busy);
      const manager4 = new StatusBarManager(kernelManager);
      manager4.dispose();

      assert.ok(true, "Disposed from all states without error");
    });

    it("Should handle multiple disposals", () => {
      statusBarManager.dispose();

      // Second disposal should not throw
      assert.doesNotThrow(() => {
        statusBarManager.dispose();
      });
    });
  });

  describe("Edge Cases", () => {
    it("Should handle state changes after disposal", () => {
      statusBarManager.dispose();

      // Should not throw (though it won't do anything)
      assert.doesNotThrow(() => {
        statusBarManager.setState(KernelState.Running);
      });
    });

    it("Should handle getState after disposal", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.dispose();

      // Should still return last state
      const state = statusBarManager.getState();
      assert.strictEqual(
        state,
        KernelState.Running,
        "Should return last state even after disposal"
      );
    });

    it("Should handle rapid state changes without errors", () => {
      for (let i = 0; i < 100; i++) {
        const states = [
          KernelState.Stopped,
          KernelState.Starting,
          KernelState.Running,
          KernelState.Busy,
        ];
        statusBarManager.setState(states[i % states.length]);
      }

      assert.ok(true, "Handled 100 rapid state changes");
    });
  });

  describe("Realistic Usage Scenarios", () => {
    it("Should handle typical user session", async () => {
      // User opens Python file
      const document = await vscode.workspace.openTextDocument({
        content: "x = 42\nprint(x)",
        language: "python",
      });
      await vscode.window.showTextDocument(document);

      // Start kernel
      statusBarManager.setState(KernelState.Starting);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Kernel ready
      statusBarManager.setState(KernelState.Running);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execute code
      statusBarManager.setState(KernelState.Busy);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execution completes
      statusBarManager.setState(KernelState.Running);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execute again
      statusBarManager.setState(KernelState.Busy);
      await new Promise((resolve) => setTimeout(resolve, 100));
      statusBarManager.setState(KernelState.Running);

      // Stop kernel
      statusBarManager.setState(KernelState.Stopped);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Stopped,
        "Completed typical user session"
      );

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    it("Should handle interrupted execution", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Busy);

      // User interrupts
      statusBarManager.setState(KernelState.Running);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Running,
        "Handled interrupted execution"
      );
    });

    it("Should handle kernel restart during execution", () => {
      statusBarManager.setState(KernelState.Running);
      statusBarManager.setState(KernelState.Busy);

      // User restarts kernel mid-execution
      statusBarManager.setState(KernelState.Stopped);
      statusBarManager.setState(KernelState.Starting);
      statusBarManager.setState(KernelState.Running);

      assert.strictEqual(
        statusBarManager.getState(),
        KernelState.Running,
        "Handled restart during execution"
      );
    });
  });
});
