/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for configuration - tests against real VS Code settings API
 */

import * as assert from "assert";
import * as vscode from "vscode";
import {
  getViewerTerminalStartDelay,
  getConsoleTerminalStartDelay,
  getKernelOperationWait,
  getKernelConnectionTimeout,
} from "../../../constants";

describe("Configuration Integration Tests", () => {
  let config: vscode.WorkspaceConfiguration;

  beforeEach(() => {
    config = vscode.workspace.getConfiguration("jupyterConsole");
  });

  afterEach(async () => {
    // Reset all config values to default
    await config.update("advanced.viewerTerminalStartDelay", undefined, true);
    await config.update("advanced.consoleTerminalStartDelay", undefined, true);
    await config.update("advanced.kernelOperationWait", undefined, true);
    await config.update("advanced.kernelConnectionTimeout", undefined, true);
    await config.update("enableOutputViewer", undefined, true);
    await config.update("truncateInputLinesMax", undefined, true);
  });

  it("Should read default viewerTerminalStartDelay", () => {
    const delay = getViewerTerminalStartDelay();
    assert.strictEqual(delay, 1000, "Default should be 1000ms");
  });

  it("Should read default consoleTerminalStartDelay", () => {
    const delay = getConsoleTerminalStartDelay();
    assert.strictEqual(delay, 1000, "Default should be 1000ms");
  });

  it("Should read default kernelOperationWait", () => {
    const wait = getKernelOperationWait();
    assert.strictEqual(wait, 1000, "Default should be 1000ms");
  });

  it("Should read default kernelConnectionTimeout", () => {
    const timeout = getKernelConnectionTimeout();
    assert.strictEqual(timeout, 10000, "Default should be 10000ms");
  });

  it("Should update and read custom viewerTerminalStartDelay", async () => {
    await config.update("advanced.viewerTerminalStartDelay", 2000, true);

    const delay = getViewerTerminalStartDelay();
    assert.strictEqual(delay, 2000, "Should read updated value");
  });

  it("Should update and read custom kernelConnectionTimeout", async () => {
    await config.update("advanced.kernelConnectionTimeout", 20000, true);

    const timeout = getKernelConnectionTimeout();
    assert.strictEqual(timeout, 20000, "Should read updated value");
  });

  it("Should read enableOutputViewer setting", () => {
    const enabled = config.get<boolean>("enableOutputViewer");
    assert.strictEqual(typeof enabled, "boolean", "Should be a boolean");
  });

  it("Should update enableOutputViewer setting", async () => {
    await config.update("enableOutputViewer", true, true);
    config = vscode.workspace.getConfiguration("jupyterConsole");

    const enabled = config.get<boolean>("enableOutputViewer");
    assert.strictEqual(enabled, true, "Should update to true");

    await config.update("enableOutputViewer", false, true);
    config = vscode.workspace.getConfiguration("jupyterConsole");

    const disabled = config.get<boolean>("enableOutputViewer");
    assert.strictEqual(disabled, false, "Should update to false");
  });

  it("Should read truncateInputLinesMax setting", () => {
    const maxLines = config.get<number>("truncateInputLinesMax");
    assert.strictEqual(typeof maxLines, "number", "Should be a number");
    assert.ok(maxLines! >= 0, "Should be non-negative");
  });

  it("Should update truncateInputLinesMax setting", async () => {
    await config.update("truncateInputLinesMax", 20, true);
    config = vscode.workspace.getConfiguration("jupyterConsole");

    const maxLines = config.get<number>("truncateInputLinesMax");
    assert.strictEqual(maxLines, 20, "Should update to 20");
  });

  it("Should validate timeout values are within bounds", async () => {
    // Test upper bounds
    await config.update("advanced.kernelConnectionTimeout", 60000, true);
    const timeout = getKernelConnectionTimeout();
    assert.ok(timeout <= 600000, "Should be within reasonable upper bound");

    // Test lower bounds
    await config.update("advanced.kernelConnectionTimeout", 1000, true);
    const minTimeout = getKernelConnectionTimeout();
    assert.ok(minTimeout >= 1000, "Should be at least 1000ms");
  });

  it("Configuration inspect should show defaults", () => {
    const inspection = config.inspect("advanced.viewerTerminalStartDelay");

    assert.ok(inspection !== undefined, "Inspection should not be undefined");
    assert.strictEqual(
      inspection!.defaultValue,
      1000,
      "Default value should be 1000"
    );
  });

  it("All configuration keys should be defined in package.json", () => {
    const configKeys = [
      "enableOutputViewer",
      "truncateInputLinesMax",
      "advanced.viewerTerminalStartDelay",
      "advanced.consoleTerminalStartDelay",
      "advanced.kernelOperationWait",
      "advanced.kernelConnectionTimeout",
      "advanced.codeExecutionTimeout",
    ];

    configKeys.forEach((key) => {
      const inspection = config.inspect(key);
      assert.ok(
        inspection !== undefined,
        `Configuration key ${key} should be defined`
      );
    });
  });
});
