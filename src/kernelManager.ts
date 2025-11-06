import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { Logger } from "./logger";
import { getKernelConnectionTimeout, getKernelOperationWait } from "./constants";

export class KernelManager {
  private kernelProcess: cp.ChildProcess | null = null;
  private connectionFile: string | null = null;
  private pythonPath: string;

  constructor(pythonPath?: string) {
    this.pythonPath = pythonPath || "python";
  }

  /**
   * Start a new Jupyter kernel
   */
  async startKernel(): Promise<void> {
    if (this.kernelProcess) {
      vscode.window.showWarningMessage("Kernel is already running");
      return;
    }

    try {
      // Start kernel using jupyter kernel
      const args = ["-m", "jupyter", "kernel", "--kernel=python3"];

      Logger.log(
        `Starting kernel with command: ${this.pythonPath} ${args.join(" ")}`
      );

      this.kernelProcess = cp.spawn(this.pythonPath, args, {
        env: { ...process.env },
        shell: false,
      });

      // Collect stderr for debugging
      let errorOutput = "";
      this.kernelProcess.stderr?.on("data", (data) => {
        errorOutput += data.toString();
        Logger.error("Kernel stderr:", data.toString());
      });

      this.kernelProcess.stdout?.on("data", (data) => {
        Logger.log(`Kernel stdout: ${data.toString()}`);
      });

      // Wait for connection file to be created
      await this.waitForConnectionFile();
    } catch (error) {
      // Clean up on error
      if (this.kernelProcess) {
        this.kernelProcess.kill();
        this.kernelProcess = null;
      }

      vscode.window.showErrorMessage(`Failed to start kernel: ${error}`);
      throw error;
    }
  }

  /**
   * Wait for the kernel connection file to be created
   */
  private async waitForConnectionFile(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (
        !this.kernelProcess ||
        !this.kernelProcess.stdout ||
        !this.kernelProcess.stderr
      ) {
        reject(new Error("Kernel process not initialized properly"));
        return;
      }

      let stdoutBuffer = "";
      let stderrBuffer = "";

      const checkForConnectionFile = (
        buffer: string,
        source: string
      ): boolean => {
        // Look for connection file path in output
        // Matches both:
        // - "Connection file: /path/to/kernel-xxx.json"
        // - "To connect a client: --existing kernel-xxx.json"

        // First try to match the Connection file format
        let match = buffer.match(/Connection file:\s*(\S+\.json)/);
        if (match) {
          this.connectionFile = match[1];
          Logger.log(
            `Found connection file in ${source}: ${this.connectionFile}`
          );
          return true;
        }

        // Try to match the --existing format
        match = buffer.match(/--existing\s+(\S+\.json)/);
        if (match) {
          // If it's just the filename without path, we need to construct the full path
          const filename = match[1];
          if (filename.includes("/")) {
            this.connectionFile = filename;
          } else {
            // Construct full path to runtime directory
            const os = require("os");
            const path = require("path");
            this.connectionFile = path.join(
              os.homedir(),
              "Library",
              "Jupyter",
              "runtime",
              filename
            );
          }
          Logger.log(
            `Found connection file in ${source}: ${this.connectionFile}`
          );
          return true;
        }

        return false;
      };

      const onStdoutData = (data: Buffer) => {
        const text = data.toString();
        stdoutBuffer += text;

        if (checkForConnectionFile(stdoutBuffer, "stdout")) {
          // Clean up listeners
          if (this.kernelProcess?.stdout) {
            this.kernelProcess.stdout.off("data", onStdoutData);
          }
          if (this.kernelProcess?.stderr) {
            this.kernelProcess.stderr.off("data", onStderrData);
          }
          resolve();
        }
      };

      const onStderrData = (data: Buffer) => {
        const text = data.toString();
        stderrBuffer += text;

        if (checkForConnectionFile(stderrBuffer, "stderr")) {
          // Clean up listeners
          if (this.kernelProcess?.stdout) {
            this.kernelProcess.stdout.off("data", onStdoutData);
          }
          if (this.kernelProcess?.stderr) {
            this.kernelProcess.stderr.off("data", onStderrData);
          }
          resolve();
        }
      };

      this.kernelProcess.stdout.on("data", onStdoutData);
      this.kernelProcess.stderr.on("data", onStderrData);

      this.kernelProcess.on("error", (err) => {
        reject(
          new Error(
            `Failed to start kernel process: ${err.message}\nStderr: ${stderrBuffer}`
          )
        );
      });

      this.kernelProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          reject(
            new Error(
              `Kernel process exited with code ${code}.\nStderr: ${stderrBuffer}\nStdout: ${stdoutBuffer}`
            )
          );
        }
      });

      // Timeout after KERNEL_CONNECTION_TIMEOUT
      setTimeout(() => {
        reject(
          new Error(
            `Timeout waiting for kernel to start.\nStderr: ${stderrBuffer}\nStdout: ${stdoutBuffer}`
          )
        );
      }, getKernelConnectionTimeout());
    });
  }

  /**
   * Get the connection file path
   */
  getConnectionFile(): string | null {
    return this.connectionFile;
  }

  /**
   * Interrupt the kernel (send SIGINT)
   */
  interruptKernel(): void {
    if (!this.kernelProcess) {
      vscode.window.showWarningMessage("No kernel is running");
      return;
    }

    if (process.platform === "win32") {
      // Windows doesn't support SIGINT, need to use different approach
      vscode.window.showWarningMessage(
        "Interrupt not fully supported on Windows"
      );
    } else {
      this.kernelProcess.kill("SIGINT");
    }
  }

  /**
   * Stop the kernel
   */
  stopKernel(): void {
    if (!this.kernelProcess) {
      vscode.window.showWarningMessage("No kernel is running");
      return;
    }

    this.kernelProcess.kill();
    this.kernelProcess = null;
    this.connectionFile = null;
  }

  /**
   * Restart the kernel
   */
  async restartKernel(): Promise<void> {
    this.stopKernel();
    await new Promise((resolve) => setTimeout(resolve, getKernelOperationWait())); // Wait for kernel to fully stop
    await this.startKernel();
  }

  /**
   * Check if kernel is running
   */
  isRunning(): boolean {
    return this.kernelProcess !== null;
  }

  /**
   * Get Python path
   */
  getPythonPath(): string {
    return this.pythonPath;
  }

  /**
   * Set Python path
   */
  setPythonPath(pythonPath: string): void {
    this.pythonPath = pythonPath;
  }
}
