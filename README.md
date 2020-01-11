# Aristeides

Simple command bus pattern implementation for NodeJS.

## How it works

Register command handlers using the `registerCommand` function, de-register them
using the `deregisterCommand` function.

As a convention, all command names must follow the `CONSTANT_CASE` pattern, or
registration will throw an error.

Execute commands by using the `handle` function, which returns a `Promise` that
either resolves with the command's outcome or throws an `Error`.

You can fire-and-forget commands by not waiting on the outcome of the `handle` function.

Interceptors, which are functions that are run before the handling of the command,
can also be registered and de-registered using the `registerInterceptor` and
`deregisterInterceptor` functions.
