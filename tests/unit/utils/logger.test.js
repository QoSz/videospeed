/**
 * Unit tests for Logger
 * Tests the logging singleton at window.VSC.logger
 */

import { installChromeMock, cleanupChromeMock, resetMockStorage } from '../../helpers/chrome-mock.js';
import { SimpleTestRunner, assert, createMockDOM } from '../../helpers/test-utils.js';
import { loadMinimalModules } from '../../helpers/module-loader.js';

await loadMinimalModules();

const runner = new SimpleTestRunner();
let mockDOM;
let originalConsoleLog;
let consoleLogCalls;
let savedVerbosity;
let savedContextStack;

runner.beforeEach(() => {
  installChromeMock();
  resetMockStorage();
  mockDOM = createMockDOM();

  // Save logger state before each test
  savedVerbosity = window.VSC.logger.verbosity;
  savedContextStack = [...window.VSC.logger.contextStack];

  // Spy on console.log
  originalConsoleLog = console.log;
  consoleLogCalls = [];
  console.log = (...args) => {
    consoleLogCalls.push(args);
  };
});

runner.afterEach(() => {
  cleanupChromeMock();
  if (mockDOM) mockDOM.cleanup();

  // Restore console.log
  console.log = originalConsoleLog;

  // Restore logger state
  window.VSC.logger.verbosity = savedVerbosity;
  window.VSC.logger.contextStack = savedContextStack;
});

runner.test('Logger initializes with default verbosity 3', () => {
  // Restore original verbosity to check the default
  // The logger was created with verbosity 3 in its constructor
  // We saved it in beforeEach, so check the saved value
  assert.equal(savedVerbosity, 3, 'Default verbosity should be 3');
});

runner.test('Logger.setVerbosity updates verbosity level', () => {
  window.VSC.logger.setVerbosity(5);
  assert.equal(window.VSC.logger.verbosity, 5, 'Verbosity should be updated to 5');
});

runner.test('Logger.error logs when verbosity >= 1', () => {
  window.VSC.logger.setVerbosity(1);
  window.VSC.logger.error('test error message');

  assert.greaterThan(consoleLogCalls.length, 0, 'console.log should have been called');
  const logOutput = consoleLogCalls[0][0];
  assert.true(logOutput.includes('test error message'), 'Output should contain the error message');
});

runner.test('Logger.debug does not log when verbosity < 4', () => {
  window.VSC.logger.setVerbosity(3);
  window.VSC.logger.debug('hidden debug message');

  assert.equal(consoleLogCalls.length, 0, 'console.log should not have been called');
});

runner.test('Logger.debug logs when verbosity >= 4', () => {
  window.VSC.logger.setVerbosity(4);
  window.VSC.logger.debug('visible debug message');

  assert.greaterThan(consoleLogCalls.length, 0, 'console.log should have been called');
  const logOutput = consoleLogCalls[0][0];
  assert.true(
    logOutput.includes('visible debug message'),
    'Output should contain the debug message'
  );
});

runner.test('Logger.pushContext adds context to log messages', () => {
  window.VSC.logger.setVerbosity(1);
  window.VSC.logger.pushContext('V1');
  window.VSC.logger.error('context test');

  assert.greaterThan(consoleLogCalls.length, 0, 'console.log should have been called');
  const logOutput = consoleLogCalls[0][0];
  assert.true(logOutput.includes('[V1]'), 'Output should include context [V1]');
});

runner.test('Logger.popContext removes context from stack', () => {
  window.VSC.logger.pushContext('V1');
  assert.equal(window.VSC.logger.contextStack.length, 1, 'Stack should have one entry');

  window.VSC.logger.popContext();
  assert.equal(window.VSC.logger.contextStack.length, 0, 'Stack should be empty after pop');

  const context = window.VSC.logger.generateContext();
  assert.equal(context, '', 'generateContext should return empty string');
});

runner.test('Logger.withContext adds and removes context around function', () => {
  window.VSC.logger.setVerbosity(1);

  let contextDuringExec = '';
  window.VSC.logger.withContext('V2', () => {
    contextDuringExec = window.VSC.logger.generateContext();
  });

  assert.equal(contextDuringExec, '[V2] ', 'Context should be set during function execution');
  assert.equal(
    window.VSC.logger.contextStack.length,
    0,
    'Context stack should be empty after withContext'
  );
});

runner.test('Logger.withContext removes context even when function throws', () => {
  window.VSC.logger.setVerbosity(1);

  let threw = false;
  try {
    window.VSC.logger.withContext('V3', () => {
      throw new Error('intentional error');
    });
  } catch (_e) {
    threw = true;
  }

  assert.true(threw, 'Function should have thrown');
  assert.equal(
    window.VSC.logger.contextStack.length,
    0,
    'Context stack should be empty even after throw'
  );
});

runner.test('Logger.formatVideoId returns V? for null video', () => {
  const result = window.VSC.logger.formatVideoId(null);
  assert.equal(result, 'V?', 'Should return V? for null video');
});

export { runner as loggerTestRunner };
