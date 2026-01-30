/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  // Run tests from the built .dist folder (compiled JavaScript)
  testMatch: ['<rootDir>/.dist/**/*.spec.js'],
  moduleFileExtensions: ['js', 'json'],
  // No transform needed - we're running compiled JavaScript
  transform: {},
  // Longer timeouts for build tests since they test actual server/client interactions
  testTimeout: 30000,
  // Run tests sequentially to avoid port conflicts
  maxWorkers: 1,
};
