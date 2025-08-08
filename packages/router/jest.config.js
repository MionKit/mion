/** @type {import('jest').Config} */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: false,
  coverageDirectory: '.coverage',
  collectCoverageFrom: ['src/**'],
  testMatch: ['**/?(*.)+(spec).ts?(x)'],
  moduleNameMapper: {
    '^@mionkit/core/(.*)$': '<rootDir>/../core/src/$1',
    '^@mionkit/run-types/(.*)$': '<rootDir>/../run-types/src/$1',
    '^@mionkit/formats/(.*)$': '<rootDir>/../formats/src/$1',
    '^@mionkit/router/(.*)$': '<rootDir>/../router/src/$1',
    '^@mionkit/(.*)$': '<rootDir>/../$1',
  },
};
