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
  private static moveCursorToLine(
    editor: vscode.TextEditor,
    lineNumber: number
  ): void {
    const newPosition = new vscode.Position(lineNumber, 0);
    editor.selection = new vscode.Selection(newPosition, newPosition);
    editor.revealRange(new vscode.Range(newPosition, newPosition));
  }

  /**
   * Find all cell boundaries in the document
   * Returns array of line numbers where cells start/end
   * Note: Internal operations use local search for efficiency
   */
  static findCellBoundaries(document: vscode.TextDocument): number[] {
    const boundaries: number[] = [0]; // Start with beginning of file

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (line.text.trim().startsWith("# %%")) {
        boundaries.push(i);
      }
    }

    boundaries.push(document.lineCount); // Add end of file
    return boundaries;
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
   * Get the cell at the current cursor position
   */
  static getCurrentCell(editor: vscode.TextEditor): Cell | null {
    const cursorLine = editor.selection.active.line;
    return this.getCellAtLine(editor.document, cursorLine);
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
    this.moveCursorToLine(editor, nextLine);
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
    this.moveCursorToLine(editor, nextLine);
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
        this.moveCursorToLine(editor, targetLine);
        return;
      }
    }

    // No next cell found - already at last cell, do nothing
  }
}
