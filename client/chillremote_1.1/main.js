(function() {
	var offerPC, answerPC, sendChannel, receiveChannel = null;
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
		if (message.answer) {
			console.info("received answer:", message.answer);
			offerPC.setRemoteDescription(message.answer);
		}
	}

	sendButton = document.getElementById("send");
	sendButton.onclick = function() {
		message = document.getElementById("message").value;
		ws.send(JSON.stringify({ message }));
	}

	handleSendChannelStatusChange = function(e) {
		console.info('channel status change:', e);
	}

	handleReceiveChannelStatusChange = function(event) {
		if (receiveChannel) {
			console.log("Receive channel's status has changed to " + receiveChannel.readyState);
		}
	}

	sendTextMessage = function() {
		messageInputBox = document.getElementById("message");
		var message = messageInputBox.value;
		sendMessage(message);
		messageInputBox.value = "";
		messageInputBox.focus();
	}

	sendMessage = function(message) {
		if (sendChannel) {
			sendChannel.send(message);
		} else {
			receiveChannel.send(message);
		}
	}

	handleReceiveMessage = function(event) {
		console.info('message received:', event.data);
	}

	receiveChannelCallback = function(event) {
		receiveChannel = event.channel;
		receiveChannel.onmessage = handleReceiveMessage;
		receiveChannel.onopen = handleReceiveChannelStatusChange;
		receiveChannel.onclose = handleReceiveChannelStatusChange;
	}

	// offer
	offerButton = document.getElementById("offer");
	offerButton.onclick = function() {
		offerPC = new RTCPeerConnection();
		
		offerPC.onicecandidate = event => {
			console.info("offerPC onicecandidate", event.candidate);
			if (event.candidate) {
				ws.send(JSON.stringify({ice: event.candidate})); // "ice" is arbitrary
			} else {
				// All ICE candidates have been sent
			}
		}
		
		sendChannel = offerPC.createDataChannel("sendChannel");
		sendChannel.onmessage = handleReceiveMessage;
		sendChannel.onopen = handleSendChannelStatusChange;
		sendChannel.onclose = handleSendChannelStatusChange;

		// create the offer
		offerPC.createOffer()
			.then(offer => offerPC.setLocalDescription(offer))
			.then(() => {
				console.info('sending offer:', offerPC.localDescription);
				ws.send(JSON.stringify({ offer: offerPC.localDescription }))
			});
	}
	// answer
	// answerButton = document.getElementById("answer");
	// answerButton.onclick = function() {
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

	// send message via webrtc
	sendMessageWebRTC = document.getElementById("send-webrtc");
	sendMessageWebRTC.onclick = function() {
		sendTextMessage();
	}

	// video controls
	pausePlayButton = document.getElementById("toggle_pause_play");
	pausePlayButton.onclick = function() {
		messageInputBox = document.getElementById("message");
		sendMessage(`{"type":"toggle_pause_play"}`);
	}

	// volume
	volumeSlider = document.getElementById("volume");
	volumeSlider.onchange = function() {
		sendMessage(JSON.stringify({
			type: "volume",
			value: volumeSlider.value
		}));
	}
})();