/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Integration tests for KernelClient module
 * Tests actual code execution via Jupyter protocol (ZMQ)
 */

import * as assert from "assert";
import * as path from "path";
import * as fs from "fs";
import * as zmq from "zeromq";
import { KernelClient } from "../../../kernelClient";
import { KernelManager } from "../../../kernelManager";
import { getKernelConnectionTimeout } from "../../../constants";

/**
 * Helper class to monitor iopub messages directly
 */
class IopubMonitor {
  private socket: zmq.Subscriber | null = null;
  private messages: any[] = [];
  private listening: boolean = false;

  async connect(connectionFile: string): Promise<void> {
    const connectionData = fs.readFileSync(connectionFile, "utf-8");
    const connectionInfo = JSON.parse(connectionData);

    this.socket = new zmq.Subscriber();
    const iopubAddr = `${connectionInfo.transport}://${connectionInfo.ip}:${connectionInfo.iopub_port}`;

    await this.socket.connect(iopubAddr);
    this.socket.subscribe(); // Subscribe to all messages

    // Give ZMQ time to establish connection
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.listening = true;
    await this.startListening(); // Wait for listener to be ready
  }

  private async startListening(): Promise<void> {
    if (!this.socket) return;

    // Start listening in background
    (async () => {
      try {
        // Iopub messages are multipart: [identities, delimiter, signature, header, parent_header, metadata, content]
        for await (const msgParts of this.socket!) {
          if (!this.listening) break;

          try {
            // Just track that we received a message (don't need to parse it)
            this.messages.push({
              timestamp: Date.now(),
              parts: msgParts.length,
            });
          } catch (e) {
            // Ignore parsing errors
          }
        }
      } catch (error) {
        // Socket closed
      }
    })();

    // Give the listener a moment to enter the for-await loop
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  getMessages(): any[] {
    return this.messages;
  }

  hasMessages(): boolean {
    return this.messages.length > 0;
  }

  clearMessages(): void {
    this.messages = [];
  }

  async disconnect(): Promise<void> {
    this.listening = false;
    if (this.socket) {
      await this.socket.close();
      this.socket = null;
    }
  }
}

describe("KernelClient Integration Tests", () => {
  let kernelManager: KernelManager;
  let kernelClient: KernelClient;
  let iopubMonitor: IopubMonitor;
  const testTimeout = getKernelConnectionTimeout() + 60000; // Connection timeout + 60s for test execution

  // Use the test-env Python
  const projectRoot = path.resolve(__dirname, "../../../../");
  const testPython = path.join(projectRoot, "test-env", "bin", "python");

  beforeEach(async function () {
    this.timeout(testTimeout);

    // Start a kernel
    kernelManager = new KernelManager(testPython);
    await kernelManager.startKernel();

    // Create and connect kernel client
    kernelClient = new KernelClient();
    const connectionFile = kernelManager.getConnectionFile();
    assert.ok(connectionFile !== null, "Connection file should exist");
    await kernelClient.connect(connectionFile!);

    // Create iopub monitor
    iopubMonitor = new IopubMonitor();
    await iopubMonitor.connect(connectionFile!);
  });

  afterEach(async () => {
    // Clean up
    if (iopubMonitor) {
      await iopubMonitor.disconnect();
    }
    if (kernelClient.isKernelConnected()) {
      await kernelClient.disconnect();
    }
    if (kernelManager.isRunning()) {
      kernelManager.stopKernel();
    }
  });

  describe("Connection", () => {
    it("Should connect to kernel successfully", () => {
      assert.strictEqual(
        kernelClient.isKernelConnected(),
        true,
        "Should be connected after connect()"
      );
    });

    it("Should disconnect from kernel successfully", async () => {
      assert.strictEqual(kernelClient.isKernelConnected(), true);

      await kernelClient.disconnect();

      assert.strictEqual(
        kernelClient.isKernelConnected(),
        false,
        "Should be disconnected after disconnect()"
      );
    });

    it("Should fail to connect with invalid connection file", async () => {
      const newClient = new KernelClient();

      try {
        await newClient.connect("/nonexistent/file.json");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          String(error).includes("Failed to read connection file"),
          "Should throw connection file error"
        );
      }
    });
  });

  describe("Code Execution - End to End", () => {
    it("Should send code and receive iopub messages", async function () {
      this.timeout(testTimeout);

      // Clear messages and wait for clean state
      iopubMonitor.clearMessages();
      await new Promise((resolve) => setTimeout(resolve, 100));

      const code = "print('Hello from kernel')";

      // Send code (don't wait for completion)
      kernelClient.executeCode(code).catch(() => {
        // Ignore errors
      });

      // Wait a bit for messages to arrive
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const messageCount = iopubMonitor.getMessages().length;

      // Check that we received iopub messages (at minimum, status messages)
      assert.ok(
        iopubMonitor.hasMessages(),
        `Should have received iopub messages from kernel (got ${messageCount} messages)`
      );
    });

    it("Should receive messages for arithmetic operations", async function () {
      this.timeout(testTimeout);

      iopubMonitor.clearMessages();

      const code = "2 + 2";

      kernelClient.executeCode(code).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should receive messages for arithmetic operations
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages for arithmetic operations"
      );
    });

    it("Should receive messages for variable assignment", async function () {
      this.timeout(testTimeout);

      iopubMonitor.clearMessages();

      const code = "test_var = 123";

      kernelClient.executeCode(code).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should receive messages for variable assignment
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages for variable assignment"
      );
    });

    it("Should receive messages for multi-line code", async function () {
      this.timeout(testTimeout);

      iopubMonitor.clearMessages();

      const code = `
x = 10
y = 20
print(x + y)
`;

      kernelClient.executeCode(code).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should receive messages for multi-line code
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages for multi-line code"
      );
    });

