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
  private stdinSocket: zmq.Dealer | null = null;
  private controlSocket: zmq.Dealer | null = null;
  private sessionId: string;
  private isConnected: boolean = false;
  private outputCallbacks: Map<string, (output: string) => void> = new Map();
  private completionCallbacks: Map<string, () => void> = new Map();
  private iopubListenerRunning: boolean = false;
  private iopubListenerPromise: Promise<void> | null = null;
  private stdinListenerRunning: boolean = false;
  private stdinListenerPromise: Promise<void> | null = null;
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
      this.stdinSocket = new zmq.Dealer();
      this.controlSocket = new zmq.Dealer();

      // IMPORTANT: stdin socket must have the same routing ID as shell socket
      // This is required by Jupyter protocol for stdin to work
      const socketIdentity = `client-${this.sessionId}`;
      this.shellSocket.routingId = socketIdentity;
      this.stdinSocket.routingId = socketIdentity;

      Logger.log(`Socket identity set to: ${socketIdentity}`);

      // Connect sockets
      const shellAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.shell_port}`;
      const iopubAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.iopub_port}`;
      const stdinAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.stdin_port}`;
      const controlAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.control_port}`;

      try {
        await this.shellSocket.connect(shellAddr);
        await this.iopubSocket.connect(iopubAddr);
        await this.stdinSocket.connect(stdinAddr);
        await this.controlSocket.connect(controlAddr);
      } catch (error) {
        throw new Error(`Failed to connect to kernel sockets: ${error}`);
      }

      // Subscribe to all messages on iopub
      this.iopubSocket.subscribe();

      this.isConnected = true;

      // Start persistent listeners
      this.startIopubListener();
      this.startStdinListener();

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
      if (this.stdinSocket) {
        try {
          this.stdinSocket.close();
        } catch {
          // Ignore cleanup errors
        }
        this.stdinSocket = null;
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
          , // identities
          , // delimiter
          , // signature
          header,
          parentHeader,
          , // metadata
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

            // Handle output messages if callback registered
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
              }
            }

            // Handle completion (independent of output callback)
            if (
              msgType === "status" &&
              contentObj.execution_state === "idle"
            ) {
              const completionCallback = this.completionCallbacks.get(parentMsgId);
              if (completionCallback) {
                Logger.log("Execution complete, calling completion callback");
                completionCallback();
                this.completionCallbacks.delete(parentMsgId);
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
   * Start persistent listener for stdin messages (input requests)
   */
  private startStdinListener(): void {
    if (this.stdinListenerRunning || !this.stdinSocket) {
      return;
    }

    this.stdinListenerRunning = true;
    Logger.log("Starting stdin listener...");

    const handleMessage = async (msgParts: Buffer[]) => {
      try {
        Logger.log(`Stdin: Received ${msgParts.length} message parts`);

        // Log first few parts to understand structure
        for (let i = 0; i < Math.min(msgParts.length, 3); i++) {
          Logger.log(`  Part ${i}: ${msgParts[i].toString().substring(0, 50)}`);
        }

        // Find delimiter
        const delimiterIdx = msgParts.findIndex(
          (part: Buffer) => part.toString() === "<IDS|MSG>"
        );

        if (delimiterIdx === -1) {
          Logger.log("Stdin: No delimiter found, skipping message");
          return;
        }

        Logger.log(`Stdin: Delimiter found at index ${delimiterIdx}`);

        const header = JSON.parse(msgParts[delimiterIdx + 2].toString());
        const parentHeader = JSON.parse(msgParts[delimiterIdx + 3].toString());
        const metadata = JSON.parse(msgParts[delimiterIdx + 4].toString());
        const content = JSON.parse(msgParts[delimiterIdx + 5].toString());

        const msgType = header.msg_type;
        Logger.log(`Stdin: Received message type: ${msgType}`);

        if (msgType === "input_request") {
          Logger.log("Received input_request from kernel");

          // Get the prompt from the request
          const prompt = content.prompt || "Input:";
          const password = content.password || false;

          let userInput: string | undefined;

          // Check if prompt matches "Select ... from [item1, item2, ...]" pattern
          const selectPattern = /^Select\s+.*\s+from\s+\[(.+)\]\s*$/i;
          const match = prompt.match(selectPattern);

          if (match && !password) {
            // Extract and parse the list items
            const listString = match[1];
            const items = listString.split(",").map((item: string) => item.trim());

            Logger.log(`Detected select prompt with ${items.length} items`);

            // Show temporary status message for selection
            const statusDisposable = vscode.window.setStatusBarMessage(
              "$(list-selection) Select an option from the dropdown",
              10000
            );

            // Show VS Code quick pick (dropdown selector)
            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: prompt,
              ignoreFocusOut: true,
              canPickMany: false,
            });

            statusDisposable.dispose();
            userInput = selected;
          } else {
            // Show temporary status message for text input
            const statusDisposable = vscode.window.setStatusBarMessage(
              "$(keyboard) Input requested - enter value in dialog",
              10000
            );

            // Show VS Code input box (standard text input)
            userInput = await vscode.window.showInputBox({
              prompt: prompt,
              password: password,
              ignoreFocusOut: true,
              placeHolder: "Enter value...",
            });

            statusDisposable.dispose();
          }

          Logger.log(`User input received: ${userInput !== undefined ? "(provided)" : "(cancelled)"}`);

          // Send input_reply back to kernel
          const reply = this.createMessage(
            "input_reply",
            {
              value: userInput || "",
            },
            header
          );

          await this.sendMessage(this.stdinSocket!, reply);
          Logger.log("Sent input_reply to kernel");
        }
      } catch (error: any) {
        Logger.error("Error processing stdin message:", error);
      }
    };

    this.stdinListenerPromise = (async () => {
      if (!this.stdinSocket) return;

      try {
        Logger.log("Stdin listener: entering message loop");
        for await (const msgParts of this.stdinSocket) {
          await handleMessage(msgParts);
        }
        Logger.log("Stdin listener: exited message loop");
      } catch (error) {
        Logger.error("Stdin listener error:", error);
      } finally {
        this.stdinListenerRunning = false;
        this.stdinListenerPromise = null;
        Logger.log("Stdin listener stopped");
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
    this.stdinListenerRunning = false;

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

    if (this.stdinSocket) {
      await this.stdinSocket.close();
      this.stdinSocket = null;
    }

    if (this.controlSocket) {
      await this.controlSocket.close();
      this.controlSocket = null;
    }

    // Wait for listeners to finish processing
    if (this.iopubListenerPromise) {
      await this.iopubListenerPromise;
    }

    if (this.stdinListenerPromise) {
      await this.stdinListenerPromise;
    }

    Logger.log("Disconnected from kernel");
  }
}
