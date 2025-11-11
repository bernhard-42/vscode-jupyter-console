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
} from "./constants";
import { promisify } from "util";

const execAsync = promisify(cp.exec);

export class KernelManager {
  private kernelProcess: cp.ChildProcess | null = null;
  private connectionFile: string | null = null;
  private pythonPath: string;

  constructor(pythonPath?: string) {
    this.pythonPath = pythonPath || "python";
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
   */
  async interruptKernel(): Promise<void> {
    if (!this.kernelProcess || !this.kernelProcess.stdin) {
      vscode.window.showWarningMessage("No kernel is running");
      return;
    }

    try {
      // Send INTERRUPT command to Python wrapper via stdin
      // The wrapper will call KernelManager.interrupt_kernel() which handles
      // Windows event mechanism and Unix signals appropriately
      this.kernelProcess.stdin.write("INTERRUPT\n");
      Logger.log("Sent INTERRUPT command to kernel manager");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      Logger.error(`Failed to send interrupt command: ${errorMsg}`);
      vscode.window.showErrorMessage(`Failed to interrupt kernel: ${errorMsg}`);
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
    await new Promise((resolve) =>
      setTimeout(resolve, getKernelOperationWait())
    ); // Wait for kernel to fully stop
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
