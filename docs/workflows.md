# Standard Workflows

## Workflow 1: Quick Python Script Execution

Write code, press Shift+Enter to execute each line and advance, view output in Jupyter Output terminal

1. Open a Python file
2. Click status bar → "Start Kernel"
3. Write your code
4. Press `Alt+Enter` to execute each line and advance (if no code is selected, _Run Selection_ uses the current line)
5. View output in **Jupyter Output** terminal

## Workflow 2: Cell-Based Development

Organize code into cells with `# %%` markers, execute cells independently with `Cmd+Alt+C`, results appear in sequence

1. Define cells using `# %%` markers:

   ```python
   # %% Import libraries
   import numpy as np
   import matplotlib.pyplot as plt

   # %% Generate data
   x = np.linspace(0, 10, 100)
   y = np.sin(x)

   # %% Plot
   plt.plot(x, y)
   plt.show()
   ```

2. Press `Cmd+Alt+C` / `Ctrl+Alt+C` to execute current cell
3. Press `Cmd+Alt+Shift+C` / `Ctrl+Alt+Shift+C` to execute and jump to next cell

## Workflow 3: Interactive Debugging

Execute code from editor, then use Jupyter Console for interactive inspection of variables and testing

1. Execute code from your editor
2. Open the terminals panel (if not already open)
3. Switch to **Jupyter Console** terminal
4. Inspect variables interactively:
   ```python
   In [1]: print(x)  # Check variable values
   In [2]: dir()     # List all variables
   In [3]: %whos     # IPython magic to show all variables
   ```
5. Test code snippets before adding to your script

## Workflow 4: Long-Running Code

Start execution, see status bar turn yellow (busy), press Cmd+Alt+I to interrupt if needed

1. Execute long-running code
2. Status bar shows **Busy** state (⟳ yellow)
3. To interrupt: Press `Cmd+Alt+I` / `Ctrl+Alt+I` or click status bar → "Interrupt Kernel"
4. See interrupt message in Jupyter Output
