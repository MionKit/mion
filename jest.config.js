/** @type {import('jest').Config} */

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: false,
  // jest only runs .spec.ts files, test.ts are reserved for bun test
  testMatch: ['**/?(*.)+(spec).ts?(x)'],
  // @see https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/
  moduleNameMapper: {'^@mionkit/(.*)$': '<rootDir>/packages/$1'},
};

module.exports = config;
