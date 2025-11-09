/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";

export interface Cell {
  startLine: number;
  endLine: number;
  code: string;
}

export class CellDetector {
  /**
   * Helper to move cursor to a specific line and reveal it
   */
  static moveCursorToLine(lineNumber: number): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const newPosition = new vscode.Position(lineNumber, 0);
    editor.selection = new vscode.Selection(newPosition, newPosition);
    editor.revealRange(new vscode.Range(newPosition, newPosition));
  }

  /**
   * Find cell boundaries around a specific line using local search
   * Returns { start, end } where start and end are line numbers
   */
  private static findCellBoundariesAtLine(
    document: vscode.TextDocument,
    lineNumber: number
  ): { start: number; end: number } {
    // Search backwards for cell start (either "# %%" or beginning of file)
    let start = 0;
    for (let i = lineNumber; i >= 0; i--) {
      const line = document.lineAt(i);
      if (line.text.trim().startsWith("# %%")) {
        start = i;
        break;
      }
    }

    // Search forwards for cell end (either next "# %%" or end of file)
    let end = document.lineCount;
    for (let i = lineNumber + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().startsWith("# %%")) {
        end = i;
        break;
      }
    }

    return { start, end };
  }

  /**
   * Get the cell that contains the given line number
   */
  static getCellAtLine(
    document: vscode.TextDocument,
    lineNumber: number
  ): Cell | null {
    // Validate line number is within document bounds
    if (lineNumber < 0 || lineNumber >= document.lineCount) {
      return null;
    }

    const { start, end } = this.findCellBoundariesAtLine(document, lineNumber);

    // Determine actual cell start (skip "# %%" marker if present)
    let cellStart = start;
    if (document.lineAt(start).text.trim().startsWith("# %%")) {
      cellStart = start + 1;
    }

    // Extract code from cell
    const lines: string[] = [];
    for (let j = cellStart; j < end; j++) {
      const lineText = document.lineAt(j).text;
      // Skip # %% markers (shouldn't encounter them, but be safe)
      if (!lineText.trim().startsWith("# %%")) {
        lines.push(lineText);
      }
    }

    return {
      startLine: cellStart,
      endLine: end - 1,
      code: lines.join("\n").trim(),
    };
  }

  /**
   * Get the current line text
   */
  static getCurrentLine(editor: vscode.TextEditor): string {
    const cursorLine = editor.selection.active.line;
    return editor.document.lineAt(cursorLine).text;
  }

  /**
   * Get the selected text or current line
   */
  static getSelectedText(editor: vscode.TextEditor): string | null {
    const selection = editor.selection;

    if (selection.isEmpty) {
      return null;
    }

    return editor.document.getText(selection);
  }

  /**
   * Move cursor to next line
   */
  static moveCursorToNextLine(editor: vscode.TextEditor): void {
    const currentLine = editor.selection.active.line;
    const nextLine = Math.min(currentLine + 1, editor.document.lineCount - 1);
    this.moveCursorToLine(nextLine);
  }

  /**
   * Move cursor to the end of selection
   */
  static moveCursorToEndOfSelection(editor: vscode.TextEditor): void {
    const selection = editor.selection;
    const endPosition = selection.end;

    // Move to the next line after selection
    const nextLine = Math.min(
      endPosition.line + 1,
      editor.document.lineCount - 1
    );
    this.moveCursorToLine(nextLine);
  }

  /**
   * Get code in a range of lines
   * @param document The document to extract code from
   * @param options.fromLine Starting line (inclusive, default: 0)
   * @param options.toLine Ending line (exclusive, default: document.lineCount)
   * @param options.skipCellMarkers Whether to skip "# %%" markers (default: true)
   * @returns The code string, or null if no code found
   */
  static getCodeInRange(
    document: vscode.TextDocument,
    options: {
      fromLine?: number;
      toLine?: number;
      skipCellMarkers?: boolean;
    } = {}
  ): string | null {
    const fromLine = options.fromLine ?? 0;
    const toLine = options.toLine ?? document.lineCount;
    const skipCellMarkers = options.skipCellMarkers ?? true;

    const lines: string[] = [];

    for (let i = fromLine; i < toLine; i++) {
      const lineText = document.lineAt(i).text;
      // Skip cell markers if requested
      if (skipCellMarkers && lineText.trim().startsWith("# %%")) {
        continue;
      }
      lines.push(lineText);
    }

    const code = lines.join("\n").trim();
    return code || null;
  }

  /**
   * Get code at a specific line with range options
   * @param document The document to extract code from
   * @param lineNumber The reference line number
   * @param fromTop If true, start from line 0
   * @param toEnd If true, go to end of document
   * @returns The code string, or null if no code found
   *
   * Behavior:
   * - fromTop=false, toEnd=false: Get cell at lineNumber
   * - fromTop=true,  toEnd=false: Get all code from 0 to lineNumber (exclusive)
   * - fromTop=false, toEnd=true:  Get all code from lineNumber to end
   * - fromTop=true,  toEnd=true:  Get all code in file
   */
  static getCodeAtLine(
    document: vscode.TextDocument,
    lineNumber: number,
    fromTop: boolean = false,
    toEnd: boolean = false
  ): string | null {
    if (fromTop && toEnd) {
      // Run all: entire file
      return this.getCodeInRange(document, { skipCellMarkers: true });
    }

    if (fromTop) {
      // Run all above: from 0 to lineNumber (exclusive)
      return this.getCodeInRange(document, {
        toLine: lineNumber,
        skipCellMarkers: true,
      });
    }

    if (toEnd) {
      // Run all below: from lineNumber to end
      return this.getCodeInRange(document, {
        fromLine: lineNumber,
        skipCellMarkers: true,
      });
    }

    // Run cell: just the cell at lineNumber
    const cell = this.getCellAtLine(document, lineNumber);
    return cell?.code ?? null;
  }

  /**
   * Move cursor to the beginning of the next cell
   */
  static moveCursorToNextCell(editor: vscode.TextEditor): void {
    const currentLine = editor.selection.active.line;
    const document = editor.document;

    // Search forward from current line for the next "# %%" marker
    for (let i = currentLine + 1; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().startsWith("# %%")) {
        // Found next cell marker, move to line after it
        const targetLine = Math.min(i + 1, document.lineCount - 1);
        this.moveCursorToLine(targetLine);
        return;
      }
    }

    // No next cell found - already at last cell, do nothing
  }
}
