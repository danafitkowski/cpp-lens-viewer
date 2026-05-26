import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js', 'tests/shell/**/*.test.js'],
    environmentMatchGlobs: [
      ['tests/shell/**', 'happy-dom']
    ],
    testTimeout: 30000
  }
});
