/** @type {import('jest').Config} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  coverageDirectory: '.coverage',
  collectCoverageFrom: ['src/**'],
  testMatch: ['**/?(*.)+(spec).ts?(x)'],
  moduleNameMapper: {'^@mionkit/(.*)$': '<rootDir>/../$1'},
};
