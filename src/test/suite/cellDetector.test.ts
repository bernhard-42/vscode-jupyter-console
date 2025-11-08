/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Unit tests for CellDetector module
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { CellDetector } from "../../cellDetector";

describe("CellDetector Test Suite", () => {
  let testDocument: vscode.TextDocument;

  before(async () => {
    // Create a test Python file with cells
    const content = `# First cell without marker
print("Hello")

# %% Second cell
import numpy as np
x = 5

# %% Third cell
def test():
    return 42

# %% Fourth cell
# Comment in cell
result = test()
print(result)`;

    testDocument = await vscode.workspace.openTextDocument({
      content,
      language: "python",
    });
  });

  it("findCellBoundaries should identify all cell markers", () => {
    const boundaries = CellDetector.findCellBoundaries(testDocument);

    // Expected boundaries: [0, line with "# %% Second", line with "# %% Third", line with "# %% Fourth", end]
    assert.strictEqual(boundaries[0], 0, "First boundary should be 0");
    assert.strictEqual(
      boundaries[boundaries.length - 1],
      testDocument.lineCount,
      "Last boundary should be document line count"
    );

    // Should have 5 boundaries (start, 3 cell markers, end)
    assert.strictEqual(boundaries.length, 5, "Should have 5 boundaries");
  });

  it("getCellAtLine should return correct cell for first section", () => {
    const cell = CellDetector.getCellAtLine(testDocument, 0);

    assert.ok(cell !== null, "Cell should not be null");
    assert.strictEqual(cell!.startLine, 0, "Cell should start at line 0");
    assert.ok(
      cell!.code.includes("First cell"),
      "Cell should contain first cell content"
    );
  });

  it("getCellAtLine should return correct cell for marked cell", () => {
    // Find the line number of "# %% Second cell"
    let secondCellLine = -1;
    for (let i = 0; i < testDocument.lineCount; i++) {
      if (testDocument.lineAt(i).text.includes("# %% Second")) {
        secondCellLine = i;
        break;
      }
    }

    assert.ok(secondCellLine >= 0, "Should find second cell marker");

    const cell = CellDetector.getCellAtLine(testDocument, secondCellLine + 1);

    assert.ok(cell !== null, "Cell should not be null");
    assert.ok(
      cell!.code.includes("import numpy"),
      "Cell should contain numpy import"
    );
    assert.ok(!cell!.code.includes("# %%"), "Cell code should not include marker");
  });

  it("getCellAtLine should handle cell with function definition", () => {
    // Find the third cell with function
    let thirdCellLine = -1;
    for (let i = 0; i < testDocument.lineCount; i++) {
      if (testDocument.lineAt(i).text.includes("# %% Third")) {
        thirdCellLine = i;
        break;
      }
    }

    assert.ok(thirdCellLine >= 0, "Should find third cell marker");

    const cell = CellDetector.getCellAtLine(testDocument, thirdCellLine + 1);

    assert.ok(cell !== null, "Cell should not be null");
    assert.ok(cell!.code.includes("def test()"), "Cell should contain function");
    assert.ok(cell!.code.includes("return 42"), "Cell should contain return statement");
  });

  it("getCellAtLine should return null for invalid line", () => {
    const cell = CellDetector.getCellAtLine(testDocument, 999999);
    assert.strictEqual(cell, null, "Should return null for invalid line");
  });

  it("findCellBoundaries should handle empty document", async () => {
    const emptyDoc = await vscode.workspace.openTextDocument({
      content: "",
      language: "python",
    });

    const boundaries = CellDetector.findCellBoundaries(emptyDoc);

    // Should have start and end only
    assert.strictEqual(boundaries.length, 2, "Should have 2 boundaries");
    assert.strictEqual(boundaries[0], 0, "First should be 0");
    assert.strictEqual(boundaries[1], emptyDoc.lineCount, "Last should be line count");
  });

  it("findCellBoundaries should handle document with no markers", async () => {
    const noMarkerDoc = await vscode.workspace.openTextDocument({
      content: "print('hello')\nprint('world')",
      language: "python",
    });

    const boundaries = CellDetector.findCellBoundaries(noMarkerDoc);

    // Should have start and end only
    assert.strictEqual(boundaries.length, 2, "Should have 2 boundaries");
    assert.strictEqual(boundaries[0], 0, "First should be 0");
    assert.strictEqual(boundaries[1], 2, "Last should be line count");
  });

  it("getCellAtLine should trim cell code correctly", () => {
    const cell = CellDetector.getCellAtLine(testDocument, 0);

    assert.ok(cell !== null, "Cell should not be null");
    // Trimmed code should not have leading/trailing whitespace
    assert.strictEqual(
      cell!.code,
      cell!.code.trim(),
      "Cell code should be trimmed"
    );
  });
});
