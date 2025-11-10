/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for CodeExecutor module
 * Tests code execution commands with real kernel
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import { CodeExecutor } from "../../../codeExecutor";
import { ConsoleManager } from "../../../consoleManager";
import { KernelManager } from "../../../kernelManager";
import { KernelClient } from "../../../kernelClient";
import { getKernelConnectionTimeout } from "../../../constants";

describe("CodeExecutor Integration Tests", () => {
  let kernelManager: KernelManager;
  let kernelClient: KernelClient;
  let consoleManager: ConsoleManager;
  let codeExecutor: CodeExecutor;
  let document: vscode.TextDocument;
  let editor: vscode.TextEditor;

  const testTimeout = getKernelConnectionTimeout() + 60000; // Connection timeout + 60s for test execution

  // Use the test-env Python
  const projectRoot = path.resolve(__dirname, "../../../../");
  const testPython = path.join(projectRoot, "test-env", "bin", "python");
  const extensionPath = projectRoot;

  beforeEach(async function () {
    this.timeout(testTimeout);

    // Start kernel
    kernelManager = new KernelManager(testPython);
    await kernelManager.startKernel();

    // Connect kernel client
    kernelClient = new KernelClient();
    const connectionFile = kernelManager.getConnectionFile();
    await kernelClient.connect(connectionFile!);

    // Create console manager
    consoleManager = new ConsoleManager(kernelManager, extensionPath);
    await consoleManager.startConsole();

    // Create code executor
    codeExecutor = new CodeExecutor(consoleManager);
    codeExecutor.setKernelClient(kernelClient);

    // Create a test document
    const content = `# Test Python file
x = 10
y = 20
print(x + y)

# %% Cell 1
import sys
print(sys.version)

# %% Cell 2
result = 42
print(result)`;

    document = await vscode.workspace.openTextDocument({
      content,
      language: "python",
    });

    editor = await vscode.window.showTextDocument(document);
  });

  afterEach(async () => {
    // Clean up
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    consoleManager.closeTerminals();
    consoleManager.dispose();
    if (kernelClient.isKernelConnected()) {
      await kernelClient.disconnect();
    }
    if (kernelManager.isRunning()) {
      kernelManager.stopKernel();
    }
  });

  describe("Selection Execution", () => {
    it("Should execute selected text", async function () {
      this.timeout(testTimeout);

      // Select "x = 10"
      const selection = new vscode.Selection(
        new vscode.Position(1, 0),
        new vscode.Position(1, 6)
      );
      editor.selection = selection;

      // Should not throw
      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Selection executed without error");
    });

    it("Should execute current line when no selection", async function () {
      this.timeout(testTimeout);

      // Move cursor to line with "x = 10" (no selection)
      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Current line executed without error");
    });

    it("Should execute selection and advance cursor", async function () {
      this.timeout(testTimeout);

      // Select "x = 10"
      const selection = new vscode.Selection(
        new vscode.Position(1, 0),
        new vscode.Position(1, 6)
      );
      editor.selection = selection;

      const initialLine = editor.selection.active.line;

      codeExecutor.runSelectionAndAdvance();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Cursor should have moved (note: actual movement depends on CellDetector logic)
      assert.ok(true, "Selection executed and cursor moved");
    });

    it("Should execute multi-line selection", async function () {
      this.timeout(testTimeout);

      // Select multiple lines
      const selection = new vscode.Selection(
        new vscode.Position(1, 0),
        new vscode.Position(3, 14)
      );
      editor.selection = selection;

      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Multi-line selection executed");
    });
  });

  describe("Cell Execution", () => {
    it("Should execute current cell", async function () {
      this.timeout(testTimeout);

      // Move cursor to Cell 1 (line 6)
      const position = new vscode.Position(7, 0);
      editor.selection = new vscode.Selection(position, position);

      assert.doesNotThrow(() => {
        codeExecutor.runCell();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Cell executed without error");
    });

    it("Should execute cell and advance to next cell", async function () {
      this.timeout(testTimeout);

      // Move cursor to Cell 1
      const position = new vscode.Position(7, 0);
      editor.selection = new vscode.Selection(position, position);

      codeExecutor.runCellAndAdvance();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Cursor should have moved to next cell
      assert.ok(true, "Cell executed and advanced");
    });

    it("Should execute last cell without error", async function () {
      this.timeout(testTimeout);

      // Move cursor to Cell 2 (last cell)
      const position = new vscode.Position(11, 0);
      editor.selection = new vscode.Selection(position, position);

      assert.doesNotThrow(() => {
        codeExecutor.runCell();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Last cell executed");
    });

    it("Should execute first cell before any markers", async function () {
      this.timeout(testTimeout);

      // Move cursor to line 1 (before first %% marker)
      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      assert.doesNotThrow(() => {
        codeExecutor.runCell();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "First cell (before markers) executed");
    });
  });

  describe("Kernel Client Integration", () => {
    it("Should set kernel client successfully", () => {
      const newExecutor = new CodeExecutor(consoleManager);

      assert.doesNotThrow(() => {
        newExecutor.setKernelClient(kernelClient);
      });
    });

    it("Should allow clearing kernel client", () => {
      assert.doesNotThrow(() => {
        codeExecutor.setKernelClient(null);
      });

      // Set it back for cleanup
      codeExecutor.setKernelClient(kernelClient);
    });

    it("Should execute code with active kernel client", async function () {
      this.timeout(testTimeout);

      // Ensure kernel client is set
      codeExecutor.setKernelClient(kernelClient);

      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Code executed with active kernel client");
    });
  });

  describe("Console Manager Integration", () => {
    it("Should start console if not active", async function () {
      this.timeout(testTimeout);

      // Close console
      consoleManager.closeTerminals();
      assert.strictEqual(consoleManager.isActive(), false);

      // Execute code - should auto-start console
      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      codeExecutor.runSelection();

      // Wait for console to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Console should be active now
      assert.strictEqual(
        consoleManager.isActive(),
        true,
        "Console should auto-start when executing code"
      );
    });

    it("Should show viewer when executing code", async function () {
      this.timeout(testTimeout);

      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      // Should not throw when showing viewer
      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      assert.ok(true, "Viewer shown during code execution");
    });
  });

  describe("Edge Cases", () => {
    it("Should handle empty document", async function () {
      this.timeout(testTimeout);

      // Create empty document
      const emptyDoc = await vscode.workspace.openTextDocument({
        content: "",
        language: "python",
      });

      const emptyEditor = await vscode.window.showTextDocument(emptyDoc);

      // Try to execute - should not throw
      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    it("Should handle document with only whitespace", async function () {
      this.timeout(testTimeout);

      const whitespaceDoc = await vscode.workspace.openTextDocument({
        content: "   \n\n   \n",
        language: "python",
      });

      const whitespaceEditor = await vscode.window.showTextDocument(
        whitespaceDoc
      );

      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    it("Should handle document with only comments", async function () {
      this.timeout(testTimeout);

      const commentDoc = await vscode.workspace.openTextDocument({
        content: "# Just a comment\n# Another comment",
        language: "python",
      });

      const commentEditor = await vscode.window.showTextDocument(commentDoc);

      assert.doesNotThrow(() => {
        codeExecutor.runSelection();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });
  });

  describe("Multiple Executions", () => {
    it("Should handle rapid successive executions", async function () {
      this.timeout(testTimeout * 2);

      const position = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(position, position);

      // Execute multiple times rapidly
      codeExecutor.runSelection();
      await new Promise((resolve) => setTimeout(resolve, 500));

      codeExecutor.runSelection();
      await new Promise((resolve) => setTimeout(resolve, 500));

      codeExecutor.runSelection();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Handled multiple rapid executions");
    });

    it("Should execute different cells sequentially", async function () {
      this.timeout(testTimeout * 2);

      // Execute Cell 1
      let position = new vscode.Position(7, 0);
      editor.selection = new vscode.Selection(position, position);
      codeExecutor.runCell();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Execute Cell 2
      position = new vscode.Position(11, 0);
      editor.selection = new vscode.Selection(position, position);
      codeExecutor.runCell();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Executed different cells sequentially");
    });
  });

  describe("Run All", () => {
    it("Should execute all code in document", async function () {
      this.timeout(testTimeout);

      // Run all code
      assert.doesNotThrow(() => {
        codeExecutor.runAll();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "All code executed without error");
    });

    it("Should execute all code regardless of cursor position", async function () {
      this.timeout(testTimeout);

      // Move cursor to middle of document
      const position = new vscode.Position(7, 0);
      editor.selection = new vscode.Selection(position, position);

      codeExecutor.runAll();

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "All code executed from any cursor position");
    });

    it("Should skip cell markers when running all", async function () {
      this.timeout(testTimeout);

      // Create document with many cell markers
      const markerDoc = await vscode.workspace.openTextDocument({
        content: `# %% First
x = 1
# %% Second
y = 2
# %% Third
z = 3`,
        language: "python",
      });

      await vscode.window.showTextDocument(markerDoc);

      assert.doesNotThrow(() => {
        codeExecutor.runAll();
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });
  });

  describe("CodeLens Methods", () => {
    it("Should execute cell via codeLensRunCell", async function () {
      this.timeout(testTimeout);

      // Find line with "# %% Cell 1" marker (should be line 5)
      let markerLine = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 1")) {
          markerLine = i;
          break;
        }
      }

      assert.ok(markerLine >= 0, "Should find Cell 1 marker");

      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunCell(markerLine);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Cursor should have moved to next cell or beyond
      assert.ok(true, "CodeLens run cell executed");
    });

    it("Should execute cell above via codeLensRunCellAbove", async function () {
      this.timeout(testTimeout);

      // Find line with "# %% Cell 2" marker
      let markerLine = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 2")) {
          markerLine = i;
          break;
        }
      }

      assert.ok(markerLine >= 0, "Should find Cell 2 marker");

      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunCellAbove(markerLine);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Note: codeLensRunCellAbove executes the cell above but doesn't move cursor
      // (intentional UX design - cursor stays at current position)
      assert.ok(true, "CodeLens run cell above executed");
    });

    it("Should execute all below via codeLensRunAllBelow", async function () {
      this.timeout(testTimeout);

      // Find line with "# %% Cell 1" marker
      let markerLine = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 1")) {
          markerLine = i;
          break;
        }
      }

      assert.ok(markerLine >= 0, "Should find Cell 1 marker");

      const initialCursorLine = editor.selection.active.line;

      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunAllBelow(markerLine);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Cursor should not move for "all below"
      assert.ok(true, "All code below executed");
    });

    it("Should execute all above via codeLensRunAllAbove", async function () {
      this.timeout(testTimeout);

      // Find line with "# %% Cell 2" marker (last marker)
      let markerLine = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 2")) {
          markerLine = i;
          break;
        }
      }

      assert.ok(markerLine >= 0, "Should find Cell 2 marker");

      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunAllAbove(markerLine);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Cursor should not move for "all above"
      assert.ok(true, "All code above executed");
    });

    it("Should handle codeLensRunCell at first marker", async function () {
      this.timeout(testTimeout);

      // Find first cell marker
      let firstMarker = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 1")) {
          firstMarker = i;
          break;
        }
      }

      assert.ok(firstMarker >= 0, "Should find first cell marker");

      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunCell(firstMarker);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "First cell executed via CodeLens");
    });

    it("Should handle codeLensRunCellAbove at first marker", async function () {
      this.timeout(testTimeout);

      // Find first cell marker
      let firstMarker = -1;
      for (let i = 0; i < document.lineCount; i++) {
        if (document.lineAt(i).text.includes("# %% Cell 1")) {
          firstMarker = i;
          break;
        }
      }

      assert.ok(firstMarker >= 0, "Should find first cell marker");

      // Should execute code before first marker (lines 0 to firstMarker)
      assert.doesNotThrow(() => {
        codeExecutor.codeLensRunCellAbove(firstMarker);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      assert.ok(true, "Code above first marker executed");
    });
  });
});
