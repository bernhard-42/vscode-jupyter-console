#!/bin/bash

if [[ "$1" !=  "" ]]; then
  RELEASE=$1
else
  echo "Parameter RELEASE is missing"
  exit 1
fi

rm -f *.vsix
gh release download v$RELEASE --pattern '*.vsix'

if [[ $? != 0 ]]; then
  echo "VSIX download error"
  exit 1
fi

# Publish all platform-specific VSIX files to VS Code Marketplace
# Make sure you're logged in with: vsce login <publisher-name>

vsce verify-pat bernhard-42 -p $VSCODE_TOKEN

if [[ $? != 0 ]]; then
  echo "PAT error"
  exit 1
fi

echo "Publishing vscode-jupyter-console $RELEASE to VS Code Marketplace..."

vsce publish -p $VSCODE_TOKEN --packagePath vscode-jupyter-console-darwin-arm64-$RELEASE.vsix
vsce publish -p $VSCODE_TOKEN --packagePath vscode-jupyter-console-darwin-x64-$RELEASE.vsix
vsce publish -p $VSCODE_TOKEN --packagePath vscode-jupyter-console-linux-arm64-$RELEASE.vsix
vsce publish -p $VSCODE_TOKEN --packagePath vscode-jupyter-console-linux-x64-$RELEASE.vsix
vsce publish -p $VSCODE_TOKEN --packagePath vscode-jupyter-console-win32-x64-$RELEASE.vsix

echo "All platforms published successfully!"
