#!/usr/bin/env python3
"""
Jupyter iopub Viewer - Displays all kernel outputs with colors
Connects to a Jupyter kernel's iopub channel and displays all outputs.

Copyright (c) 2025 Bernhard Walter
SPDX-License-Identifier: MIT

Developed with assistance from Claude Code by Anthropic.
https://claude.ai/claude-code
"""

import sys
import json
import zmq


def green(text):
    """Green text for success/input"""
    return f"\033[32m{text}\033[0m"


def red(text):
    """Red text for errors/output labels"""
    return f"\033[31m{text}\033[0m"


def dim(text):
    """Dimmed/gray text for truncation notices"""
    return f"\033[2m{text}\033[0m"


def main():
    if len(sys.argv) < 2:
        print("Usage: iopub_viewer.py <connection_file> [max_input_lines]")
        sys.exit(1)

    connection_file = sys.argv[1]
    # Get max input lines from argument, default to 10
    max_input_lines = int(sys.argv[2]) if len(sys.argv) > 2 else 10

    # Read connection file
    try:
        with open(connection_file, "r") as f:
            conn_info = json.load(f)
    except Exception as e:
        print(f"Error reading connection file: {e}")
        sys.exit(1)

    # Extract connection info
    ip = conn_info["ip"]
    transport = conn_info["transport"]
    iopub_port = conn_info["iopub_port"]
    key = conn_info["key"].encode("utf-8")
    signature_scheme = conn_info.get("signature_scheme", "hmac-sha256")

    # Create ZMQ context and socket
    context = zmq.Context()
    iopub_socket = context.socket(zmq.SUB)

    # Connect to iopub
    iopub_addr = f"{transport}://{ip}:{iopub_port}"
    iopub_socket.connect(iopub_addr)

    # Subscribe to all messages
    iopub_socket.subscribe(b"")

    print("=" * 70)
    print("Jupyter Output Viewer (READ ONLY) - Connected to kernel")
    print("To interact with the kernel, select the 'Jupyter Console` terminal")
    print("=" * 70)
    print()
    sys.stdout.flush()

    # Track execution state for status icons
    is_executing = False
    execution_had_error = False

    # Listen for messages
    try:
        while True:
            # Receive message
            msg_parts = iopub_socket.recv_multipart()

            # Parse message parts
            # Format: [identities..., delimiter, signature, header, parent_header, metadata, content]
            delimiter_idx = msg_parts.index(b"<IDS|MSG>")

            signature = msg_parts[delimiter_idx + 1]
            header = json.loads(msg_parts[delimiter_idx + 2].decode("utf-8"))
            parent_header = json.loads(msg_parts[delimiter_idx + 3].decode("utf-8"))
            metadata = json.loads(msg_parts[delimiter_idx + 4].decode("utf-8"))
            content = json.loads(msg_parts[delimiter_idx + 5].decode("utf-8"))

            msg_type = header.get("msg_type", "")

            # Display based on message type
            if msg_type == "execute_input":
                # Show the code being executed
                execution_count = content.get("execution_count", "?")
                code = content.get("code", "")
                lines = code.split("\n")

                # Green color for "In [...]"
                in_label = green(f"In [{execution_count}]")

                if len(lines) == 1:
                    print(f"{in_label}: {lines[0]}")
                elif max_input_lines == 0 or len(lines) <= max_input_lines:
                    # Show all lines if no limit or within limit
                    print(f"{in_label}: {lines[0]}")
                    for line in lines[1:]:
                        print(f"   ...: {line}")
                else:
                    # Truncate input code if too long
                    print(f"{in_label}: {lines[0]}")
                    for line in lines[1:max_input_lines]:
                        print(f"   ...: {line}")
                    # Show how many lines were truncated
                    remaining = len(lines) - max_input_lines
                    print(dim(f"   ...: [+ {remaining} lines]"))

                # Reset execution tracking
                is_executing = True
                execution_had_error = False
                sys.stdout.flush()

            elif msg_type == "stream":
                # stdout/stderr output - keep ANSI colors
                text = content.get("text", "")
                print(text, end="")
                sys.stdout.flush()

            elif msg_type == "execute_result":
                # Result of expression - keep ANSI colors
                execution_count = content.get("execution_count", "?")
                data = content.get("data", {})
                if "text/plain" in data:
                    result = data["text/plain"]
                    # Red color for "Out[...]"
                    out_label = red(f"Out[{execution_count}]")
                    print(f"{out_label}: {result}")
                    print()
                    sys.stdout.flush()

            elif msg_type == "display_data":
                # Display data - keep ANSI colors
                data = content.get("data", {})
                if "text/plain" in data:
                    print(data["text/plain"])
                    print()
                    sys.stdout.flush()

            elif msg_type == "error":
                # Error/exception - ANSI colors for traceback (red, etc.)
                ename = content.get("ename", "Error")
                evalue = content.get("evalue", "")
                traceback = content.get("traceback", [])

                print(f"\n{ename}: {evalue}")
                if traceback:
                    for line in traceback:
                        # Keep ANSI color codes for colorful error display
                        print(line)
                print()

                # Show red X for errors (especially for interrupts that arrive after green checkmark)
                print(red("✗"))
                print()

                # Mark that this execution had an error
                execution_had_error = True
                sys.stdout.flush()

            elif msg_type == "status":
                # Handle status messages to show success/error icons
                execution_state = content.get("execution_state", "")
                if execution_state == "idle" and is_executing:
                    # Execution completed - show status icon
                    if execution_had_error:
                        # Red X for error
                        print(red("✗"))
                    else:
                        # Green checkmark for success
                        print(green("✓"))
                    print()
                    is_executing = False
                    execution_had_error = False
                    sys.stdout.flush()

    except KeyboardInterrupt:
        print("\niopub viewer stopped")
    except Exception as e:
        print(f"\nError: {e}")
    finally:
        iopub_socket.close()
        context.term()


if __name__ == "__main__":
    main()
