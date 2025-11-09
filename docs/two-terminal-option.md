## The two terminal option

It can be selected by checking the Workspace configuration "Jupyter Console: Enable Output Viewer". The extension then creates two dedicated terminals. One as a read-only output window, which shows all input code and outputs of running statements against the started kernel. In case one wants to interactively examine variables or test some code, the second terminal is a standard Jupyter Console, connected to the same kernel. You can see and modify any variables, reset the state without removing imports (huge time saver!), or test some new code.

1. **Jupyter Output Terminal (read only)**

   Displays formatted execution results with input code (green In[n] labels), standard output, and colored error messages. Input code is truncated after 10 lines by default (configurable).

   ![Jupyter Output terminal showing code execution results](images/jupyter-output.png)

   The **Jupyter Output** terminal shows:

   - **Input code** with green `In [n]` labels
   - **Standard output** from your code
   - **Execution results** with red `Out[n]` labels
   - **Errors** with full tracebacks
   - **Success indicators** (green ✓) or **error indicators** (red ✗)

   This terminal connects directly to the kernel's IOPub channel using a Python script (`iopub_viewer.py`) that subscribes to all kernel messages using the Jupyter protocol. This means for example that print statements will be immediately shown.

   - Successful code execution

     ![Jupyter Output terminal showing code execution results](images/jupyter-output-success.png)

   - Failed code execution

     ![Jupyter Output terminal showing code execution results](images/jupyter-output-failure.png)

2. **Jupyter Console Terminal (standard interactive jupyter-console)**

   Traditional jupyter-console interface for interactive debugging and exploration. This console is connected to the same Jupyter kernel and can see and change all variables. Interactive statements will be shown in the "Jupyter Output" window.

   ![Jupyter Console terminal for interactive Python session](images/jupyter-console.png)

   The **Jupyter Console** terminal provides:

   - Interactive Python REPL connected to the same kernel
   - Full IPython features (magic commands, shell access, tab completion)
   - Useful for debugging and interactive exploration

   **To start:** Click the status bar or use the editor menu and select "Start Console Terminals"

**Note:** This setup uses the least screen footage. In case the _Jupyter Console_ shoould be larger, you can increase the panel height (which will decrease the editor height), or use the VS Code features _Move Terminal into Editor Area_ or _Move Terminal into New Window_.

![Relocate Termninals](images/relocate-terminal.png)