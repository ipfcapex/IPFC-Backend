
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

module.exports = catchAsync;

/**
 * catchAsync Utility
 *
 * This utility function wraps asynchronous Express.js route handlers or middleware
 * to catch any errors that occur during their execution. It converts the promise
 * returned by the handler/middleware into a resolved promise, and any errors are
 * passed to the Express error-handling middleware using the 'next' function.
 *
 * Usage:
 *  - Import this module: const catchAsync = require('./path/to/catchAsync');
 *  - Wrap your async route handlers or middleware: app.get('/example', catchAsync(async (req, res) => { ... }));
 *
 * Example:
 *   const catchAsync = require('./path/to/catchAsync');
 *   const express = require('express');
 *   const app = express();
 *
 *   app.get('/example', catchAsync(async (req, res) => {
 *     // Your asynchronous code here
 *     const result = await someAsyncFunction();
 *     res.json({ result });
 *   }));
 *
 *   // ... other route definitions ...
 *
 *   // Error handling middleware (must be defined after routes)
 *   app.use((err, req, res, next) => {
 *     console.error(err);
 *     res.status(500).send('Internal Server Error');
 *   });
 */