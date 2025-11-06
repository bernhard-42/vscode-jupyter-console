import * as vscode from "vscode";
import { KernelManager } from "./kernelManager";
import { ConsoleManager } from "./consoleManager";
import { CodeExecutor } from "./codeExecutor";
import { StatusBarManager, KernelState } from "./statusBarManager";
import { KernelClient } from "./kernelClient";
import { Logger } from "./logger";

let kernelManager: KernelManager;
let consoleManager: ConsoleManager;
let codeExecutor: CodeExecutor;
let statusBarManager: StatusBarManager;
let kernelClient: KernelClient | null = null;

/**
 * Connect kernel client and set up terminals
 */
async function connectKernelClient(): Promise<void> {
  const connectionFile = kernelManager.getConnectionFile();
  if (!connectionFile) {
    throw new Error("Connection file not available");
  }

  kernelClient = new KernelClient();
  await kernelClient.connect(connectionFile);
  codeExecutor.setKernelClient(kernelClient);

  // Set up status callback to update status bar during execution
  kernelClient.setStatusCallback((state) => {
    if (state === "busy") {
      statusBarManager.setState(KernelState.Busy);
    } else if (state === "idle") {
      statusBarManager.setState(KernelState.Running);
    }
  });

  Logger.log("Kernel client connected");

  // Automatically start terminals (iopub viewer + jupyter console)
  await consoleManager.startConsole();
}

/**
 * Cleanup: disconnect kernel client and close terminals
 */
async function cleanupKernelClient(): Promise<void> {
  // Close terminals
  consoleManager.closeConsole();

  // Disconnect kernel client
  if (kernelClient) {
    await kernelClient.disconnect();
    kernelClient = null;
    codeExecutor.setKernelClient(null);
  }
}

/**
 * Get the active Python interpreter path
 */
