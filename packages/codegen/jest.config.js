module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: '.coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '^@mionkit/(.*)$': '<rootDir>/../$1',
  },
};
