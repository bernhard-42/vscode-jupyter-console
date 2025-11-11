/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Developed with assistance from Claude Code by Anthropic.
 * https://claude.ai/claude-code
 */

import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import { Logger } from "./logger";
import {
  getKernelConnectionTimeout,
  getKernelOperationWait,
  getInterruptTimeout,
} from "./constants";
import { promisify } from "util";

const execAsync = promisify(cp.exec);

export class KernelManager {
  private kernelProcess: cp.ChildProcess | null = null;
  private connectionFile: string | null = null;
  private pythonPath: string;
  private interruptTimeoutHandle: NodeJS.Timeout | null = null;
  private statusCheckCallback: (() => boolean) | null = null;

  constructor(pythonPath?: string) {
    this.pythonPath = pythonPath || "python";
  }

  /**
   * Set callback to check if kernel is still busy
   * Returns true if kernel is busy, false if idle
   */
  setStatusCheckCallback(callback: () => boolean): void {
    this.statusCheckCallback = callback;
  }

  /**
   * Check if a Python package is installed
   */
  private async checkPackageInstalled(packageImport: string): Promise<boolean> {
    try {
      await execAsync(`"${this.pythonPath}" -c "import ${packageImport}"`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check for missing required dependencies
   */
  private async checkDependencies(): Promise<string[]> {
    const missing: string[] = [];

    // Check jupyter-console (imports as 'jupyter_console')
    // Note: jupyter-console includes jupyter-client as a dependency
    if (!(await this.checkPackageInstalled("jupyter_console"))) {
      missing.push("jupyter-console");
    }

    return missing;
  }

  /**
   * Prompt user to install missing packages
   */
  private async promptInstallPackages(packages: string[]): Promise<boolean> {
    const packageList = packages.join(", ");
    const message = `Required Python packages are missing: ${packageList}\n\nHow would you like to install them?`;

    const choice = await vscode.window.showErrorMessage(
      message,
      "pip install",
      "uv pip install",
      "uv add",
      "Cancel"
    );

    if (!choice || choice === "Cancel") {
      return false;
    }

    try {
      let command: string;
      if (choice === "pip install") {
        command = `"${this.pythonPath}" -m pip install ${packages.join(" ")}`;
      } else if (choice === "uv pip install") {
        command = `uv pip install --python "${this.pythonPath}" ${packages.join(
          " "
        )}`;
      } else {
        // "uv add"
        command = `uv add --python "${this.pythonPath}" ${packages.join(" ")}`;
      }

      Logger.log(`Installing packages: ${command}`);

      // Get current workspace directory for uv add to find pyproject.toml
      const cwd =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
      Logger.log(`Using working directory: ${cwd}`);

      // Use progress notification that auto-dismisses when done
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Installing ${packageList}...`,
          cancellable: false,
        },
        async (_progress) => {
          const { stdout, stderr } = await execAsync(command, { cwd });
          Logger.log(`Installation output: ${stdout}`);
          if (stderr) {
            Logger.log(`Installation stderr: ${stderr}`);
          }
        }
      );

      // Show success message in status bar after progress notification auto-dismisses
      vscode.window.setStatusBarMessage(
        `$(check) Successfully installed ${packageList}`,
        5000
      );
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Installation failed: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to install packages: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Start a new Jupyter kernel
   */
  async startKernel(): Promise<void> {
    if (this.kernelProcess) {
      vscode.window.showWarningMessage("Kernel is already running");
      return;
    }

    // Check for missing dependencies
    const missingPackages = await this.checkDependencies();
    if (missingPackages.length > 0) {
      const installed = await this.promptInstallPackages(missingPackages);
      if (!installed) {
        throw new Error("Required dependencies not installed");
      }

      // Verify installation succeeded
      const stillMissing = await this.checkDependencies();
      if (stillMissing.length > 0) {
        throw new Error(`Failed to install: ${stillMissing.join(", ")}`);
      }
    }

    try {
      // Start kernel using jupyter_client.KernelManager to use the current Python environment
      // This avoids kernelspec lookup and ensures we use the right kernel
      const kernelManagerScript = path.join(__dirname, "kernel_manager.py");

      // Get the VS Code workspace directory to use as kernel working directory
      const workspaceDir =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

      Logger.log(
        `Starting kernel with command: ${this.pythonPath} -u "${kernelManagerScript}" --cwd "${workspaceDir}"`
      );

      this.kernelProcess = cp.spawn(
        this.pythonPath,
        ["-u", kernelManagerScript, "--cwd", workspaceDir], // -u flag: unbuffered binary stdout and stderr
        {
          env: {
            ...process.env,
            PYTHONUNBUFFERED: "1", // Belt and suspenders: also set env var
          },
          shell: false,
          stdio: ["pipe", "pipe", "pipe"], // Explicitly pipe stdin, stdout, stderr
        }
      );

      // Log stderr for debugging
      this.kernelProcess.stderr?.on("data", (data) => {
        const text = data.toString();

        // Filter out expected shutdown message
        if (!text.includes("Parent appears to have exited, shutting down")) {
          Logger.error("Kernel stderr:", text);
        }
      });

      // Log stdout (connection file, ACKs, etc.)
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
        // KernelManager prints the full path directly, e.g.:
        // /Users/user/Library/Jupyter/runtime/kernel-xxx.json (Unix)
        // C:\Users\user\AppData\Local\Temp\kernel-xxx.json (Windows)

        // Match absolute file paths ending in .json
        // Unix: starts with /
        // Windows: starts with drive letter like C:\
        const match = buffer.match(/((?:\/|[A-Za-z]:\\)[^\s]+\.json)/);
        if (match) {
          this.connectionFile = match[1].trim();
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
          // Check if error is due to missing dependencies
          if (stderrBuffer.includes("ModuleNotFoundError")) {
            if (stderrBuffer.includes("zmq")) {
              reject(
                new Error(
                  `Python package 'pyzmq' is required but not installed.\n\nRestart the kernel to install it automatically.`
                )
              );
            } else if (stderrBuffer.includes("jupyter_console")) {
              reject(
                new Error(
                  `Python package 'jupyter-console' is required but not installed.\n\nRestart the kernel to install it automatically.`
                )
              );
            } else {
              reject(
                new Error(
                  `Kernel process exited with code ${code}.\nStderr: ${stderrBuffer}\nStdout: ${stdoutBuffer}`
                )
              );
            }
          } else {
            reject(
              new Error(
                `Kernel process exited with code ${code}.\nStderr: ${stderrBuffer}\nStdout: ${stdoutBuffer}`
              )
            );
          }
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
   * Interrupt the kernel
   * Sends INTERRUPT command to kernel_manager.py which calls km.interrupt_kernel()
   * This is the "Jupyter way" and works cross-platform including Windows
   *
   * After interrupt, checks if kernel is still busy and notifies user to restart if needed.
   */
  async interruptKernel(): Promise<void> {
    if (!this.kernelProcess || !this.kernelProcess.stdin) {
      vscode.window.showWarningMessage("No kernel is running");
      return;
    }

    try {
      // Clear any existing interrupt timeout
      if (this.interruptTimeoutHandle) {
        clearTimeout(this.interruptTimeoutHandle);
        this.interruptTimeoutHandle = null;
      }

      // Send INTERRUPT command to Python wrapper via stdin
      // The wrapper will call KernelManager.interrupt_kernel() which handles
      // Windows event mechanism and Unix signals appropriately
      this.kernelProcess.stdin.write("INTERRUPT\n");
      Logger.log("Sent INTERRUPT command to kernel manager");

      // Wait a bit, then check if kernel is still busy
      // If so, notify user that they need to restart (kernel stuck in native code)
      const timeout = getInterruptTimeout();
      this.interruptTimeoutHandle = setTimeout(() => {
        this.checkKernelStillBusy();
      }, timeout);

      Logger.log(
        `Will check kernel status in ${timeout}ms to see if interrupt worked`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to send interrupt command: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to interrupt kernel: ${errorMsg}`);
    }
  }

  /**
   * Check if kernel is still busy after interrupt
   * If so, notify user to restart the kernel
   */
  private checkKernelStillBusy(): void {
    if (!this.statusCheckCallback) {
      Logger.error(
        "No status check callback set, cannot check if kernel is busy"
      );
      return;
    }

    const isBusy = this.statusCheckCallback();
    if (isBusy) {
      Logger.error(
        "Kernel is still busy after interrupt - likely stuck in native code"
      );
      vscode.window
        .showErrorMessage(
          "Kernel did not respond to interrupt (likely stuck in native code). You can continue waiting or restart the kernel.",
          "Restart Kernel"
        )
        .then((choice) => {
          if (choice === "Restart Kernel") {
            // Execute the full restart command which handles cleanup and reconnection
            vscode.commands.executeCommand("jupyterConsole.restartKernel");
          }
        });
    } else {
      Logger.log("Kernel responded to interrupt successfully");
    }
  }

  /**
   * Cancel interrupt timeout check (called when execution completes normally)
   */
  cancelInterruptTimeout(): void {
    if (this.interruptTimeoutHandle) {
      clearTimeout(this.interruptTimeoutHandle);
      this.interruptTimeoutHandle = null;
      Logger.log("Interrupt check cancelled - execution completed normally");
    }
  }

  /**
   * Stop the kernel
   * Always uses force shutdown to ensure clean termination
   * Kills both the Python wrapper and the kernel process (cross-platform)
   * Returns a promise that resolves when the process is confirmed dead
   */
  async stopKernel(): Promise<void> {
    if (!this.kernelProcess) {
      vscode.window.showWarningMessage("No kernel is running");
      return;
    }

    const processToKill = this.kernelProcess;
    const pid = processToKill.pid;

    // Send SHUTDOWN command for clean shutdown
    // The Python wrapper will force-kill the kernel process at OS level
    if (processToKill.stdin) {
      try {
        processToKill.stdin.write("SHUTDOWN\n");
        Logger.log("Sent SHUTDOWN command to kernel manager");
      } catch (error) {
        Logger.error(`Failed to send shutdown command: ${error}`);
      }
    }

    // Wait for process to exit, with timeout
    const exitPromise = new Promise<void>((resolve) => {
      processToKill.once("exit", () => {
        Logger.log(`Kernel process ${pid} exited`);
        resolve();
      });
    });

    // Staged shutdown approach with two timeouts:
    const SIGTERM_DELAY_MS = 2000; // Time to wait before sending SIGTERM
    const MAX_WAIT_MS = 5000; // Maximum time to wait before giving up

    // Schedule SIGTERM as a "nudge" if process doesn't exit quickly
    const killTimeout = setTimeout(() => {
      if (processToKill && !processToKill.killed) {
        // Kill the wrapper process itself
        // Node.js handles platform differences: SIGTERM on Unix, TerminateProcess on Windows
        try {
          processToKill.kill("SIGTERM");
          Logger.log("Sent SIGTERM to kernel manager wrapper process");
        } catch (error) {
          Logger.error(`Failed to kill wrapper process: ${error}`);
        }
      }
    }, SIGTERM_DELAY_MS);

    // Maximum wait timeout - give up if process still hasn't exited
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        Logger.log(
          `Kernel stop timeout reached (${MAX_WAIT_MS}ms), continuing anyway`
        );
        resolve();
      }, MAX_WAIT_MS);
    });

    // Wait for process to exit or timeout
    await Promise.race([exitPromise, timeoutPromise]);

    // Clean up the SIGTERM timer if still pending
    clearTimeout(killTimeout);

    this.kernelProcess = null;
    this.connectionFile = null;

    // Cancel any pending interrupt check
    if (this.interruptTimeoutHandle) {
      clearTimeout(this.interruptTimeoutHandle);
      this.interruptTimeoutHandle = null;
    }

    Logger.log("stopKernel completed");
  }

  /**
   * Restart the kernel
   * Always uses force shutdown to ensure clean termination
   */
  async restartKernel(): Promise<void> {
    await this.stopKernel(); // Now waits for process to actually exit
    await new Promise((resolve) =>
      setTimeout(resolve, getKernelOperationWait())
    ); // Additional buffer for cleanup
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
