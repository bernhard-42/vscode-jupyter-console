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
   * Get the cell that contains the given line number
   */
  static getCellAtLine(
    document: vscode.TextDocument,
    lineNumber: number
  ): Cell | null {
    const boundaries = this.findCellBoundaries(document);

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];

      if (lineNumber >= start && lineNumber < end) {
        // Found the cell
        let cellStart = start;

        // If this cell starts with a # %% marker, skip that line
        if (document.lineAt(start).text.trim().startsWith("# %%")) {
          cellStart = start + 1;
        }

        // Extract code from cell, skipping empty lines at the start
        const lines: string[] = [];
        for (let j = cellStart; j < end; j++) {
          const lineText = document.lineAt(j).text;
          // Skip # %% markers
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
    }

    return null;
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
    const boundaries = this.findCellBoundaries(editor.document);

    // Find the current cell
    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i];
      const end = boundaries[i + 1];

      if (currentLine >= start && currentLine < end) {
        // Found current cell, move to next cell
        if (i + 1 < boundaries.length - 1) {
          const nextCellStart = boundaries[i + 1];
          // Skip the # %% marker line
          let targetLine = nextCellStart;
          if (
            editor.document.lineAt(nextCellStart).text.trim().startsWith("# %%")
          ) {
            targetLine = nextCellStart + 1;
          }

          this.moveCursorToLine(editor, targetLine);
        }
        break;
      }
    }
  }
}
