/**
 * Copyright (c) 2025 Bernhard Walter
 * SPDX-License-Identifier: MIT
 *
 * Mocha test suite configuration
 */

import * as path from "path";
import Mocha from "mocha";
import { glob } from "glob";

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname, "..");

  // Allow filtering tests via TEST_FILTER environment variable
  // Examples:
  //   TEST_FILTER=unit        → suite/*.test.js (unit tests only)
  //   TEST_FILTER=integration → suite/integration/*.test.js
  //   TEST_FILTER=kernel      → suite/integration/kernelClient.integration.test.js
  const filter = process.env.TEST_FILTER;
  let pattern: string;

  if (filter === "unit") {
    pattern = "suite/*.test.js";
  } else if (filter === "integration") {
    pattern = "suite/integration/*.test.js";
  } else if (filter) {
    // Specific test file (e.g., "kernel" → kernelClient.integration.test.js)
    pattern = `suite/**/*${filter}*.test.js`;
  } else {
    // Default: all tests
    pattern = "suite/**/*.test.js";
  }

  // Find all test files
  const files = await glob(pattern, { cwd: testsRoot });

  if (files.length === 0) {
    console.warn(`No tests found matching pattern: ${pattern}`);
  } else {
    console.log(`Running ${files.length} test file(s) with pattern: ${pattern}`);
  }

  // Add files to the test suite
  files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((c, e) => {
    try {
      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
