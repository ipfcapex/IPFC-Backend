// Send a notification to all connected clients
const sendNotification = (event, data) => {
  console.log("Second check:->", data)
  if (global._io) {
    global._io.emit(event, data);
  }
  
  console.log("Third",event)
};

module.exports = { sendNotification };
