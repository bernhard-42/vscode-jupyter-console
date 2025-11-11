#!/usr/bin/env python
"""
Copyright (c) 2025 Bernhard Walter
SPDX-License-Identifier: MIT

Developed with assistance from Claude Code by Anthropic.
https://claude.ai/claude-code

Kernel Manager Script
Starts a Jupyter kernel using jupyter_client.KernelManager and keeps it alive.
This ensures the kernel uses the current Python environment, not a global kernelspec.

Listens for commands on stdin:
- INTERRUPT: calls km.interrupt_kernel() (cross-platform, including Windows)
- SHUTDOWN: gracefully shuts down the kernel
"""

import argparse
import os
import signal
import sys
import threading
import time

from jupyter_client import KernelManager


def force_kill_kernel(km):
    """
    Force-kill the kernel process at the OS level.
    Works cross-platform: macOS, Linux, and Windows.
    This is necessary for kernels stuck in native code that don't respond to interrupts.
    Silent if kernel is already dead (not an error condition).
    """
    if not hasattr(km, 'kernel') or not km.kernel:
        # Kernel already cleaned up - nothing to do
        return False

    try:
        # Get the kernel process ID
        kernel_pid = km.kernel.pid
        if not kernel_pid:
            # No PID - nothing to kill
            return False

        print(f"Force-killing kernel process {kernel_pid}", flush=True)

        # Cross-platform process killing
        if sys.platform == 'win32':
            # Windows: Use SIGTERM (calls TerminateProcess internally)
            # Note: SIGKILL doesn't exist on Windows
            try:
                os.kill(kernel_pid, signal.SIGTERM)
            except Exception as e:
                print(f"Failed to kill Windows process: {e}", flush=True)
                # Try using taskkill as fallback
                try:
                    import subprocess
                    subprocess.run(['taskkill', '/F', '/PID', str(kernel_pid)],
                                   capture_output=True, timeout=5)
                except Exception as e2:
                    print(f"Taskkill fallback failed: {e2}", flush=True)
        else:
            # Unix (macOS/Linux): Use SIGKILL for immediate termination
            try:
                # Try to kill process group to get any child processes
                os.killpg(os.getpgid(kernel_pid), signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                # Fallback to killing just the process
                try:
                    os.kill(kernel_pid, signal.SIGKILL)
                except ProcessLookupError:
                    # Process already dead
                    pass

        print(f"Successfully killed kernel process {kernel_pid}", flush=True)
        return True

    except Exception as e:
        print(f"FORCE_KILL_ERROR: {e}", flush=True)
        return False


def command_listener(km):
    """
    Listen for commands on stdin and execute them.
    This allows TypeScript to trigger km.interrupt_kernel() which works on Windows.
    """
    try:
        for line in sys.stdin:
            command = line.strip()

            if command == "INTERRUPT":
                print("INTERRUPT_ACK", flush=True)
                try:
                    km.interrupt_kernel()
                except Exception as e:
                    print(f"INTERRUPT_ERROR: {e}", flush=True)
            elif command == "SHUTDOWN":
                print("SHUTDOWN_ACK", flush=True)
                # Force immediate shutdown without graceful shutdown request
                # Using now=True skips sending shutdown_request which can interrupt
                # a kernel that's still starting up (during module imports)
                try:
                    km.shutdown_kernel(now=True)
                except Exception:
                    pass  # Ignore exceptions, force_kill_kernel will handle it

                # Always force-kill to ensure termination
                # force_kill_kernel is silent if nothing to kill (not an error)
                force_kill_kernel(km)
                break
    except Exception:
        # stdin closed or error - this is expected when parent process exits
        pass


def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description="Start and manage a Jupyter kernel")
    parser.add_argument(
        "--cwd",
        type=str,
        default=None,
        help="Working directory for the kernel"
    )
    args = parser.parse_args()

    # Create and start kernel manager
    km = KernelManager()
    km.start_kernel(cwd=args.cwd)

    # Print connection file path to stdout (will be captured by VS Code extension)
    print(km.connection_file, flush=True)

    # Start command listener in background thread
    listener_thread = threading.Thread(target=command_listener, args=(km,), daemon=True)
    listener_thread.start()

    # Keep process alive - wait indefinitely while kernel is running
    try:
        while km.is_alive():
            time.sleep(0.1)
    except KeyboardInterrupt:
        # Clean shutdown on interrupt
        pass
    finally:
        # Always force-kill on exit to ensure termination
        # Silent if kernel is already dead (not an error)
        force_kill_kernel(km)


if __name__ == "__main__":
    main()
