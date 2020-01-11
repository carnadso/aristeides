const commandBus = require('../lib');

test('has a handle function', () => {
  expect(typeof commandBus.handle).toBe('function');
});
