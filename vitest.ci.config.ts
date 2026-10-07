import { defineConfig, mergeConfig } from 'vitest/config';
import type { Reporter } from 'vitest/node';
import base from './vitest.config.ts';

// Local unit-only runs stay convenient; release checks must exercise PostgreSQL.
if (!process.env['TEST_DATABASE_URL']?.trim()) {
  throw new Error('test:ci requires TEST_DATABASE_URL pointing to a disposable PostgreSQL 17+ server. Database tests must not be skipped.');
}

const noSkippedTests: Reporter = {
  onTestRunEnd(modules) {
    const skipped = modules.flatMap((module) =>
      [...module.children.allTests('skipped')].map((test) => `${module.relativeModuleId}: ${test.fullName}`),
    );
    if (skipped.length) {
      console.error(`CI requires every test to run; ${skipped.length} skipped:\n${skipped.join('\n')}`);
      process.exitCode = 1;
    }
  },
};

export default mergeConfig(base, defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    reporters: ['default', noSkippedTests],
  },
}));
