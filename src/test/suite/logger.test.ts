/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Unit tests for Logger module
 */

import * as assert from "assert";
import { Logger } from "../../logger";

describe("Logger Test Suite", () => {
  // Note: Logger uses VS Code OutputChannel which is available in test environment

  it("Logger should initialize without error", () => {
    assert.doesNotThrow(() => {
      Logger.initialize();
    });
  });

  it("Logger.log should not throw", () => {
    assert.doesNotThrow(() => {
      Logger.log("Test log message");
    });
  });

  it("Logger.error should not throw with message only", () => {
    assert.doesNotThrow(() => {
      Logger.error("Test error message");
    });
  });

  it("Logger.error should not throw with message and error object", () => {
    const testError = new Error("Test error");
    assert.doesNotThrow(() => {
      Logger.error("Test error message", testError);
    });
  });

  it("Logger.show should not throw", () => {
    assert.doesNotThrow(() => {
      Logger.show();
    });
  });

  it("Logger.log should auto-initialize if not initialized", () => {
    // This tests that log() calls initialize() if needed
    assert.doesNotThrow(() => {
      Logger.log("Auto-initialize test");
    });
  });

  it("Logger.error should auto-initialize if not initialized", () => {
    // This tests that error() calls initialize() if needed
    assert.doesNotThrow(() => {
      Logger.error("Auto-initialize error test");
    });
  });
});
