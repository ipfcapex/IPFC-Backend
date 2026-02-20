const dotenv = require('dotenv');
const { app } = require('./app'); // <-- destructure app from object

dotenv.config();

const PORT = process.env.PORT || 5000;

let server;

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] ', err);
  process.exit(1);
});

(async () => {
  try {
    server = app.listen(PORT, () => {
      console.log(`[SERVER] Running on port ${PORT}`);
    });
  } catch (err) {
    console.error('[SERVER STARTUP ERROR]', err);
    process.exit(1);
  }
})();

process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
  if (server) {
    server.close(() => {
      console.log('[SERVER] Server closed due to unhandled promise rejection');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});






// const dotenv = require('dotenv');
// const app = require('./app');

// dotenv.config();

// const PORT = process.env.PORT || 5000;

// let server;

// process.on('uncaughtException', (err) => {
//   console.error('[UNCAUGHT EXCEPTION] ', err);
//   process.exit(1);
// });

// (async () => {
//   try {
//     server = app.listen(PORT, () => {
//       console.log(`[SERVER] Running on port ${PORT}`);
//     });
//   } catch (err) {
//     console.error('[SERVER STARTUP ERROR]', err);
//     process.exit(1);
//   }
// })();

// // Graceful Shutdown on unhandled promise rejections
// process.on('unhandledRejection', (err) => {
//   console.error('[UNHANDLED REJECTION]', err);
//   if (server) {
//     server.close(() => {
//       console.log('[SERVER] Server closed due to unhandled promise rejection');
//       process.exit(1);
//     });
//   } else {
//     process.exit(1);
//   }
// });
