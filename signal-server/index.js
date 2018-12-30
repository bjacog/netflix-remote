var WebsocketServer = require('ws').Server;
 
var server = new WebsocketServer({ port: 3210 });
server.on('connection', function(socket) {
	console.log('new connection');
  socket.on('message', function(msg) {
	  console.log('broadcasting message:', msg);
    server.clients.forEach(function(other) {
      if(other === socket) {
        return;
      }
 
      other.send(msg);
    });
  });
});