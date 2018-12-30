var answerPC, receiveChannel, videos = null;
// connect to signalling server
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
		answerPC.setRemoteDescription(message.offer)
			.then(() => answerPC.createAnswer())
			.then(answer => answerPC.setLocalDescription(answer))
			.then(() => {
				ws.send(JSON.stringify({ answer: answerPC.localDescription }));
			});
	}
}

handleReceiveChannelStatusChange = function(event) {
	if (receiveChannel) {
		console.log("Receive channel's status has changed to " + receiveChannel.readyState);
	}
}

handleReceiveMessage = function(event) {
	const message = JSON.parse(event.data);
	switch(message.type) {
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
	receiveChannel.onopen = handleReceiveChannelStatusChange;
	receiveChannel.onclose = handleReceiveChannelStatusChange;
}

// ready to answer
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

