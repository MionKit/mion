/** @type {import('jest').Config} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '.coverage',
  collectCoverageFrom: ['lib/**'],
  testMatch: ['**/?(*.)+(spec).ts?(x)'],
  moduleNameMapper: {'^@mionkit/(.*)$': '<rootDir>/../$1'},
};
