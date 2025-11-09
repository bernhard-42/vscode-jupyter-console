# Troubleshooting

## Kernel fails to start

1. **Check Python interpreter is selected:**

   - Command Palette → `Python: Select Interpreter`

2. **Verify Jupyter is installed:**

   ```bash
   python -m jupyter --version
   ```

   If not installed:

   ```bash
   pip install jupyter jupyter-console
   ```

3. **Check Output panel:**
   - View → Output → Select "Jupyter Console" from dropdown

## Code execution hangs

- Press `Cmd+Alt+I` / `Ctrl+Alt+I` to interrupt
- If unresponsive, restart kernel via status bar

## Extension not detecting Python environment

- Ensure Python extension is installed and active
- Reload VS Code window: Command Palette → `Developer: Reload Window`
