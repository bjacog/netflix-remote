var WebsocketServer = require('ws').Server;

var rooms = [];
var server = new WebsocketServer({ port: 3210 });

server.on('connection', function(socket, req) {
	var roomID = req.url.substring(1);
	console.log('new connection:', roomID);
	console.log(server.clients);
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