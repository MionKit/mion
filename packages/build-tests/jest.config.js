/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  // Longer timeouts for build tests since they test actual server/client interactions
  testTimeout: 30000,
  // Run tests sequentially to avoid port conflicts
  maxWorkers: 1,
  // Coverage configuration
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
  coverageDirectory: '.coverage',
  coverageReporters: ['text', 'lcov'],
};
