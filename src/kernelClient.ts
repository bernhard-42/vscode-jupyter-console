/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import * as zmq from "zeromq";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import * as fs from "fs";
import { Logger } from "./logger";
import { getCodeExecutionTimeout } from "./constants";

interface ConnectionInfo {
  ip: string;
  transport: string;
  shell_port: number;
  iopub_port: number;
  stdin_port: number;
  control_port: number;
  hb_port: number;
  signature_scheme: string;
  key: string;
}

interface JupyterMessage {
  header: {
    msg_id: string;
    username: string;
    session: string;
    msg_type: string;
    version: string;
    date: string;
  };
  parent_header: any;
  metadata: any;
  content: any;
}

export class KernelClient {
  private connectionInfo: ConnectionInfo | null = null;
  private shellSocket: zmq.Dealer | null = null;
  private iopubSocket: zmq.Subscriber | null = null;
  private controlSocket: zmq.Dealer | null = null;
  private sessionId: string;
  private isConnected: boolean = false;
  private outputCallbacks: Map<string, (output: string) => void> = new Map();
  private completionCallbacks: Map<string, () => void> = new Map();
  private iopubListenerRunning: boolean = false;
  private iopubListenerPromise: Promise<void> | null = null;
  private statusCallback: ((state: "busy" | "idle") => void) | null = null;

  constructor() {
    this.sessionId = uuidv4();
  }

  /**
   * Set callback for kernel status changes
   */
  setStatusCallback(callback: (state: "busy" | "idle") => void): void {
    this.statusCallback = callback;
  }

  /**
   * Validate connection info has all required fields
   */
  private validateConnectionInfo(info: any): void {
    const requiredFields = [
      "ip",
      "transport",
      "shell_port",
      "iopub_port",
      "stdin_port",
      "control_port",
      "hb_port",
      "signature_scheme",
      "key",
    ];

    const missingFields = requiredFields.filter((field) => !(field in info));

    if (missingFields.length > 0) {
      throw new Error(
        `Connection file is missing required fields: ${missingFields.join(", ")}`
      );
    }

    // Validate port numbers are valid
    const portFields = [
      "shell_port",
      "iopub_port",
      "stdin_port",
      "control_port",
      "hb_port",
    ];
    for (const field of portFields) {
      const port = info[field];
      if (typeof port !== "number" || port < 1 || port > 65535) {
        throw new Error(`Invalid port number for ${field}: ${port}`);
      }
    }
  }

