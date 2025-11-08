/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Unit tests for constants module
 */

import * as assert from "assert";
import {
  getViewerTerminalStartDelay,
  getConsoleTerminalStartDelay,
  getKernelOperationWait,
  getKernelConnectionTimeout,
  getCodeExecutionTimeout,
} from "../../constants";

describe("Constants Module Test Suite", () => {
  it("getViewerTerminalStartDelay should return default value", () => {
    const delay = getViewerTerminalStartDelay();
    assert.strictEqual(typeof delay, "number");
    assert.ok(delay >= 0, "Delay should be non-negative");
  });

  it("getConsoleTerminalStartDelay should return default value", () => {
    const delay = getConsoleTerminalStartDelay();
    assert.strictEqual(typeof delay, "number");
    assert.ok(delay >= 0, "Delay should be non-negative");
  });

  it("getKernelOperationWait should return default value", () => {
    const wait = getKernelOperationWait();
    assert.strictEqual(typeof wait, "number");
    assert.ok(wait >= 0, "Wait time should be non-negative");
  });

  it("getKernelConnectionTimeout should return default value", () => {
    const timeout = getKernelConnectionTimeout();
    assert.strictEqual(typeof timeout, "number");
    assert.ok(timeout >= 1000, "Timeout should be at least 1000ms");
  });

  it("getCodeExecutionTimeout should return default value", () => {
    const timeout = getCodeExecutionTimeout();
    assert.strictEqual(typeof timeout, "number");
    assert.ok(timeout >= 1000, "Timeout should be at least 1000ms");
  });

  it("All timeout values should be reasonable", () => {
    const viewerDelay = getViewerTerminalStartDelay();
    const consoleDelay = getConsoleTerminalStartDelay();
    const operationWait = getKernelOperationWait();
    const connectionTimeout = getKernelConnectionTimeout();
    const executionTimeout = getCodeExecutionTimeout();

    // Check reasonable upper bounds (< 5 minutes)
    assert.ok(viewerDelay < 300000, "Viewer delay should be < 5 min");
    assert.ok(consoleDelay < 300000, "Console delay should be < 5 min");
    assert.ok(operationWait < 300000, "Operation wait should be < 5 min");
    assert.ok(connectionTimeout < 300000, "Connection timeout should be < 5 min");
    assert.ok(executionTimeout < 600000, "Execution timeout should be < 10 min");
  });
});
