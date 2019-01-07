const WebSocket = require('ws');
var WebsocketServer = require('ws').Server;

var rooms = [];
var server = new WebsocketServer({ port: 3210 });

server.on('connection', function(socket, req) {
	var roomID = req.url.substring(1);
	// add the room / connection to the room
	roomIndex = rooms.findIndex(r => r.id === roomID);
	console.log('new connection:', roomID, roomIndex);
	if (roomIndex === -1) {
		rooms.push({
			id: roomID,
			clients: [
				socket
			],
		});
		console.log(`rooms ${rooms.length}`);
		console.log(`clients in ${roomID}`, rooms[rooms.length-1].clients.length);
	} else {
		rooms[roomIndex].clients.push(socket);
	}
	
	socket.on('message', function(msg) {
		const aMessage = JSON.parse(msg);
		// send the message to the correct room
		if (aMessage.roomID) {
			console.info("message for room:", aMessage.roomID);
			roomIndex = rooms.findIndex(r => r.id === roomID);
			console.log(`found ${roomID} at index ${roomIndex}`);
			if (roomIndex !== -1) {
				rooms[roomIndex].clients.forEach(function(client) {
					if(client === socket) {
						return;
					}
					if (client.readyState === WebSocket.OPEN) {
						client.send(msg);
					}
				});
			}
		} else {
			console.info("general mesage:", JSON.stringify(aMessage));
			server.clients.forEach(function(client) {
				if(client === socket) {
					return;
				}
			
				if (client.readyState === WebSocket.OPEN) {
					client.send(msg);
				}
			});
		}
	});
});