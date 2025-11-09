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

import sys
import threading
import time

from jupyter_client import KernelManager


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
                km.shutdown_kernel()
                break
    except Exception:
        # stdin closed or error - this is expected when parent process exits
        pass


def main():
    # Create and start kernel manager
    km = KernelManager()
    km.start_kernel()

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
        km.shutdown_kernel()


if __name__ == "__main__":
    main()
