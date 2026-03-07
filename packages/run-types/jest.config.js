/** @type {import('jest').Config} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '.coverage',
  collectCoverageFrom: ['src/**'],
  testMatch: ['**/?(*.)+(spec).ts?(x)'],
  modulePathIgnorePatterns: ['xyz-Template'],
  moduleNameMapper: {'^@mionjs/(.*)$': '<rootDir>/../$1'},
};
