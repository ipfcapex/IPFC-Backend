
const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const routes = require('./routes');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');
const path = require("path");
require('./services/monitor.token');

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);  

// Attach Socket.IO to server
// const io = new Server(server, {
//   cors: {
//     origin: '*', 
//     // origin: [
//     //   "https://apex-shoes-deployed.vercel.app", 
//     //   "http://localhost:5173"
//     // ],
//     methods: ["GET", "POST", "PUT", "DELETE"],
//     credentials: true
//   }
// }); 

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://apex-shoes-deployed.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// Store io globally so it can be used in services
global._io = io;

// Socket.IO connection
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Middleware: Security headers
app.use(helmet());

// Middleware: Enable CORS
// app.use(cors({
//   origin: '*', 
//   // origin: [
//   //   "https://apex-shoes-deployed.vercel.app", 
//   //   "http://localhost:5173"
//   // ],
//   methods: ["GET", "POST", "PUT", "DELETE"],
//   credentials: true
// }));

app.use(cors({
  origin: [
    "https://apex-shoes-deployed.vercel.app",
    "http://localhost:5173"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Middleware: JSON body parser
app.use(express.json());

// Middleware: Logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Middleware: Rate Limiting
// const limiter = rateLimit({
//   windowMs: 60 * 60 * 1000,
//   max: 10000,
//   message: 'Too many requests from this IP, please try again later.'
// });
// app.use('/api', limiter);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
  service: 'YES ITS WORKING FINE!!!!!! :) 100.0 ',
    uptime: process.uptime(),  
    timestamp: new Date().toISOString(),
  });
});


// Middleware: Sessions
app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false,
  rolling: true, // :white_check_mark: reset maxAge on every request
  cookie: {
    maxAge: 1000 * 60 * 60 ,
    secure: false, // change to true if HTTPS
    httpOnly: true
  }
}));

//image upload 
// app.use("/uploads", cors(), express.static(path.join(__dirname, "uploads")));

// Routes
app.use('/api', routes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}!!!`);
});

module.exports = { app, io };