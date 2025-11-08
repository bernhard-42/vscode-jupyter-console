/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Unit tests for StatusBarManager module
 */

import * as assert from "assert";
import { KernelState } from "../../statusBarManager";

describe("StatusBarManager Test Suite", () => {
  it("KernelState enum should have all expected values", () => {
    assert.strictEqual(KernelState.Stopped, "stopped");
    assert.strictEqual(KernelState.Starting, "starting");
    assert.strictEqual(KernelState.Running, "running");
    assert.strictEqual(KernelState.Busy, "busy");
  });

  it("KernelState enum should have exactly 4 states", () => {
    const states = Object.values(KernelState);
    assert.strictEqual(states.length, 4, "Should have exactly 4 kernel states");
  });

  it("KernelState values should be unique", () => {
    const states = Object.values(KernelState);
    const uniqueStates = new Set(states);
    assert.strictEqual(
      states.length,
      uniqueStates.size,
      "All kernel states should be unique"
    );
  });

  it("KernelState values should be lowercase strings", () => {
    Object.values(KernelState).forEach((state) => {
      assert.strictEqual(typeof state, "string", "State should be a string");
      assert.strictEqual(
        state,
        state.toLowerCase(),
        "State should be lowercase"
      );
    });
  });
});
