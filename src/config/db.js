const mongoose = require('mongoose');

const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;

  if (!MONGO_URI) {
    console.error('[MongoDB]  MONGO_URI not defined in .env');
    process.exit(1);
  }

  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000, // Timeout after 10s if DB is not reachable
  };

  try {
    const connection = await mongoose.connect(MONGO_URI);

    console.log(
      `[MongoDB]  Connected: ${connection.connection.host} | ${connection.connection.name} (${new Date().toLocaleString()})`
    );

    // Optional: log if disconnected
    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB]  Disconnected');
    });

    // Optional: log if reconnected
    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB]  Reconnected');
    });

    // Optional: log errors after connection
    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB]  Connection Error:', err);
    });
  } catch (error) {
    console.error(`[MongoDB]  Initial Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
