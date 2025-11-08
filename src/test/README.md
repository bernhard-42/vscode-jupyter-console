# VS Code Jupyter Console - Test Suite

## Overview

This directory contains the unit test suite for the VS Code Jupyter Console extension.

## Test Framework

- **Test Runner**: Mocha
- **Assertions**: Node.js built-in `assert`
- **VS Code Testing**: `@vscode/test-electron`
- **Mocking**: Sinon (available but not heavily used yet)

## Running Tests

```bash
# Run all tests
yarn test

# Compile only
yarn compile

# Lint only
yarn lint
```

## Test Structure

```
src/test/
├── runTest.ts              # Test runner entry point
├── suite/
│   ├── index.ts            # Mocha suite configuration
│   ├── cellDetector.test.ts   # Cell detection and parsing tests
│   ├── constants.test.ts      # Configuration constants tests
│   ├── logger.test.ts         # Logging functionality tests
│   └── statusBarManager.test.ts # Status bar state tests
└── README.md               # This file
```

## Test Coverage

### Current Coverage

| Module | Type | Tests | Description |
|--------|------|-------|-------------|
| **CellDetector** | Unit | 9 | Cell boundary detection, code extraction, edge cases |
| **CellDetector** | Integration | 11 | Real document APIs, cursor movement, selection |
| **Configuration** | Integration | 15 | Settings read/write, validation |
| **Commands** | Integration | 8 | Command registration verification |
| **Constants** | Unit | 6 | Configuration value validation, range checking |
| **Logger** | Unit | 7 | Logging initialization, message formatting |
| **StatusBarManager** | Unit | 4 | Kernel state enum validation |
| **Total** | | **~60** | |

### Modules Tested

✅ **CellDetector** - Comprehensive tests for:
- Finding cell boundaries with `# %%` markers
- Extracting cell code at specific lines
- Handling edge cases (empty documents, no markers)
- Code trimming and formatting

✅ **Constants** - Tests for:
- All timeout getter functions
- Default value validation
- Range validation (non-negative, reasonable bounds)

✅ **Logger** - Tests for:
- Initialization behavior
- Auto-initialization on first use
- Log and error methods
- Error handling with error objects

✅ **StatusBarManager** - Tests for:
- KernelState enum values
- State uniqueness and format

### Modules Not Yet Tested

The following modules have heavy external dependencies and would benefit from integration tests rather than unit tests:

- **KernelManager** - Requires Python process, file system
- **KernelClient** - Requires ZMQ sockets, Jupyter kernel
- **ConsoleManager** - Requires VS Code terminals
- **CodeExecutor** - Depends on KernelClient and ConsoleManager
- **PythonIntegration** - Depends on Python extension API
- **Commands** - Depends on VS Code command infrastructure

## Writing New Tests

### Basic Test Structure

```typescript
import * as assert from "assert";
import { ModuleToTest } from "../../moduleToTest";

suite("Module Name Test Suite", () => {
  test("should do something", () => {
    // Arrange
    const input = "test";

    // Act
    const result = ModuleToTest.someFunction(input);

    // Assert
    assert.strictEqual(result, "expected");
  });
});
```

### Best Practices

1. **Use descriptive test names** - Test names should clearly describe what is being tested
2. **Follow AAA pattern** - Arrange, Act, Assert
3. **Test edge cases** - Empty inputs, boundary values, error conditions
4. **Keep tests isolated** - Each test should be independent
5. **Use strict assertions** - Prefer `strictEqual` over `equal`

## CI/CD Integration

The test suite is integrated into the build process:

```json
{
  "scripts": {
    "pretest": "yarn compile && yarn lint",
    "test": "node ./out/test/runTest.js"
  }
}
```

Tests run automatically before publishing via `vscode:prepublish`.

## Future Improvements

1. **Increase coverage** - Add integration tests for complex modules
2. **Add performance tests** - Test execution time for critical paths
3. **Mock external dependencies** - Use Sinon for better isolation
4. **Add test fixtures** - Create reusable test data
5. **Code coverage reporting** - Integrate Istanbul/nyc
6. **Continuous integration** - Run tests on PR/push via GitHub Actions

## Troubleshooting

### Tests fail with "Cannot find module"
- Run `yarn compile` to ensure TypeScript is compiled
- Check that `tsconfig.json` includes test files

### Tests timeout
- Increase timeout in `src/test/suite/index.ts`
- Check for infinite loops or blocking operations

### VS Code API not available
- Ensure you're using `@vscode/test-electron`
- Check that test runner is properly configured in `runTest.ts`

## Resources

- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Mocha Documentation](https://mochajs.org/)
- [Node.js Assert Documentation](https://nodejs.org/api/assert.html)
