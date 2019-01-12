const WebSocket = require('ws');
var WebsocketServer = require('ws').Server;

// * required for wss
const https = require('https');
const fs = require('fs');

const httpsOptions = {
	key: fs.readFileSync('./certs/privkey1.pem'),
	cert: fs.readFileSync('./certs/cert1.pem')
};

httpsServer = https.createServer(httpsOptions);
// * end of wss required stuff


var rooms = [];
var server = new WebsocketServer({
	port: 39390,
	server: httpsServer,
	verifyClient: (info) => {
		success = info.secure === true;
		return true;
	},
});

server.on('connection', function(socket, req) {
	const aConnectionData = req.url.substring(1).split("/");
	const roomID = aConnectionData[0];
	const clientType = aConnectionData[1];
	// add the room / connection to the room
	roomIndex = rooms.findIndex(r => r.id === roomID);
	console.log('new connection:', roomID, roomIndex, clientType);
	if (roomIndex === -1) {
		rooms.push({
			id: roomID,
			clients: [
				socket
			],
		});
		console.log(`rooms ${rooms.length}`);
	} else {
		rooms[roomIndex].clients.push(socket);
		console.log(`clients in ${roomID}`, rooms[rooms.length-1].clients.length);
		// tell the existing clients to offer connections.
		if (clientType === "window") {
			console.log(`asking for offers in ${roomID}`);
			rooms[roomIndex].clients.forEach(function(client) {
				if(client === socket) {
					return;
				}
				if (client.readyState === WebSocket.OPEN) {
					client.send(JSON.stringify({ type: "offerRequest" }));
				}
			});
		}
	}

	// process message
	socket.on('message', function(msg) {
		const aMessage = JSON.parse(msg);
		// send the message to the correct room
		if (aMessage.roomID) {
			console.info("message for room:", aMessage.roomID, aMessage.type);
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