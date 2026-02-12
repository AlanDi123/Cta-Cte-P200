/**
 * Test Setup
 * Global configuration for Jest tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'solverdepos_test';
process.env.REDIS_ENABLED = 'false';
process.env.JWT_SECRET = 'test_secret_key';

// Increase timeout for database operations
jest.setTimeout(10000);

// Mock logger to reduce test output
jest.mock('../utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

global.beforeAll(() => {
  console.log('🧪 Starting test suite...');
});

global.afterAll(() => {
  console.log('✓ Test suite completed');
});
