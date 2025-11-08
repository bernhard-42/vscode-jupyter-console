/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for CellDetector - tests against real VS Code document APIs
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { CellDetector } from "../../../cellDetector";

describe("CellDetector Integration Tests", () => {
  let document: vscode.TextDocument;
  let editor: vscode.TextEditor;

  beforeEach(async () => {
    // Create a real Python document in VS Code
    const content = `# First cell without marker
print("Hello from first cell")
x = 1

# %% Second cell
import numpy as np
def calculate():
    return 42

# %% Third cell with comment
# This is a comment
result = calculate()
print(result)

# %% Empty cell

# %% Final cell
print("done")`;

    document = await vscode.workspace.openTextDocument({
      content,
      language: "python",
    });

    editor = await vscode.window.showTextDocument(document);
  });

  afterEach(async () => {
    // Close the document
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  it("Should find all cell boundaries in real document", () => {
    const boundaries = CellDetector.findCellBoundaries(document);

    // Should have: start(0), 3 cell markers, empty cell marker, final cell marker, end
    assert.ok(boundaries.length >= 5, `Expected at least 5 boundaries, got ${boundaries.length}`);
    assert.strictEqual(boundaries[0], 0, "First boundary should be line 0");
    assert.strictEqual(
      boundaries[boundaries.length - 1],
      document.lineCount,
      "Last boundary should be document line count"
    );
  });

  it("Should extract first cell correctly from real document", () => {
    const cell = CellDetector.getCellAtLine(document, 1);

    assert.ok(cell !== null, "Cell should not be null");
    assert.ok(
      cell!.code.includes("Hello from first cell"),
      "Should contain first cell content"
    );
    assert.ok(cell!.code.includes("x = 1"), "Should include variable assignment");
  });

  it("Should get current cell from editor selection", () => {
    // Move cursor to line 5 (should be in second cell)
    const position = new vscode.Position(5, 0);
    editor.selection = new vscode.Selection(position, position);

    const cell = CellDetector.getCurrentCell(editor);

    assert.ok(cell !== null, "Should find cell at cursor");
    assert.ok(
      cell!.code.includes("import numpy") || cell!.code.includes("calculate"),
      "Should be in second cell"
    );
  });

  it("Should get current line from editor", () => {
    // Move cursor to a specific line
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);

    const lineText = CellDetector.getCurrentLine(editor);

    assert.strictEqual(
      lineText,
      document.lineAt(1).text,
      "Should return correct line text"
    );
  });

  it("Should get selected text from editor", () => {
    // Select text from line 1 to line 2
    const start = new vscode.Position(1, 0);
    const end = new vscode.Position(2, 5);
    editor.selection = new vscode.Selection(start, end);

    const selectedText = CellDetector.getSelectedText(editor);

    assert.ok(selectedText !== null, "Should have selected text");
    assert.ok(
      selectedText!.includes("Hello"),
      "Should contain text from selection"
    );
  });

  it("Should return null for empty selection", () => {
    // Empty selection
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);

    const selectedText = CellDetector.getSelectedText(editor);

    assert.strictEqual(selectedText, null, "Should return null for empty selection");
  });

  it("Should move cursor to next line", () => {
    const position = new vscode.Position(5, 0);
    editor.selection = new vscode.Selection(position, position);

    CellDetector.moveCursorToNextLine(editor);

    assert.strictEqual(
      editor.selection.active.line,
      6,
      "Cursor should move to next line"
    );
  });

  it("Should move cursor to next cell", () => {
    // Start in first cell
    const position = new vscode.Position(1, 0);
    editor.selection = new vscode.Selection(position, position);

    CellDetector.moveCursorToNextCell(editor);

    // Should move to second cell (after # %% marker)
    const newLine = editor.selection.active.line;
    const lineText = document.lineAt(newLine).text;

    // Should not be on a marker line
    assert.ok(
      !lineText.trim().startsWith("# %%"),
      "Should skip the cell marker"
    );

    // Should be past the first cell
    assert.ok(newLine > 3, "Should be in a later cell");
  });

  it("Should handle cells with only comments", () => {
    // Find a cell with comments
    let commentCellLine = -1;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.includes("# %% Third cell")) {
        commentCellLine = i + 1; // Line after marker
        break;
      }
    }

    assert.ok(commentCellLine > 0, "Should find third cell");

    const cell = CellDetector.getCellAtLine(document, commentCellLine);

    assert.ok(cell !== null, "Should extract cell with comments");
    assert.ok(
      cell!.code.includes("calculate") || cell!.code.includes("result"),
      "Should contain cell code"
    );
  });

  it("Should handle empty cells", () => {
    // Find empty cell marker
    let emptyCellLine = -1;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.includes("# %% Empty cell")) {
        emptyCellLine = i + 1;
        break;
      }
    }

    if (emptyCellLine > 0) {
      const cell = CellDetector.getCellAtLine(document, emptyCellLine);

      // Empty cell might return empty code or null
      if (cell !== null) {
        assert.ok(
          cell.code.trim().length === 0 || !cell.code.includes("Empty"),
          "Empty cell should have minimal or no code"
        );
      }
    }
  });
});
