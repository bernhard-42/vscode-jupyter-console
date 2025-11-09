# Contributing

Contributions are welcome! Please feel free to submit issues or pull requests at:
https://github.com/bernhard-42/vscode-jupyter-console

## Building from Source

**For local development:**

```bash
yarn install
yarn compile
```

**For packaging:**

Due to native dependencies (zeromq), platform-specific packages must be built:

```bash
# Build for your current platform
yarn package:mac-arm      # macOS Apple Silicon
yarn package:mac-intel    # macOS Intel
yarn package:linux        # Linux
yarn package:win32        # Windows
```

**For releases:**

Use GitHub Actions to automatically build for all platforms:

1. Push a tag: `git tag v1.0.0 && git push origin v1.0.0`
2. GitHub Actions will build VSIX files for all platforms
3. Download artifacts from the Actions run or GitHub release

See `.github/workflows/build-release.yml` for details.
