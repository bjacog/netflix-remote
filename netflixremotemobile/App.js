/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 */

import React, {Component} from 'react';
import { StyleSheet, Slider } from 'react-native';
import {
	Container,
	Header,
	Title,
	Content,
	Footer,
	FooterTab,
	Button,
	Left,
	Right,
	Body,
	Icon,
	Text,
} from 'native-base';
import { RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';

export default class App extends Component {
	constructor(props) {
		super(props);

		this.state = {
			videoState: {
				volume: 0,
				duration: 0,
				currentTime: 0,
				paused: false,
			},
		};

		this.webRTCconfiguration = {
			"iceServers": [
				{ "url": "stun:stun.l.google.com:19302" }
			]
		};
	}

	componentWillMount() {
		// backhaul over websocket
		this.setupWebsocket();
		// webrtc
		this.setupWebRTC();
	}

	componentDidMount() {
		console.info('componentDidMount', this.offerPC.iceConnectionState);
		if (this.offerPC.iceConnectionState !== 'connected') {
			this.createOffer();
		}
	}

	componentWillUnmount() {
		if (this.ws.OPEN) {
			this.ws.close();
		}
	}

	setupWebsocket = () => {
		this.ws = new WebSocket("ws://localhost:3210");
		this.ws.onopen = () => {
			console.info('ws opened');
		}
		this.ws.onclose = () => {
			console.info('ws closed');
		}
		this.ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			console.info('received ws message: ', message);
			if (message.answer) {
				const description = new RTCSessionDescription(message.answer);
				console.info("received answer:", description);
				this.offerPC.setRemoteDescription(description);
			}
		}
	}

	setupWebRTC = () => {
		console.info('webrtc config:', this.webRTCconfiguration);
		this.offerPC = new RTCPeerConnection(this.webRTCconfiguration);
		this.offerPC.onicecandidate = this.onIceCandidate;
		this.offerPC.addEventListener('iceconnectionstatechange', this.iceConnectionStateChange);

		this.sendChannel = this.offerPC.createDataChannel("sendChannel");
		this.sendChannel.onmessage = this.handleReceiveMessage;
		this.sendChannel.onopen = this.handleSendChannelStatusOpenedChange;
		this.sendChannel.onclose = this.handleSendChannelStatusClosedChange;
	}

	handleSendChannelStatusOpenedChange = (e) => {
		console.info('channel status change:', e);
		this.sendCommand("get_video_state");
	}

	handleSendChannelStatusClosedChange = (e) => {
		console.info('channel status change:', e);
	}

	sendMessage = (message) => {
		if (this.sendChannel) {
			this.sendChannel.send(message);
		}
	}

	handleReceiveMessage = (event) => {
		const message = JSON.parse(event.data);
		console.info('message received:', message);
		switch(message.type) {
			case "state":
				this.setState({
					videoState: message.videoState,
				});
			break;
			default:
				console.log("Unhandled WebRTC message:", message);
			break;
		}
	}

	onIceCandidate = (event) => {
		console.info("offerPC onicecandidate", event.candidate);
		if (event.candidate) {
			this.ws.send(JSON.stringify({ice: event.candidate})); // "ice" is arbitrary
		} else {
			// All ICE candidates have been sent
		}
	}

	createOffer = () => {
		this.offerPC.createOffer((desc) => {
			const description = new RTCSessionDescription(desc);
			this.offerPC.setLocalDescription(description, () => {
				console.info('sending offer:', this.offerPC.localDescription);
				this.ws.send(JSON.stringify({ offer: this.offerPC.localDescription }))
			}, (error) => {
				console.info(error);
			})
		}, (error) => {
			console.info(error);
		});
	}

	iceConnectionStateChange = (event) => {
		console.info('answerPC iceConnectionStateChange:', this.offerPC.iceConnectionState, event);
		switch(this.offerPC.iceConnectionState) {
			case 'connected':
				if (this.offerTO) {
					clearInterval(this.offerTO);
				}
				this.ws.close();
			break;
			case 'disconnected':
				this.setupWebsocket();
				this.setupWebRTC();
				// start re-sending offers every 5 seconds.
				this.offerTO = setInterval(() => {
					this.createOffer();
				}, 5000);
			break;
			default:
				// do nothing
			break;
		}
	}

	togglePausePlay = () => {
		this.sendCommand("toggle_pause_play");
	}

	sendCommand = (command) => {
		this.sendMessage(`{"type":"${command}"}`);
	}

	render() {
		return (
			<Container>
				<Header>
				<Left>
					<Button transparent>
					<Icon name='menu' />
					</Button>
				</Left>
				<Body>
					<Title>Netflix Remote</Title>
				</Body>
				<Right />
				</Header>
				<Content contentContainerStyle={styles.container}>
					<Button
						large
						block
						onPress={this.togglePausePlay}
					>
						<Icon name={this.state.videoState.paused ? 'play' : 'pause'} />
					</Button>
					<Slider
						value={this.state.videoState.currentTime}
						maximumValue={this.state.videoState.duration}
						style={{ width: 200 }}
						minimumTrackTintColor="blue"
						maximumTrackTintColor="red"
					/>
				</Content>
				<Footer>
				<FooterTab>
					<Button full>
					<Text>Footer</Text>
					</Button>
				</FooterTab>
				</Footer>
			</Container>
		);
	}
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#F5FCFF',
		padding: 10,
	},
});