async function getPythonPath(): Promise<string> {
  try {
    // Try to use the Python extension's API
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");

    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }

      const pythonApi = pythonExtension.exports;

      // Get active environment for current workspace
      if (pythonApi && pythonApi.environments) {
        const activeEnv = pythonApi.environments.getActiveEnvironmentPath();
        if (activeEnv && activeEnv.path) {
          return activeEnv.path;
        }
      }
    }

    // Fallback: try to get from settings
    const config = vscode.workspace.getConfiguration("python");
    const defaultPath = config.get<string>("defaultInterpreterPath");
    if (defaultPath) {
      return defaultPath;
    }

    // Last resort: use 'python' from PATH
    return "python3";
  } catch (error) {
    Logger.error("Error getting Python path:", error);
    return "python3";
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Initialize logger first
  try {
    Logger.initialize();
    Logger.log("=== ACTIVATION START ===");
    Logger.log("Starting activation...");
  } catch (e) {
    console.error("Failed to initialize logger:", e);
  }

  try {
    // Initialize managers with a default python path
    Logger.log("Initializing managers...");
    kernelManager = new KernelManager("python3");
    Logger.log("✓ KernelManager created");

    consoleManager = new ConsoleManager(kernelManager, context.extensionPath);
    Logger.log("✓ ConsoleManager created");

    codeExecutor = new CodeExecutor(consoleManager);
    Logger.log("✓ CodeExecutor created");

    statusBarManager = new StatusBarManager(kernelManager);
    Logger.log("✓ StatusBarManager created");

    // Detect and set Python environment on activation
    Logger.log("Detecting Python environment...");
    const pythonPath = await getPythonPath();
    Logger.log(`Python path detected: ${pythonPath}`);
    statusBarManager.setPythonEnv(pythonPath);
    Logger.log("✓ Python environment set in status bar");

    // Register status bar
    context.subscriptions.push(statusBarManager);
    Logger.log("✓ Status bar registered");

    // Register status bar action command
    Logger.log("Registering statusBarAction command...");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.statusBarAction",
        async () => {
          if (kernelManager.isRunning()) {
            // Kernel is running -> Interrupt it
            Logger.log("Status bar clicked: Interrupting kernel");
            await vscode.commands.executeCommand("jupyterConsole.interruptKernel");
          } else {
            // Kernel is stopped -> Start it
            Logger.log("Status bar clicked: Starting kernel");
            await vscode.commands.executeCommand("jupyterConsole.startKernel");
          }
        }
      )
    );
    Logger.log("✓ statusBarAction command registered");

    // Register commands
    Logger.log("Registering kernel commands...");
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.startKernel",
        async () => {
          try {
            // Get the current Python interpreter before starting
            const pythonPath = await getPythonPath();
            kernelManager.setPythonPath(pythonPath);
            statusBarManager.setPythonEnv(pythonPath);

            statusBarManager.setState(KernelState.Starting);

            await kernelManager.startKernel();
            await connectKernelClient();

            statusBarManager.setState(KernelState.Running);
          } catch (error) {
            statusBarManager.setState(KernelState.Stopped);
            vscode.window.showErrorMessage(`Failed to start kernel: ${error}`);
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.stopKernel", async () => {
        try {
          await cleanupKernelClient();
          kernelManager.stopKernel();
          statusBarManager.setState(KernelState.Stopped);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to stop kernel: ${error}`);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.restartKernel",
        async () => {
          try {
            await cleanupKernelClient();

            // Get the current Python interpreter before restarting
            const pythonPath = await getPythonPath();
            kernelManager.setPythonPath(pythonPath);
            statusBarManager.setPythonEnv(pythonPath);

            statusBarManager.setState(KernelState.Starting);
            await kernelManager.restartKernel();
            await connectKernelClient();

            statusBarManager.setState(KernelState.Running);
          } catch (error) {
            statusBarManager.setState(KernelState.Stopped);
            vscode.window.showErrorMessage(
              `Failed to restart kernel: ${error}`
            );
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.interruptKernel", async () => {
        try {
          if (kernelClient && kernelClient.isKernelConnected()) {
            // Use proper Jupyter protocol interrupt via control channel
            await kernelClient.interrupt();
            Logger.log("Kernel interrupted via control channel");
          } else {
            // Fallback to process signal (less reliable)
            kernelManager.interruptKernel();
          }
          // Return to running state after interrupt
          statusBarManager.setState(KernelState.Running);
        } catch (error) {
          Logger.error("Failed to interrupt kernel:", error);
          vscode.window.showErrorMessage(`Failed to interrupt kernel: ${error}`);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.startConsole",
        async () => {
          try {
            await consoleManager.startConsole();
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to start console: ${error}`);
          }
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.runLine", () => {
        codeExecutor.runLine();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.runLineAndAdvance",
        () => {
          codeExecutor.runLineAndAdvance();
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.runSelection", () => {
        codeExecutor.runSelection();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        "jupyterConsole.runSelectionAndAdvance",
        () => {
          codeExecutor.runSelectionAndAdvance();
        }
      )
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.runCell", () => {
        codeExecutor.runCell();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand("jupyterConsole.runCellAndAdvance", () => {
        codeExecutor.runCellAndAdvance();
      })
    );

    // Listen for Python interpreter changes
    Logger.log("Setting up Python interpreter change listener...");
    const pythonExtension = vscode.extensions.getExtension("ms-python.python");
    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        await pythonExtension.activate();
      }

      const pythonApi = pythonExtension.exports;
      if (pythonApi && pythonApi.environments) {
        // Listen for environment changes
        context.subscriptions.push(
          pythonApi.environments.onDidChangeActiveEnvironmentPath(async (e: any) => {
            Logger.log("Python interpreter changed!");
            Logger.log(`New interpreter path: ${e.path}`);

            // Clean up without confirmation
            await cleanupKernelClient();
            Logger.log("✓ Terminals closed and kernel client disconnected");

            // Stop kernel process
            if (kernelManager && kernelManager.isRunning()) {
              kernelManager.stopKernel();
              Logger.log("✓ Kernel stopped");
            }

            // 4. Update kernel manager with new Python path
            const newPythonPath = e.path;
            kernelManager.setPythonPath(newPythonPath);
            Logger.log(`✓ Kernel manager updated with new path: ${newPythonPath}`);

            // 5. Update status bar
            statusBarManager.setPythonEnv(newPythonPath);
            statusBarManager.setState(KernelState.Stopped);
            Logger.log("✓ Status bar updated");

            // Show temporary status message that vanishes after 3 seconds
            vscode.window.setStatusBarMessage(
              "$(notebook-kernel-select) Python interpreter changed. Kernel stopped.",
              3000
            );
          })
        );
        Logger.log("✓ Python interpreter change listener registered");
      }
    }

    Logger.log("✓ Activation complete - all commands registered");
    Logger.log("Kernel actions button registered in editor/title");
    Logger.log(`Button should appear when: editorLangId == python`);
  } catch (error) {
    Logger.error("Activation failed", error);
    vscode.window.showErrorMessage(
      `Failed to activate Jupyter Console extension: ${error}`
    );
    throw error;
  }
}

export async function deactivate() {
  Logger.log("Deactivating extension...");

  // Clean up
  if (kernelClient) {
    await kernelClient.disconnect();
    kernelClient = null;
  }

  if (consoleManager) {
    consoleManager.dispose();
  }

  if (kernelManager && kernelManager.isRunning()) {
    kernelManager.stopKernel();
  }

  Logger.log("Deactivation complete");
  Logger.dispose();
}
