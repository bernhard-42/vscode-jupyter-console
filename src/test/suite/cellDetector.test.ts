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

  describe("getCodeInRange", () => {
    it("should get code from entire document", () => {
      const code = CellDetector.getCodeInRange(testDocument);

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("First cell"), "Should include first cell");
      assert.ok(code!.includes("import numpy"), "Should include second cell");
      assert.ok(!code!.includes("# %%"), "Should skip cell markers by default");
    });

    it("should get code from specific range", () => {
      const code = CellDetector.getCodeInRange(testDocument, {
        fromLine: 0,
        toLine: 3,
      });

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("First cell"), "Should include first cell");
      assert.ok(!code!.includes("import numpy"), "Should not include later cells");
    });

    it("should include cell markers when skipCellMarkers is false", () => {
      const code = CellDetector.getCodeInRange(testDocument, {
        skipCellMarkers: false,
      });

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("# %%"), "Should include cell markers");
    });

    it("should return null for empty range", () => {
      const code = CellDetector.getCodeInRange(testDocument, {
        fromLine: 0,
        toLine: 0,
      });

      assert.strictEqual(code, null, "Should return null for empty range");
    });
  });

  describe("getCodeAtLine", () => {
    it("should get cell at line when both fromTop and toEnd are false", () => {
      const code = CellDetector.getCodeAtLine(testDocument, 0, false, false);

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("First cell"), "Should get first cell");
      assert.ok(!code!.includes("import numpy"), "Should not include other cells");
    });

    it("should get all code above when fromTop is true", () => {
      // Find the third cell marker line
      let thirdCellLine = -1;
      for (let i = 0; i < testDocument.lineCount; i++) {
        if (testDocument.lineAt(i).text.includes("# %% Third")) {
          thirdCellLine = i;
          break;
        }
      }

      assert.ok(thirdCellLine > 0, "Should find third cell marker");

      const code = CellDetector.getCodeAtLine(
        testDocument,
        thirdCellLine,
        true,
        false
      );

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("First cell"), "Should include first cell");
      assert.ok(code!.includes("import numpy"), "Should include second cell");
      assert.ok(!code!.includes("def test()"), "Should not include third cell");
    });

    it("should get all code below when toEnd is true", () => {
      // Find the second cell marker line
      let secondCellLine = -1;
      for (let i = 0; i < testDocument.lineCount; i++) {
        if (testDocument.lineAt(i).text.includes("# %% Second")) {
          secondCellLine = i;
          break;
        }
      }

      assert.ok(secondCellLine > 0, "Should find second cell marker");

      const code = CellDetector.getCodeAtLine(
        testDocument,
        secondCellLine + 1,
        false,
        true
      );

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("import numpy"), "Should include second cell");
      assert.ok(code!.includes("def test()"), "Should include third cell");
      assert.ok(!code!.includes("First cell"), "Should not include first cell");
    });

    it("should get all code when both fromTop and toEnd are true", () => {
      const code = CellDetector.getCodeAtLine(testDocument, 0, true, true);

      assert.ok(code !== null, "Code should not be null");
      assert.ok(code!.includes("First cell"), "Should include first cell");
      assert.ok(code!.includes("import numpy"), "Should include second cell");
      assert.ok(code!.includes("def test()"), "Should include third cell");
      assert.ok(!code!.includes("# %%"), "Should skip cell markers");
    });
  });
});
