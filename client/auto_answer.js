var answerPC, receiveChannel, videos, ws = null;
// connect to signalling server
setupWebsocket = function() {
	ws = new WebSocket("ws://localhost:3210");
	ws.onopen = function() {
		console.info('ws opened');
	}
	ws.onclose = function() {
		console.info('ws closed');
	}
	ws.onmessage = function(event) {
		const message = JSON.parse(event.data);
		console.info('ws message: ', message);
		if (message.ice) {
			answerPC.addIceCandidate(message.ice).catch(e => {
				console.log("Failure during addIceCandidate(): " + e.name);
			});
		}
		if (message.offer) {
			console.info("received offer:", message.offer);
			setupAnswerPC();
			answerPC.setRemoteDescription(message.offer)
				.then(() => answerPC.createAnswer())
				.then(answer => answerPC.setLocalDescription(answer))
				.then(() => {
					console.info("sending answer:", answerPC.localDescription);
					ws.send(JSON.stringify({ answer: answerPC.localDescription }));
				});
		}
	}
}

handleReceiveChannelOpenedStatusChange = function(event) {
	if (receiveChannel) {
		console.log("Receive channel's status has changed to " + receiveChannel.readyState);
		// send the state of the webpage
		sendVideoState();
		// set video onchange handler
		addVideoDurationchangeListener();
	}
}

handleReceiveChannelClosedStatusChange = function(event) {
	if (receiveChannel) {
		console.log("Receive channel's status has changed to " + receiveChannel.readyState);
	}
	ws.open();
}

handleReceiveMessage = function(event) {
	const message = JSON.parse(event.data);
	console.info('webrtc message received: ', message);
	switch(message.type) {
		case 'get_video_state':
			sendVideoState();
		break;
		case 'toggle_pause_play':
			videos = document.getElementsByTagName("video");
			if (videos[0]) {
				if (videos[0].paused) {
					videos[0].play();
				} else {
					videos[0].pause();
				}
			}
		break;
		case 'volume':
		videos = document.getElementsByTagName("video");
			if (videos[0]) {
					videos[0].volume = message.value;
				}
		break;
		default:
			console.info('WebRTC message received:', message);
		break;
	}
}

receiveChannelCallback = function(event) {
	receiveChannel = event.channel;
	receiveChannel.onmessage = handleReceiveMessage;
	receiveChannel.onopen = handleReceiveChannelOpenedStatusChange;
	receiveChannel.onclose = handleReceiveChannelClosedStatusChange;
}

iceConnectionStateChange = function(event) {
	console.info('answerPC iceConnectionStateChange:', answerPC.iceConnectionState, event);
	switch(answerPC.iceConnectionState) {
		case 'connected':
			ws.close();
			break;
		case 'disconnected':
			setupWebsocket();
		break;
		default:
			// do nothing
		break;
	}
}

setupWebsocket();

// ready to answer
setupAnswerPC = function() {
	answerPC = new RTCPeerConnection();
	answerPC.ondatachannel = receiveChannelCallback;

	answerPC.onicecandidate = event => {
		console.info("answerPC onicecandidate", event.candidate);
		if (event.candidate) {
			ws.send(JSON.stringify({ice: event.candidate})); // "ice" is arbitrary
		} else {
			// All ICE candidates have been sent
		}
	}

	answerPC.addEventListener('iceconnectionstatechange', iceConnectionStateChange);
}

sendMessage = function(message) {
	if (receiveChannel && receiveChannel.readyState !== 'disconnected') {
		console.info('sending WebRTC message:', message);
		receiveChannel.send(message);
	}
}

sendVideoState = function() {
	videos = document.getElementsByTagName("video");
	if (videos[0]) {
		sendMessage(JSON.stringify({
			type: "state",
			location: window.location,
			videoState: {
				volume: videos[0].volume,
				duration: videos[0].duration,
				currentTime: videos[0].currentTime,
				paused: videos[0].paused
			}
		}));
	} else {
		sendMessage(JSON.stringify({
			type: "state",
			location: window.location,
			videoState: {
				volume: 0,
				duration: 0,
				currentTime: 0,
				paused: false
			}
		}));
	}
}

addVideoDurationchangeListener = function() {
	videos = document.getElementsByTagName("video");
	if (videos[0]) {
		videos[0].addEventListener('timeupdate', function() {
			console.info('currentTime', videos[0].currentTime);
			sendVideoState();
		});
	} else {
		// retry in 500ms
		setTimeout(() => {
			addVideoDurationchangeListener();
		}, 500);
	}
}