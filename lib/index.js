const constantCase = require('constant-case');
const mapSeries = require('promise-map-series');
const debug = require('debug')('aristeides');

/**
 * A dictionary of registered command handlers
 * @type {Object.<string, function(string, object, object)>}
 */
const commandHandlers = {};

/**
 * An array of async functions that are executed on the command bus
 * before the command is passed to the handler ; these can modify
 * both the context and the payload and in case any of them returns
 * "false", then the command execution is aborted.
 * @type {Array.<function(string, object, object)>}
 */
const interceptorFunctions = [];

/**
 * Handles a command asynchronously
 * @param command the command name
 * @param context the context in which the command executes (should be removed)
 * @param payload the "value bag" for the command
 * @returns {Promise.<{ result: <*>, error: Error }>}
 */
async function handle(command, context = {}, payload = {}) {
  function handleCommandOnNextTick(handler) {
    let resolver;

    const p = new Promise((resP) => {
      resolver = resP;
    });

    process.nextTick(async () => {
      try {
        const result = await handler.handle(context || {}, payload, { handle });
        return resolver({ result, error: null });
      } catch (err) {
        return resolver({ result: null, error: err });
      }
    });

    return p;
  }

  if (typeof commandHandlers[command] !== 'object') {
    return Promise.reject(new Error(`Unknown command: ${command}`));
  }

  try {
    // For now, load the command handlers on-demand
    // eslint-disable-next-line global-require,import/no-dynamic-require
    const commandHandler = commandHandlers[command];
    if (!commandHandler) {
      return Promise.reject(new Error(`Command handler not loaded for command: ${command}`));
    }
    debug(`Handling command ${command}`);
    try {
      // First run the interceptors in order, stopping if any of them returns "false"
      let interceptorCanceledCommandExecution = false;
      await mapSeries(interceptorFunctions, async (interceptorFn) => {
        const shouldContinue = await interceptorFn(command, context, payload);
        if (shouldContinue === false) {
          interceptorCanceledCommandExecution = true;
          return Promise.reject(new Error('Interceptor canceled command execution'));
        }
        return Promise.resolve();
      }).catch((err) => {
        if (!interceptorCanceledCommandExecution) {
          return Promise.reject(err);
        }
        return Promise.resolve(false);
      });

      if (interceptorCanceledCommandExecution) {
        return Promise.resolve({
          result: null,
          error: new Error('Interceptor canceled command execution'),
        });
      }

      // If no context is provided, send an empty object since destructuring will occur
      const { result, error } = await handleCommandOnNextTick(commandHandler);
      if (error) {
        debug(`Handling of command ${command} failed with error %o`, error);
      }

      return Promise.resolve({ result, error });
    } catch (err) {
      debug(`Handling of command ${command} failed WITH EXCEPTION; this should not have happened, considering command contract. Exception details: %o`, err);
      return Promise.reject(err);
    }
  } catch (err) {
    debug(`Error logged in command ${command}: %o`, err);
    return Promise.reject(new Error(`Command handler could not be loaded for command: ${command}`));
  }
}

/**
 * Registers a command with a name and a handler
 * @param name the command name ; it should not already have been registered
 * @param handler the command handler async function
 */
function registerCommand(name, handler) {
  if (typeof commandHandlers[name] !== 'undefined') {
    throw new Error(`Command already registered: ${name}`);
  }
  if (typeof handler !== 'object') {
    throw new Error(`Invalid handler: ${name}`);
  }
  if (typeof handler.handle !== 'function') {
    throw new Error(`Invalid handler function: ${name}`);
  }
  if (constantCase(name) !== name) {
    throw new Error(`Invalid command name: ${name}`);
  }
  commandHandlers[name] = handler;
  debug(`Successfully registered command ${name}`);
}

/**
 * De-registers a command
 * @param name the command name ; it should already be registered
 */
function deregisterCommand(name) {
  if (!commandHandlers[name]) {
    throw new Error(`Command not registered: ${name}`);
  }

  delete commandHandlers[name];
}

/**
 * Registers an async interceptor function that will be executed for
 * each command and is passed the parameters (command name, context, payload).
 *
 * In case the return value of the function is "false", then the command
 * execution is canceled.
 * @param interceptorFn
 */
function registerInterceptor(interceptorFn) {
  interceptorFunctions.push(interceptorFn);
}

/**
 * De-registers an interceptor function
 * @param interceptorFn the interceptor function to remove
 * @return {boolean} "true" if the function was found and removed
 */
function deregisterInterceptor(interceptorFn) {
  const indexOf = interceptorFunctions.indexOf(interceptorFn);
  if (indexOf > -1) {
    interceptorFunctions.splice(indexOf, 1);
    return true;
  }

  return false;
}

module.exports = {
  handle,
  registerInterceptor,
  deregisterInterceptor,
  registerCommand,
  deregisterCommand,
};