  /**
   * Connect to a kernel using its connection file
   */
  async connect(connectionFile: string): Promise<void> {
    try {
      // Read connection file
      let connectionData: string;
      try {
        connectionData = fs.readFileSync(connectionFile, "utf-8");
      } catch (error) {
        throw new Error(`Failed to read connection file: ${error}`);
      }

      // Parse connection file
      try {
        this.connectionInfo = JSON.parse(connectionData);
      } catch (error) {
        throw new Error(`Failed to parse connection file JSON: ${error}`);
      }

      if (!this.connectionInfo) {
        throw new Error("Connection info is null after parsing");
      }

      // Validate connection info has all required fields
      this.validateConnectionInfo(this.connectionInfo);

      // Create ZMQ sockets
      this.shellSocket = new zmq.Dealer();
      this.iopubSocket = new zmq.Subscriber();
      this.controlSocket = new zmq.Dealer();

      // Connect sockets
      const shellAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.shell_port}`;
      const iopubAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.iopub_port}`;
      const controlAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.control_port}`;

      try {
        await this.shellSocket.connect(shellAddr);
        await this.iopubSocket.connect(iopubAddr);
        await this.controlSocket.connect(controlAddr);
      } catch (error) {
        throw new Error(`Failed to connect to kernel sockets: ${error}`);
      }

      // Subscribe to all messages on iopub
      this.iopubSocket.subscribe();

      this.isConnected = true;

      // Start persistent iopub listener
      this.startIopubListener();

      Logger.log(`Connected to kernel: ${shellAddr}`);
    } catch (error) {
      // Clean up sockets on error
      if (this.shellSocket) {
        try {
          this.shellSocket.close();
        } catch {
          // Ignore cleanup errors
        }
        this.shellSocket = null;
      }
      if (this.iopubSocket) {
        try {
          this.iopubSocket.close();
        } catch {
          // Ignore cleanup errors
        }
        this.iopubSocket = null;
      }
      if (this.controlSocket) {
        try {
          this.controlSocket.close();
        } catch {
          // Ignore cleanup errors
        }
        this.controlSocket = null;
      }
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Start persistent listener for iopub messages
   */
  private startIopubListener(): void {
    if (this.iopubListenerRunning || !this.iopubSocket) {
      return;
    }

    this.iopubListenerRunning = true;

    // Store the listener promise so we can wait for it to complete on disconnect
    this.iopubListenerPromise = (async () => {
      if (!this.iopubSocket) return;

      try {
        for await (const [
          identities,
          delimiter,
          signature,
          header,
          parentHeader,
          metadata,
          content,
        ] of this.iopubSocket) {
          try {
            const headerObj = JSON.parse(header.toString());
            const parentHeaderObj = JSON.parse(parentHeader.toString());
            const contentObj = JSON.parse(content.toString());
            const msgType = headerObj.msg_type;

            // Handle status messages for UI feedback (all status messages, not just for specific executions)
            if (msgType === "status" && this.statusCallback) {
              const executionState = contentObj.execution_state;
              if (executionState === "busy" || executionState === "idle") {
                this.statusCallback(executionState);
              }
            }

            // Find the callback for this message's parent
            const parentMsgId = parentHeaderObj.msg_id;
            const callback = this.outputCallbacks.get(parentMsgId);

            if (callback) {
              Logger.log(`Received message type: ${msgType}`);

              // Handle different output types
              if (msgType === "stream") {
                callback(contentObj.text);
              } else if (
                msgType === "execute_result" ||
                msgType === "display_data"
              ) {
                if (contentObj.data && contentObj.data["text/plain"]) {
                  callback(contentObj.data["text/plain"] + "\n");
                }
              } else if (msgType === "error") {
                const traceback = contentObj.traceback
                  ? contentObj.traceback.join("\n")
                  : "";
                callback(
                  `Error: ${contentObj.ename}: ${contentObj.evalue}\n${traceback}\n`
                );
              } else if (
                msgType === "status" &&
                contentObj.execution_state === "idle"
              ) {
                // Execution complete - call completion callback and clean up
                Logger.log("Execution complete, calling completion callback");
                const completionCallback = this.completionCallbacks.get(parentMsgId);
                if (completionCallback) {
                  completionCallback();
                  this.completionCallbacks.delete(parentMsgId);
                }
                this.outputCallbacks.delete(parentMsgId);
              }
            }
          } catch (error) {
            Logger.error("Error processing iopub message:", error);
          }
        }
      } catch (error) {
        Logger.error("Iopub listener error:", error);
      } finally {
        this.iopubListenerRunning = false;
        this.iopubListenerPromise = null;
      }
    })();
  }

  /**
   * Sign a message using HMAC
   */
  private signMessage(msg: JupyterMessage): string {
    if (!this.connectionInfo) {
      return "";
    }

    const hmac = crypto.createHmac(
      this.connectionInfo.signature_scheme.replace("hmac-", ""),
      this.connectionInfo.key
    );

    hmac.update(JSON.stringify(msg.header));
    hmac.update(JSON.stringify(msg.parent_header));
    hmac.update(JSON.stringify(msg.metadata));
    hmac.update(JSON.stringify(msg.content));

    return hmac.digest("hex");
  }

  /**
   * Create a Jupyter message
   */
  private createMessage(
    msgType: string,
    content: any,
    parentHeader: any = {}
  ): JupyterMessage {
    return {
      header: {
        msg_id: uuidv4(),
        username: "vscode-jupyter-console",
        session: this.sessionId,
        msg_type: msgType,
        version: "5.3",
        date: new Date().toISOString(),
      },
      parent_header: parentHeader,
      metadata: {},
      content: content,
    };
  }

  /**
   * Send a message to the kernel
   */
  private async sendMessage(
    socket: zmq.Dealer,
    msg: JupyterMessage
  ): Promise<void> {
    const signature = this.signMessage(msg);

    // Jupyter wire protocol: [delimiter, signature, header, parent_header, metadata, content]
    await socket.send([
      Buffer.from("<IDS|MSG>"),
      Buffer.from(signature),
      Buffer.from(JSON.stringify(msg.header)),
      Buffer.from(JSON.stringify(msg.parent_header)),
      Buffer.from(JSON.stringify(msg.metadata)),
      Buffer.from(JSON.stringify(msg.content)),
    ]);
  }

  /**
   * Execute code on the kernel
   */
  async executeCode(
    code: string,
    onOutput?: (output: string) => void
  ): Promise<void> {
    if (!this.shellSocket || !this.connectionInfo) {
      throw new Error("Not connected to kernel");
    }

    // Get configuration to determine silent mode
    const config = vscode.workspace.getConfiguration("jupyterConsole");
    const enableOutputViewer = config.get<boolean>("enableOutputViewer", false);

    // silent: true for single terminal (no output viewer)
    // silent: false for two terminals (with output viewer)
    const silent = !enableOutputViewer;

    const msg = this.createMessage("execute_request", {
      code: code,
      silent: silent,
      store_history: false,
      user_expressions: {},
      allow_stdin: true,
      stop_on_error: false,
    });

    // Create a promise that resolves when execution completes
    return new Promise<void>((resolve, reject) => {
      // Register output callback if provided
      if (onOutput) {
        this.outputCallbacks.set(msg.header.msg_id, onOutput);
      }

      // Register completion callback
      const completionCallback = () => {
        Logger.log("Received completion signal, resolving promise");
        resolve();
      };
      this.completionCallbacks.set(msg.header.msg_id, completionCallback);

      // Send execute request
      Logger.log(`Registering callbacks for msg_id: ${msg.header.msg_id}`);
      Logger.log("Sending execute request to kernel");
      this.sendMessage(this.shellSocket!, msg).catch(reject);

      // Timeout after CODE_EXECUTION_TIMEOUT
      setTimeout(() => {
        if (this.completionCallbacks.has(msg.header.msg_id)) {
          Logger.log("Execution timeout - no completion received");
          this.outputCallbacks.delete(msg.header.msg_id);
          this.completionCallbacks.delete(msg.header.msg_id);
          reject(new Error("Execution timeout"));
        }
      }, getCodeExecutionTimeout());
    });
  }

  /**
   * Interrupt the kernel execution
   */
  async interrupt(): Promise<void> {
    if (!this.controlSocket || !this.connectionInfo) {
      throw new Error("Not connected to kernel");
    }

    const msg = this.createMessage("interrupt_request", {});

    Logger.log("Sending interrupt request to kernel");
    await this.sendMessage(this.controlSocket, msg);
  }

  /**
   * Check if connected
   */
  isKernelConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Disconnect from kernel
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.iopubListenerRunning = false;

    // Clear all callbacks
    this.outputCallbacks.clear();
    this.completionCallbacks.clear();

    // Close sockets to break the listener loop
    if (this.shellSocket) {
      await this.shellSocket.close();
      this.shellSocket = null;
    }

    if (this.iopubSocket) {
      await this.iopubSocket.close();
      this.iopubSocket = null;
    }

    if (this.controlSocket) {
      await this.controlSocket.close();
      this.controlSocket = null;
    }

    // Wait for iopub listener to finish processing
    if (this.iopubListenerPromise) {
      await this.iopubListenerPromise;
    }

    Logger.log("Disconnected from kernel");
  }
}
