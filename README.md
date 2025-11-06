# Jupyter Console VS Code Extension

A VS Code extension that integrates Jupyter kernels with a console interface for interactive Python development.

## Features

- **Status Bar Integration**: Visual indicator showing kernel state with quick actions
- **Direct Jupyter Protocol**: Fast code execution via ZMQ messaging (no terminal copy/paste)
- **Output Channel**: Dedicated output panel showing execution results
- Start a Jupyter kernel from your current Python environment
- Interrupt and restart the kernel
- Optional Jupyter console terminal for interactive debugging
- Execute Python code directly from your editor with keyboard shortcuts
- Support for cell-based editing using `# %%` markers

### Status Bar

The extension adds a status bar item (right side) that shows:
- **$(circle-slash) Python** - Kernel stopped (click to start)
- **$(loading~spin) envname** (yellow) - Kernel starting...
- **$(pass) envname** (green) - Kernel running (click for actions)

Click the status bar to open a quick action menu with all kernel controls.

## Prerequisites

- Python 3.x installed
- VS Code Python extension installed (`ms-python.python`)
- Jupyter installed in your Python environment:
  ```bash
  pip install jupyter jupyter-console
  ```
- A Python interpreter selected in VS Code (use `Python: Select Interpreter` command)

## Usage

### Quick Start with Status Bar

1. Open a Python file in VS Code
2. **Click the status bar item** (shows "$(circle-slash) Python" on the right)
3. Select "Start Kernel" from the menu
4. Start writing code and press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Windows/Linux) to execute
5. View output in the **Jupyter Output** channel

### Optional: Start Console Terminal

- For interactive debugging, click the status bar and select "Start Console"
- This opens a traditional Jupyter console in the terminal

### Alternative: Using Command Palette

1. Open a Python file in VS Code
2. Press Cmd/Ctrl+Shift+P
3. Run "Jupyter Console: Start Kernel"
4. Execute code using keyboard shortcuts

### Keyboard Shortcuts

When editing Python files, you can use these keyboard shortcuts:

| Command | Windows/Linux | macOS | Description |
|---------|--------------|-------|-------------|
| Run Current Line | `Ctrl+Enter` | `Cmd+Enter` | Execute current line, keep cursor position |
| Run Line and Advance | `Shift+Enter` | `Shift+Enter` | Execute current line, move to next line |
| Run Selection | `Ctrl+Alt+Enter` | `Cmd+Alt+Enter` | Execute selected code, keep cursor position |
| Run Selection and Advance | `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` | Execute selected code, move cursor after selection |
| Run Cell | `Ctrl+Alt+C` | `Cmd+Alt+C` | Execute code in current cell (between `# %%` markers) |
| Interrupt Kernel | `Ctrl+Alt+I` | `Cmd+Alt+I` | Send interrupt signal to kernel |

### Cell Markers

Use `# %%` to define cells in your Python files:

```python
# %% Cell 1
import numpy as np
import matplotlib.pyplot as plt

# %% Cell 2
x = np.linspace(0, 10, 100)
y = np.sin(x)

# %% Cell 3
plt.plot(x, y)
plt.show()
```

## Commands

All commands are available via the Command Palette (Cmd/Ctrl+Shift+P):

- `Jupyter Console: Show Quick Actions` - Open quick action menu (same as clicking status bar)
- `Jupyter Console: Start Kernel` - Start a new Jupyter kernel
- `Jupyter Console: Stop Kernel` - Stop the running kernel
- `Jupyter Console: Restart Kernel` - Restart the current kernel
- `Jupyter Console: Interrupt Kernel` - Interrupt the current kernel execution
- `Jupyter Console: Start Console` - Open Jupyter console terminal
- `Jupyter Console: Run Current Line` - Execute the current line
- `Jupyter Console: Run Current Line and Advance` - Execute line and move to next
- `Jupyter Console: Run Selection` - Execute selected code
- `Jupyter Console: Run Selection and Advance` - Execute selection and advance cursor
- `Jupyter Console: Run Cell` - Execute current cell

## Development

### Building the Extension

1. Install dependencies:
   ```bash
   npm install
   ```

2. Compile TypeScript:
   ```bash
   npm run compile
   ```

3. Run the extension in debug mode:
   - Press F5 in VS Code
   - This opens a new VS Code window with the extension loaded

### Testing

Open a Python file and try the various commands and keyboard shortcuts.

## Troubleshooting

If the kernel fails to start:

1. **Check Python interpreter**: Make sure you have a Python interpreter selected in VS Code (`Python: Select Interpreter`)
2. **Verify Jupyter installation**: Run `python -m jupyter --version` in terminal
3. **Install Jupyter if missing**: `pip install jupyter jupyter-console`
4. **Check Debug Console**: When running in debug mode (F5), check the Debug Console for detailed error messages
5. **See TROUBLESHOOTING.md** for more detailed help

The extension will show you which Python interpreter it's using when you start the kernel.

## Known Limitations

- Kernel interrupt (SIGINT) may not work fully on Windows
- The extension uses the Python interpreter selected in VS Code
- Requires the Python extension for VS Code to be installed and active

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT
