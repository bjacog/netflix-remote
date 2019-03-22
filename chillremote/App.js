import React, {Component} from 'react';
import {
	AppState,
	AsyncStorage,
	Dimensions,
	FlatList,
	StyleSheet,
	Slider,
	View,
} from 'react-native';
import { RNCamera } from 'react-native-camera';
import {
	Badge,
	Body,
	Button,
	Container,
	Content,
	Form,
	Header,
	Icon,
	Left,
	ListItem,
	Right,
	Spinner,
	StyleProvider,
	Text,
	Title,
	Item,
	Input,
} from 'native-base';
import { RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import moment from 'moment';
import * as Progress  from 'react-native-progress';
var Fabric = require('react-native-fabric');
var { Answers } = Fabric;

import getTheme from './native-base-theme/components';
import customVariables from './theme/variables';

const DEVICE_SIZE = Dimensions.get('window');
const WS_SERVER = "wss://ws.chillremote.host:39390";

const iceConnectionStates = {
	NEW: 'new',
	CHECKING: 'checking',
	CONNECTING: 'connecting',
	CONNECTED: 'connected',
	COMPLETED: 'completed',
	DISCONNECTED: 'disconnected',
	CLOSED: 'closed',
}

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
			appState: AppState.currentState,
			wsConnectionState: WebSocket.CLOSED,
			webrtcConnectionState: iceConnectionStates.CLOSED,
			isLoadingLinks: true,
			links: [{
				href: "https://www.netflix.com",
				text: "Home",
			}],
			query: "",
			// roomID: '2953957117-2389650558-2211742700-1053767314'//null
			roomID: '',
		};

		this.webRTCconfiguration = {
			"iceServers": [
				{ "url": "stun:stun.l.google.com:19302" }
			]
		};
	}

	async componentWillMount() {
		this.initiateConnection();
	}

	componentDidMount() {
		AppState.addEventListener('change', this._handleAppStateChange);
	}

	componentWillUnmount() {
		if (this.ws.OPEN) {
			this.ws.close();
		}
		AppState.removeEventListener('change', this._handleAppStateChange);
	}

	_handleAppStateChange = (nextAppState) => {
		// app became active from background
		if (
			this.state.appState.match(/inactive|background/) &&
			nextAppState === 'active'
		) {
			// start reconnecting
			this.initiateConnection();
		}
		// app became inactive
		if (
			this.state.appState === 'active' &&
			nextAppState.match(/inactive|background/)
		) {
			// start reconnecting
			if (this.ws.OPEN) {
				this.ws.close();
			}
		}
		this.setState({appState: nextAppState});
	};

	initiateConnection = async () => {
		// hack to set roomID
		// await AsyncStorage.setItem('roomID', this.state.roomID);
		const roomID = await AsyncStorage.getItem('roomID');
		if (roomID) {
			this.setState({ roomID }, () => {
				console.info('roomID', roomID);
				this.setState({ roomID }, () => {
					// backhaul over websocket
					this.setupWebsocket();
				});
			});
		}
	}

	logCustom = (key, data) => {
		Answers.logCustom(key, {
			roomID: this.state.roomID,
			...data,
		});
	}

	setupWebsocket = () => {
		console.log('opening websocket to ', `${WS_SERVER}/${this.state.roomID}/remote`);
		this.ws = new WebSocket(`${WS_SERVER}/${this.state.roomID}/remote`);
		this.ws.onopen = () => {
			console.info('ws opened');
			this.setState({ wsConnectionState: this.ws.readyState });
			// this.setupWebRTC();
			this.sendCommand("get_video_state");
			this.sendCommand("get_links");
		}
		this.ws.onclose = (event) => {
			console.info('ws closed', event);
			this.setState({ wsConnectionState: this.ws.readyState });
		}
		this.ws.onmessage = (event) => {
			const message = JSON.parse(event.data);
			console.info('received ws message: ', message);
			if (message.answer) {
				const description = new RTCSessionDescription(message.answer);
				console.info("received answer:", description);
				this.offerPC.setRemoteDescription(description);
			}
			else if (message.type === "offerRequest") {
				this.createOffer();
			} else {
				this.handleReceiveMessage(event);
			}
			return false;
		}
	}

	setupWebRTC = () => {
		this.offerPC = null;
		console.info('webrtc config:', this.webRTCconfiguration);
		this.offerPC = new RTCPeerConnection(this.webRTCconfiguration);
		this.offerPC.onicecandidate = this.onIceCandidate;
		this.offerPC.addEventListener('iceconnectionstatechange', this.iceConnectionStateChange);

		this.sendChannel = this.offerPC.createDataChannel("sendChannel");
		this.sendChannel.onmessage = this.handleReceiveMessage;
		this.sendChannel.onopen = this.handleSendChannelStatusOpenedChange;
		this.sendChannel.onclose = this.handleSendChannelStatusClosedChange;

		this.createOffer();
	}

	handleSendChannelStatusOpenedChange = (e) => {
		console.info('channel status change:', e);
		this.sendCommand("get_video_state");
		this.sendCommand("get_links");
	}

	handleSendChannelStatusClosedChange = (e) => {
		console.info('channel status change:', e);
	}

	sendWsMessage = (message) => {
		if (this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		} else {
			console.log('not sending message because ', this.ws.readyState, ' is not open(', WebSocket.OPEN, ')');
		}
	}

	sendMessage = (message) => {
		if (this.sendChannel) {
			// send over webrtc
			this.sendChannel.send(message);
			return;
		} 
		if (this.ws.readyState === WebSocket.OPEN) {
			// send over ws
			this.ws.send(message);
		}
	}

	handleReceiveMessage = (event) => {
		const message = JSON.parse(event.data);
		console.info('message received:', message);
		switch(message.type) {
			case "links":
				this.setState({ links: message.links, isLoadingLinks: false });
			break;
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
			this.sendWsMessage({ roomID: this.state.roomID, ice: event.candidate}); // "ice" is arbitrary
		} else {
			// All ICE candidates have been sent
		}
	}

	createOffer = () => {
		if (this.offerPC) {
			this.offerPC.createOffer((desc) => {
				const description = new RTCSessionDescription(desc);
				this.offerPC.setLocalDescription(description, () => {
					console.info('sending offer:', this.offerPC.localDescription);
					this.sendWsMessage({  roomID: this.state.roomID, offer: this.offerPC.localDescription });
				}, (error) => {
					console.info(error);
				})
			}, (error) => {
				console.info(error);
			});
		}
	}

	iceConnectionStateChange = (event) => {
		console.info('answerPC iceConnectionStateChange:', this.offerPC.iceConnectionState, event);
		this.setState({ webrtcConnectionState: this.offerPC.iceConnectionState });
		switch(this.offerPC.iceConnectionState) {
			case 'connected':
				if (this.offerTO) {
					clearInterval(this.offerTO);
				}
				this.ws.close();
			break;
			case 'disconnected':
				this.setupWebsocket()
				// start re-sending offers every 5 seconds.
				this.offerTO = setInterval(() => {
					if (this.ws.readyState === WebSocket.OPEN) {
						this.createOffer();
					}
				}, 5000);
			break;
			default:
				// do nothing
			break;
		}
	}

	togglePausePlay = () => {
		this.logCustom("toggle_pause_play", { videoState: this.state.videoState });
		this.sendCommand("toggle_pause_play");
	}

	toggleMuted = () => {
		this.logCustom("toggle_muted", { videoState: this.state.videoState });
		this.sendCommand("toggle_muted");
	}

	toggleFullscreen = () => {
		this.logCustom("toggle_fullscreen", { videoState: this.state.videoState });
		this.sendCommand("toggle_fullscreen");
	}

	panProgress = (value) => {
		this.logCustom("progress", { videoState: this.state.videoState, value });
		this.sendCommand("progress", { value });
	}

	changeVolume = (value) => {
		this.logCustom("volume", { videoState: this.state.videoState, value });
		this.sendCommand("volume", { value: value / 100 });
	}

	sendCommand = (command, options) => {
		options = options ? JSON.stringify(options) : "{}";
		console.info(`sending command: {"type":"${command}"},"options":${options}`);
		this.sendMessage(`{"type":"${command}","options":${options}}`);
	}

	onBarCodeRead = async ({ data }) => {
		await AsyncStorage.setItem('roomID', data);
		this.setState({ roomID: data }, () => {
			this.logCustom("join_room", { roomID: data });
			// backhaul over websocket
			this.setupWebsocket()
		});
	}

	renderCamera = () => {
		if (!this.state.roomID) {
			return (
				<View
					style={styles.camera}
				>
					<RNCamera
						ref={ref => {
							this.camera = ref;
						}}
						style = {styles.preview}
						type={RNCamera.Constants.Type.back}
						flashMode={RNCamera.Constants.FlashMode.on}
						permissionDialogTitle={'Permission to use camera'}
						permissionDialogMessage={'We need your permission to use your camera to scan the room QR Code'}
						onBarCodeRead={this.onBarCodeRead}
					/>
				</View>
			);
		}
	}

	renderRemote = () => {
		const connectionStyle = this.getConnectionState();
		if (!connectionStyle.success) return null;
		let volumeIcon = "volume-up";
		if (this.state.videoState.volume < 0.51) {
			volumeIcon = "volume-down";
		}
		if (this.state.videoState.muted || this.state.videoState.volume === 0) {
			volumeIcon = "volume-off";
		}
		const durationProgress = moment.duration(this.state.videoState.currentTime, 'seconds');
		const durationDuration = moment.duration(this.state.videoState.duration, 'seconds');
		const progress = moment.utc(durationProgress.asMilliseconds());
		const duration = moment.utc(durationDuration.asMilliseconds());
		const durationFormat = durationDuration.hours() > 0 ? "HH:mm:ss" : "mm:ss";
		if (this.state.roomID.length > 0 || durationDuration !== 0) {
			return (
				<View
					style={{
						...styles.container,
						position: 'absolute',
						bottom: 0,
						width: DEVICE_SIZE.width,
					}}
				>
					<View style={styles.rowContainer}>
						<Button
							large
							transparent
							onPress={this.toggleMuted}
						>
							<Icon style={styles.icon} type="FontAwesome" name={volumeIcon} />
						</Button>
						<Slider
							// orientation="vertical"
							onValueChange={this.changeVolume}
							value={this.state.videoState.muted ? 0 :  this.state.videoState.volume*100}
							maximumValue={100}
							style={{ width: 200 }}
							minimumTrackTintColor="blue"
							maximumTrackTintColor="red"
						/>
					</View>
					<Button
						large
						block
						onPress={this.togglePausePlay}
					>
						<Icon name={this.state.videoState.paused ? 'play' : 'pause'} />
					</Button>
					<View style={[styles.rowContainer]}>
						<Text>{progress.format(durationFormat)}</Text>
						<Progress.Bar
							progress={durationDuration > 0 ? durationProgress/durationDuration : 0}
							style={{ marginHorizontal: 5 }}
						/>
						<Text>{duration.format(durationFormat)}</Text>
					</View>
				</View>
			);
		}
	}

	openLink = (href) => {
		this.setState({ isLoadingLinks: true });
		this.sendCommand("location", { href })
	}

	getConnectionState = () => {
		const { wsConnectionState, webrtcConnectionState } = this.state;
		// using only ws for comms
		return {
			danger: wsConnectionState === WebSocket.CLOSED,
			warning: wsConnectionState === WebSocket.CONNECTING,
			info: wsConnectionState === WebSocket.CONNECTED || wsConnectionState === WebSocket.OPEN,
			success: wsConnectionState === WebSocket.CONNECTED || wsConnectionState === WebSocket.OPEN,
		};
		// for using only webrtc for comms
		return {
			danger: webrtcConnectionState === iceConnectionStates.CLOSED && wsConnectionState === WebSocket.CLOSED,
			warning: webrtcConnectionState === iceConnectionStates.CONNECTING || wsConnectionState === WebSocket.CONNECTING,
			info: webrtcConnectionState === iceConnectionStates.CONNECTED || wsConnectionState === WebSocket.CONNECTED || wsConnectionState === WebSocket.OPEN,
			success: webrtcConnectionState === iceConnectionStates.COMPLETED && wsConnectionState === WebSocket.CLOSED,
		};
	}

	renderLink = ({ item }) => {
		return(
			<ListItem
				key={item.href}
				onPress={() => {
					this.openLink(item.href);
				}}
			>
				<Left>
					<Text>{item.text}</Text>
				</Left>
				<Right>
					<Icon name="arrow-forward" />
				</Right>
			</ListItem>
		);
	}

	renderButtonLink = ({ item }) => {
		return(
			<Button
				rounded
				style={{ margin: 2 }}
				key={item.href}
				onPress={() => {
					this.openLink(item.href);
				}}
			>
				<Text>{item.text}</Text>
			</Button>
		);
	}

	renderLists = () => {
		const connectionStyle = this.getConnectionState();
		console.info(connectionStyle);
		if (!this.state.roomID || !connectionStyle.success) return (<Spinner />);
		const quickLinks = this.state.links.filter(link => link.href.indexOf("/watch") === -1);
		const defaultLinks = [{
			text: "Home",
			href: "https://www.netflix.com"
		}];
		return(
		<View style={styles.listContainer}>
			<FlatList
				contentContainerStyle={{ margin: 5 }}
				horizontal
				data={quickLinks.length > 0 ? quickLinks : defaultLinks}
				keyExtractor={(item) => item.href}
				renderItem={this.renderButtonLink}
			/>
			<FlatList
				refreshing={this.state.isLoadingLinks}
				data={this.state.links.filter(link => link.href.indexOf("/watch") !== -1)}
				keyExtractor={(item) => item.href}
				renderItem={this.renderLink}
			/>
		</View>
		);
	}

	renderConnectionBadge = () => {
		const connectionStyle = this.getConnectionState();
		const connectionIcon = connectionStyle.success ? "link" : "unlink";
		return (
			<Badge
				{...connectionStyle}
				style={{ marginTop: 8 }}
			>
				<Icon type="FontAwesome" name={connectionIcon} style={{ fontSize: 15, color: "#fff", lineHeight: 20 }}/>
			</Badge>
		);
	}

	renderSearchBar = () => {
		const connectionStyle = this.getConnectionState();
		if (!connectionStyle.success) return null;
		const { query } = this.state;
		return (
			<View>
						<Form style={styles.searchBarForm}>
							<Item
								style={{ flex: 3, borderColor: 'transparent' }}
								
							>
								<Icon
									style={{
										color: customVariables.brandPrimary,
									}}
									name="ios-search"
								/>
								<Input
									underlineColorAndroid={'transparent'}
									value={query}
									onChangeText={(value) => {
										this.setState({ query: value });
									}}
									color={'white'}
									onSubmitEditing={() => {
										this.sendCommand("location", { href: `https://www.netflix.com/search?q=${query}`}); 
									}}
									placeholder="Search"
									style={{
										color: customVariables.brandLight,
									}}
								/>
								{query.length > 0 && <Icon
									style={{
										color: customVariables.brandPrimary,
									}}
									onPress={() => { this.setState({ query: "" }); }}
									type="FontAwesome"
									name="times"
								/>}
							</Item>
							{query.length > 0 && <Button
								style={{
									alignSelf: 'center',
									flex: 1,
								}}
								disabled={query.length === 0}
								onPress={() => {
									this.sendCommand("location", { href: `https://www.netflix.com/search?q=${this.state.query}`}); 
								}}
								transparent
							>
								<Text>Search</Text>
							</Button>}
						</Form>
					</View>
		);
	}

	render() {
		if (this.state.appState.match(/inactive|background/)) {
			return null;
		}
		return (
			<StyleProvider  style={getTheme(customVariables)}>
				<Container style={{ backgroundColor: customVariables.brandDark }}>
					<Header>
					<Body>
						<Title>Chill Remote</Title>
					</Body>
					<Right>
					{this.renderConnectionBadge()}
						<Button
							transparent
							onPress={() => {
								this.setState({ roomID: '' });
							}}
						>
							<Icon type="FontAwesome" name='qrcode' />
						</Button>
					</Right>
					</Header>
						{this.renderSearchBar()}
						{this.renderCamera()}
						{this.renderLists()}
						{this.renderRemote()}
				</Container>
			</StyleProvider>
		);
	}
}

const styles = StyleSheet.create({
	container: {
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#000000',
		padding: 10,
	},
	listContainer: {
		flex: 1,
		backgroundColor: '#000000',
		marginBottom: 160,
	},
	searchBarForm: {
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'stretch',
	},
	rowContainer: {
		flexDirection: 'row',
		alignItems: "center",
	},
	rowStretcher: {
		alignContent: "stretch",
	},
	preview: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		justifyContent: 'flex-end',
		alignItems: 'center',
	},
	icon: {
		margin: 10,
	},
	camera: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
	},
});
