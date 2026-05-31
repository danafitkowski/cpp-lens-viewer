import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/shell/**/*.test.js', 'tests/sections/**/*.test.js', 'tests/perf/**/*.test.js'],
    environmentMatchGlobs: [
      ['tests/shell/**', 'happy-dom'],
      ['tests/sections/**', 'happy-dom'],
      ['tests/perf/**', 'happy-dom']
    ],
    testTimeout: 30000
  }
});
