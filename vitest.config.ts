import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Integration suites each migrate a fresh database on one shared server; migration 0001
    // creates a cluster-wide role, so concurrent migrations on one server race (schema.md §9).
    fileParallelism: false,
  },
});
