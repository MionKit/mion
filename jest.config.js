/** @type {import('jest').Config} */

const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: false,
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  // @see https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/
  moduleNameMapper: {'^@mionkit/(.*)$': '<rootDir>/packages/$1'},
};

module.exports = config;
