/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for KernelManager module
 * Tests actual kernel lifecycle: start, restart, stop
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { KernelManager } from "../../../kernelManager";
import { getKernelConnectionTimeout } from "../../../constants";

describe("KernelManager Integration Tests", () => {
  let kernelManager: KernelManager;
  const testTimeout = getKernelConnectionTimeout() + 5000; // Extra buffer for tests

  // Use the test-env Python (relative to project root)
  const projectRoot = path.resolve(__dirname, "../../../../");
  const testPython = path.join(projectRoot, "test-env", "bin", "python");

  beforeEach(() => {
    // Create a new KernelManager instance for each test using test environment
    kernelManager = new KernelManager(testPython);
  });

  afterEach(() => {
    // Ensure kernel is stopped after each test
    if (kernelManager.isRunning()) {
      await kernelManager.stopKernel();
      // stopKernel() now waits for process to exit, no additional delay needed
    }
  });

  describe("Kernel Start", () => {
    it("Should start a kernel successfully", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      assert.strictEqual(
        kernelManager.isRunning(),
        true,
        "Kernel should be running after start"
      );
    });

    it("Should create a connection file after kernel starts", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      const connectionFile = kernelManager.getConnectionFile();
      assert.ok(connectionFile !== null, "Connection file should exist");
      assert.ok(
        fs.existsSync(connectionFile!),
        "Connection file should exist on filesystem"
      );
    });

    it("Should not start kernel twice", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      // Try to start again - should not throw but show warning
      await kernelManager.startKernel();

      // Should still be running
      assert.strictEqual(kernelManager.isRunning(), true);
    });

    it("Should return correct Python path", () => {
      const pythonPath = kernelManager.getPythonPath();
      assert.strictEqual(
        pythonPath,
        testPython,
        "Should return configured Python path"
      );
    });

    it("Should allow setting Python path", () => {
      kernelManager.setPythonPath("/usr/bin/python3");
      assert.strictEqual(kernelManager.getPythonPath(), "/usr/bin/python3");
    });
  });

  describe("Kernel Stop", () => {
    it("Should stop a running kernel", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      assert.strictEqual(
        kernelManager.isRunning(),
        true,
        "Kernel should be running"
      );

      await kernelManager.stopKernel();

      assert.strictEqual(
        kernelManager.isRunning(),
        false,
        "Kernel should be stopped"
      );
      assert.strictEqual(
        kernelManager.getConnectionFile(),
        null,
        "Connection file should be null after stop"
      );
    });

    it("Should handle stopping when no kernel is running", () => {
      assert.strictEqual(kernelManager.isRunning(), false);

      // Should not throw - just show warning
      await kernelManager.stopKernel();

      assert.strictEqual(kernelManager.isRunning(), false);
    });
  });

  describe("Kernel Restart", () => {
    it("Should restart a running kernel", async function () {
      this.timeout(testTimeout * 2); // Restart takes longer

      await kernelManager.startKernel();

      const firstConnectionFile = kernelManager.getConnectionFile();
      assert.ok(firstConnectionFile !== null, "Should have connection file");

      // Restart the kernel
      await kernelManager.restartKernel();

      assert.strictEqual(
        kernelManager.isRunning(),
        true,
        "Kernel should be running after restart"
      );

      const newConnectionFile = kernelManager.getConnectionFile();
      assert.ok(newConnectionFile !== null, "Should have new connection file");

      // New connection file should be different (new kernel instance)
      assert.notStrictEqual(
        firstConnectionFile,
        newConnectionFile,
        "Connection file should be different after restart"
      );
    });

    it("Should handle restart when no kernel is running", async function () {
      this.timeout(testTimeout);

      assert.strictEqual(kernelManager.isRunning(), false);

      // Should start a new kernel
      await kernelManager.restartKernel();

      assert.strictEqual(
        kernelManager.isRunning(),
        true,
        "Kernel should be running after restart from stopped state"
      );
    });
  });

  describe("Kernel Interrupt", () => {
    it("Should interrupt a running kernel without stopping it", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      // Interrupt the kernel
      kernelManager.interruptKernel();

      // Kernel should still be running after interrupt
      assert.strictEqual(
        kernelManager.isRunning(),
        true,
        "Kernel should still be running after interrupt"
      );
    });

    it("Should handle interrupt when no kernel is running", () => {
      assert.strictEqual(kernelManager.isRunning(), false);

      // Should not throw - just show warning
      kernelManager.interruptKernel();

      assert.strictEqual(kernelManager.isRunning(), false);
    });
  });

  describe("Kernel Lifecycle", () => {
    it("Should handle full lifecycle: start -> stop -> start", async function () {
      this.timeout(testTimeout * 2);

      // First start
      await kernelManager.startKernel();
      assert.strictEqual(kernelManager.isRunning(), true);

      // Stop
      await kernelManager.stopKernel();
      assert.strictEqual(kernelManager.isRunning(), false);

      // Start again
      await kernelManager.startKernel();
      assert.strictEqual(kernelManager.isRunning(), true);
    });

    it("Should handle multiple restarts", async function () {
      this.timeout(testTimeout * 3);

      await kernelManager.startKernel();

      // Restart multiple times
      await kernelManager.restartKernel();
      assert.strictEqual(kernelManager.isRunning(), true);

      await kernelManager.restartKernel();
      assert.strictEqual(kernelManager.isRunning(), true);
    });
  });

  describe("Connection File", () => {
    it("Connection file should be null when kernel not running", () => {
      assert.strictEqual(kernelManager.getConnectionFile(), null);
    });

    it("Connection file should contain valid JSON", async function () {
      this.timeout(testTimeout);

      await kernelManager.startKernel();

      const connectionFile = kernelManager.getConnectionFile();
      assert.ok(connectionFile !== null);

      // Read and parse the connection file
      const content = fs.readFileSync(connectionFile!, "utf-8");
      const connectionInfo = JSON.parse(content);

      // Verify expected fields
      assert.ok("ip" in connectionInfo, "Should have ip field");
      assert.ok("transport" in connectionInfo, "Should have transport field");
      assert.ok("shell_port" in connectionInfo, "Should have shell_port");
      assert.ok("iopub_port" in connectionInfo, "Should have iopub_port");
      assert.ok("stdin_port" in connectionInfo, "Should have stdin_port");
      assert.ok("control_port" in connectionInfo, "Should have control_port");
      assert.ok("hb_port" in connectionInfo, "Should have hb_port");
      assert.ok("key" in connectionInfo, "Should have key");
    });
  });
});