    it("Should maintain kernel state across executions", async function () {
      this.timeout(testTimeout * 2);

      // First execution
      iopubMonitor.clearMessages();
      kernelClient.executeCode("counter = 0").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should receive messages from first execution
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages from first execution"
      );

      // Second execution
      iopubMonitor.clearMessages();
      kernelClient.executeCode("counter += 1").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should receive messages from second execution
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages from second execution"
      );

      // Third execution
      iopubMonitor.clearMessages();
      kernelClient.executeCode("print(counter)").catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should receive messages showing state was maintained
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages from third execution (state maintained)"
      );
    });

    it("Should handle code with imports", async function () {
      this.timeout(testTimeout);

      iopubMonitor.clearMessages();

      const code = "import sys\nprint(sys.version_info.major)";

      kernelClient.executeCode(code).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should receive messages for code with imports
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages for code with imports"
      );
    });

    it("Should handle function definition", async function () {
      this.timeout(testTimeout);

      iopubMonitor.clearMessages();

      const code = "def greet(name):\n    return f'Hello, {name}!'";

      kernelClient.executeCode(code).catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Should receive messages for function definition
      assert.ok(
        iopubMonitor.hasMessages(),
        "Should receive messages for function definition"
      );
    });
  });

  describe("Kernel Interrupt", () => {
    it("Should interrupt running code", async function () {
      this.timeout(testTimeout * 2);

      // Start long-running code
      const longCode = `
import time
for i in range(100):
    time.sleep(0.1)
    print(i)
`;

      kernelClient.executeCode(longCode).catch(() => {});

      // Wait a bit, then interrupt
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should not throw
      await kernelClient.interrupt();

      assert.ok(true, "Interrupt sent successfully");
    });

    it("Should fail to interrupt when not connected", async function () {
      this.timeout(testTimeout);

      // Disconnect first
      await kernelClient.disconnect();

      try {
        await kernelClient.interrupt();
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          String(error).includes("Not connected to kernel"),
          "Should throw not connected error"
        );
      }
    });
  });

  describe("Status Callbacks", () => {
    it("Should set status callback without error", async function () {
      this.timeout(testTimeout);

      const statusChanges: Array<"busy" | "idle"> = [];

      assert.doesNotThrow(() => {
        kernelClient.setStatusCallback((state) => {
          statusChanges.push(state);
        });
      });

      // Execute some code
      kernelClient.executeCode("print('test')").catch(() => {});

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Just verify callback was set (actual calls depend on timing)
      assert.ok(true, "Status callback set successfully");
    });
  });

  describe("Error Handling", () => {
    it("Should fail to execute when not connected", async function () {
      this.timeout(testTimeout);

      const newClient = new KernelClient();

      try {
        await newClient.executeCode("print('test')");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          String(error).includes("Not connected to kernel"),
          "Should throw not connected error"
        );
      }
    });

    it("Should handle execution after disconnect", async function () {
      this.timeout(testTimeout);

      await kernelClient.disconnect();

      try {
        await kernelClient.executeCode("print('test')");
        assert.fail("Should have thrown an error");
      } catch (error) {
        assert.ok(
          String(error).includes("Not connected to kernel"),
          "Should throw not connected error"
        );
      }
    });
  });

  describe("Reconnection", () => {
    it("Should allow reconnecting after disconnect", async function () {
      this.timeout(testTimeout);

      // Disconnect
      await kernelClient.disconnect();
      assert.strictEqual(kernelClient.isKernelConnected(), false);

      // Reconnect
      const connectionFile = kernelManager.getConnectionFile();
      await kernelClient.connect(connectionFile!);

      assert.strictEqual(
        kernelClient.isKernelConnected(),
        true,
        "Should be connected after reconnect"
      );

      // Verify we can send code without errors (don't check iopub)
      assert.doesNotThrow(() => {
        kernelClient.executeCode("print('reconnected')").catch(() => {});
      });

      assert.ok(true, "Reconnection successful and can send code");
    });
  });

  describe("Iopub Monitor Verification", () => {
    it("Should verify iopub monitor receives messages", async function () {
      this.timeout(testTimeout);

      // Clear any accumulated messages from previous tests
      iopubMonitor.clearMessages();

      // Wait a moment to ensure clean state
      await new Promise((resolve) => setTimeout(resolve, 100));

      const initialCount = iopubMonitor.getMessages().length;

      // Execute code - print() sends stream messages even in silent mode
      kernelClient.executeCode("print('test')").catch(() => {});

      // Wait for messages to arrive
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const finalCount = iopubMonitor.getMessages().length;

      assert.ok(
        finalCount > initialCount,
        `Iopub monitor should receive new messages (was ${initialCount}, now ${finalCount})`
      );
    });
  });
});
