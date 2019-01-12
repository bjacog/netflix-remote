var answerPC, receiveChannel, videos, ws, my_uuid = null;

// connect to signalling server
setupWebsocket = function() {
	// console.log("opening ws to wss://ws.chillremote.host:39390/" + my_uuid + '/window');
	console.log("opening ws to wss://wslocal.chillremote.host:39390/" + my_uuid + '/window');
	// ws = new WebSocket("wss://ws.chillremote.host:39390/" + my_uuid + '/window');
	ws = new WebSocket("wss://wslocal.chillremote.host:39390/" + my_uuid + '/window');
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
					ws.send(JSON.stringify({ roomID: my_uuid, answer: answerPC.localDescription }));
				});
		}
	}
}

handleReceiveChannelOpenedStatusChange = function(event) {
	if (receiveChannel) {
		console.log("Receive channel's status has changed to " + receiveChannel.readyState);
		// send the state of the webpage
		sendVideoState();
		sendLinks();
		// set video onchange handler
		addVideoDurationchangeListener();
	}
}

handleReceiveChannelClosedStatusChange = function(event) {
	if (receiveChannel) {
		console.log("Receive channel's status has changed to " + receiveChannel.readyState);
	}
	setupWebsocket();
}

handleReceiveMessage = function(event) {
	const message = JSON.parse(event.data);
	console.info('webrtc message received: ', message);
	switch(message.type) {
		case 'location':
			window.location = message.options.href;
			// TODO rethink how to follow links without reloading the page.
			// const link = Object.values(document.getElementsByTagName("a")).find(a => a.href === message.options.href);
			// if (link) {
			// 	link.click();
			// }
		break;
		case 'toggle_fullscreen':
			videos = document.getElementsByTagName("video");
			if (videos[0]) {
				if (document.fullscreenElement === null) {
					videos[0].webkitRequestFullScreen();
				} else {
					document.exitFullscreen();
				}
			}
		break;
		case 'toggle_muted':
			videos = document.getElementsByTagName("video");
			if (videos[0]) {
				if (videos[0].muted) {
					videos[0].muted = false;
				} else {
					videos[0].muted = true;
				}
			}
		break;
		case 'get_links':
			sendLinks();
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
		case 'progress':
		videos = document.getElementsByTagName("video");
			if (videos[0]) {
					videos[0].currentTime = message.options.value;
				}
		break;
		case 'volume':
		videos = document.getElementsByTagName("video");
			if (videos[0]) {
					videos[0].volume = parseFloat(message.options.value);
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

// ready to answer
setupAnswerPC = function() {
	answerPC = new RTCPeerConnection();
	answerPC.ondatachannel = receiveChannelCallback;

	answerPC.onicecandidate = event => {
		console.info("answerPC onicecandidate", event.candidate);
		if (event.candidate) {
			ws.send(JSON.stringify({ roomID: my_uuid, ice: event.candidate})); // "ice" is arbitrary
		} else {
			// All ICE candidates have been sent
		}
	}

	answerPC.addEventListener('iceconnectionstatechange', iceConnectionStateChange);
}

sendMessage = function(message) {
	if (receiveChannel && receiveChannel.readyState !== 'disconnected') {
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
				paused: videos[0].paused,
				muted: videos[0].muted,
				fullscreen: videos[0].webkitDisplayingFullscreen,
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

sendLinks = function() {
	const dupedLinks = (Object.values(document.getElementsByTagName("a")));
	const links = dupedLinks.filter((a, i) => a.href.length > 0 && a.text.length > 0 && dupedLinks.findIndex(l => l.href === a.href) === i)
		.map(a => ({ 
			text: a.text,
			href: a.href
		}));
	sendMessage(JSON.stringify({
		type: "links",
		links
	}));
}

addVideoDurationchangeListener = function() {
	videos = document.getElementsByTagName("video");
	if (videos[0]) {
		videos[0].addEventListener('timeupdate', function() {
			videos = document.getElementsByTagName("video");
			sendVideoState();
		});
	} else {
		// retry in 500ms
		setTimeout(() => {
			addVideoDurationchangeListener();
		}, 500);
	}
}

// get token and open connection
chrome.storage.sync.get('my_uuid', function(data) {
	my_uuid = data.my_uuid;
	setupWebsocket();
});