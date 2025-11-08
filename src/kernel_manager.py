#!/usr/bin/env python
"""
Copyright (c) 2025 Bernhard Walter
SPDX-License-Identifier: MIT

Developed with assistance from Claude Code by Anthropic.
https://claude.ai/claude-code

Kernel Manager Script
Starts a Jupyter kernel using jupyter_client.KernelManager and keeps it alive.
This ensures the kernel uses the current Python environment, not a global kernelspec.
"""

from jupyter_client import KernelManager
import time


def main():
    # Create and start kernel manager
    km = KernelManager()
    km.start_kernel()

    # Print connection file path to stdout (will be captured by VS Code extension)
    print(km.connection_file, flush=True)

    # Keep process alive - wait indefinitely while kernel is running
    try:
        while km.is_alive():
            time.sleep(1)
    except KeyboardInterrupt:
        # Clean shutdown on interrupt
        km.shutdown_kernel()


if __name__ == "__main__":
    main()
