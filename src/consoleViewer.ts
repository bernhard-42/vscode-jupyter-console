import * as vscode from "vscode";
import * as zmq from "zeromq";
import * as fs from "fs";

interface ConnectionInfo {
  ip: string;
  transport: string;
  iopub_port: number;
  signature_scheme: string;
  key: string;
}

/**
 * Console viewer that subscribes to iopub and displays all outputs
 */
export class ConsoleViewer {
  private iopubSocket: zmq.Subscriber | null = null;
  private connectionInfo: ConnectionInfo | null = null;
  private outputChannel: vscode.OutputChannel;
  private isListening: boolean = false;
  private executionCount: number = 0;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Jupyter Console");
  }

  /**
   * Remove ANSI color codes from text
   */
  private removeAnsiCodes(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  }

  /**
   * Connect to kernel's iopub channel and display all messages
   */
  async connect(connectionFile: string): Promise<void> {
    // Read connection file
    const connectionData = fs.readFileSync(connectionFile, "utf-8");
    this.connectionInfo = JSON.parse(connectionData);

    if (!this.connectionInfo) {
      throw new Error("Failed to parse connection file");
    }

    // Create iopub subscriber
    this.iopubSocket = new zmq.Subscriber();

    const iopubAddr = `${this.connectionInfo.transport}://${this.connectionInfo.ip}:${this.connectionInfo.iopub_port}`;
    await this.iopubSocket.connect(iopubAddr);

    // Subscribe to all messages
    this.iopubSocket.subscribe();

    console.log("Console viewer connected to iopub:", iopubAddr);

    // Start listening
    this.startListening();

    // Show the output channel
    this.outputChannel.show(true);
    this.outputChannel.appendLine("Jupyter Console - Connected to kernel");
    this.outputChannel.appendLine("=".repeat(60));
    this.outputChannel.appendLine("");
  }

  /**
   * Start listening to iopub messages
   */
  private startListening(): void {
    if (this.isListening || !this.iopubSocket) {
      return;
    }

    this.isListening = true;

    (async () => {
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
            const contentObj = JSON.parse(content.toString());
            const msgType = headerObj.msg_type;

            // Display based on message type
            if (msgType === "execute_input") {
              // Show the code being executed
              this.executionCount = contentObj.execution_count;
              const code = contentObj.code;
              const lines = code.split("\n");

              if (lines.length === 1) {
                this.outputChannel.appendLine(
                  `In [${this.executionCount}]: ${lines[0]}`
                );
              } else {
                this.outputChannel.appendLine(
                  `In [${this.executionCount}]: ${lines[0]}`
                );
                for (let i = 1; i < lines.length; i++) {
                  this.outputChannel.appendLine(`   ...: ${lines[i]}`);
                }
              }
              this.outputChannel.appendLine("");
            } else if (msgType === "stream") {
              // stdout/stderr output
              const text = this.removeAnsiCodes(contentObj.text);
              this.outputChannel.append(text);
            } else if (msgType === "execute_result") {
              // Result of expression
              const data = contentObj.data;
              if (data && data["text/plain"]) {
                const result = this.removeAnsiCodes(data["text/plain"]);
                this.outputChannel.appendLine(
                  `Out[${contentObj.execution_count}]: ${result}`
                );
                this.outputChannel.appendLine("");
              }
            } else if (msgType === "display_data") {
              // Display data (plots, images, etc.)
              const data = contentObj.data;
              if (data && data["text/plain"]) {
                const text = this.removeAnsiCodes(data["text/plain"]);
                this.outputChannel.appendLine(text);
                this.outputChannel.appendLine("");
              }
            } else if (msgType === "error") {
              // Error/exception
              this.outputChannel.appendLine(
                `Error: ${contentObj.ename}: ${contentObj.evalue}`
              );
              if (contentObj.traceback && contentObj.traceback.length > 0) {
                // Remove ANSI color codes from traceback
                const traceback = contentObj.traceback.map((line: string) =>
                  this.removeAnsiCodes(line)
                );
                this.outputChannel.appendLine(traceback.join("\n"));
              }
              this.outputChannel.appendLine("");
            } else if (
              msgType === "status" &&
              contentObj.execution_state === "idle"
            ) {
              // Execution complete - ready for next
              // Don't print anything, just note it
            }
          } catch (error) {
            console.error("Error processing console viewer message:", error);
          }
        }
      } catch (error) {
        console.error("Console viewer listener error:", error);
      } finally {
        this.isListening = false;
      }
    })();
  }

  /**
   * Show the console viewer
   */
  show(): void {
    this.outputChannel.show(true);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.iopubSocket !== null && this.isListening;
  }

  /**
   * Disconnect from kernel
   */
  async disconnect(): Promise<void> {
    this.isListening = false;

    if (this.iopubSocket) {
      await this.iopubSocket.close();
      this.iopubSocket = null;
    }

    this.outputChannel.appendLine("");
    this.outputChannel.appendLine("Disconnected from kernel");
    console.log("Console viewer disconnected");
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.iopubSocket) {
      this.iopubSocket.close();
    }
    this.outputChannel.dispose();
  }
}
