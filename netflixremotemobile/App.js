import React, {Component} from 'react';
import { AsyncStorage, Dimensions, FlatList, StyleSheet, Slider, View } from 'react-native';
import { RNCamera } from 'react-native-camera';
import {
	Body,
	Button,
	Container,
	Content,
	Header,
	Icon,
	Left,
	ListItem,
	Right,
	StyleProvider,
	Text,
	Title,
	Item,
	Input,
} from 'native-base';
import { RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc';
import moment from 'moment';
import getTheme from './native-base-theme/components';
import customVariables from './theme/variables';

const DEVICE_SIZE = Dimensions.get('window');

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
			isLoadingLinks: true,
			links: [],
			query: "",
			roomID: '1930976237-2274112256-4181358587-3471119227'//null
		};

		this.webRTCconfiguration = {
			"iceServers": [
				{ "url": "stun:stun.l.google.com:19302" }
			]
		};
	}

	async componentWillMount() {
		// hack to set roomID
		await AsyncStorage.setItem('roomID', this.state.roomID);
		const roomID = await AsyncStorage.getItem('roomID');
		console.info('roomID', roomID);
		if (roomID) {
			this.setState({ roomID }, () => {
				// backhaul over websocket
				this.setupWebsocket();
				// webrtc
				this.setupWebRTC();
			});
		}
	}

	// componentDidMount() {
	// 	if (this.state.roomID) {
	// 		console.info('componentDidMount', this.offerPC.iceConnectionState);
	// 		if (this.offerPC.iceConnectionState !== 'connected') {
	// 			this.createOffer();
	// 		}
	// 	}
	// }

	componentWillUnmount() {
		if (this.ws.OPEN) {
			this.ws.close();
		}
	}

	setupWebsocket = () => {
		this.ws = new WebSocket("ws://192.168.8.103:3210/" + this.state.roomID);
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

	sendMessage = (message) => {
		if (this.sendChannel) {
			this.sendChannel.send(message);
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
		if (event.candidate && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify({ roomID: this.state.roomID, ice: event.candidate})); // "ice" is arbitrary
		} else {
			// All ICE candidates have been sent
		}
	}

	createOffer = () => {
		this.offerPC.createOffer((desc) => {
			const description = new RTCSessionDescription(desc);
			this.offerPC.setLocalDescription(description, () => {
				console.info('sending offer:', this.offerPC.localDescription);
				this.ws.send(JSON.stringify({  roomID: this.state.roomID, offer: this.offerPC.localDescription }))
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

	panProgress = (value) => {
		this.sendCommand("progress", { value });
	}

	changeVolume = (value) => {
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
			// backhaul over websocket
			this.setupWebsocket();
			// webrtc
			this.setupWebRTC();
		});
	}

	renderCamera = () => {
		if (!this.state.roomID) {
			return (
				<Content contentContainerStyle={styles.container}>
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
				</Content>
			);
		}
	}

	renderRemote = () => {
		let volumeIcon = "volume-up";
		if (this.state.videoState.volume < 0.51) {
			volumeIcon = "volume-down";
		}
		if (this.state.videoState.volume === 0) {
			volumeIcon = "volume-off";
		}
		const durationProgress = moment.duration(this.state.videoState.currentTime, 'seconds');
		const durationDuration = moment.duration(this.state.videoState.duration, 'seconds');
		const progress = moment.utc(durationProgress.asMilliseconds());
		const duration = moment.utc(durationDuration.asMilliseconds());
		const durationFormat = durationDuration.hours() > 0 ? "HH:mm:ss" : "mm:ss";
		if (true) {  //this.state.roomID) {
			return (
				<Content
					style={{
						position: 'absolute',
						bottom: 0,
						width: DEVICE_SIZE.width,
					}}
					contentContainerStyle={styles.container}
				>
					<View style={styles.rowContainer}>
						<Icon style={styles.icon} type="FontAwesome" name={volumeIcon} />
						<Slider
							// orientation="vertical"
							onValueChange={this.changeVolume}
							value={this.state.videoState.volume*100}
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
						<Slider
							// onValueChange={this.panProgress}
							value={this.state.videoState.currentTime}
							maximumValue={this.state.videoState.duration}
							style={{ flex: 1 }}
							minimumTrackTintColor="blue"
							maximumTrackTintColor="red"
						/>
						<Text>{duration.format(durationFormat)}</Text>
					</View>
				</Content>
			);
		}
	}

	openLink = (href) => {
		this.setState({ isLoadingLinks: true });
		this.sendCommand("location", { href })
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
		const quickLinks = this.state.links.filter(link => link.href.indexOf("/watch") === -1);
		const defaultLinks = [{
			text: "Home",
			href: "https://www.netflix.com"
		}];
		return(
		<View style={{ flex: 1}}>
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

	render() {
		return (
			<StyleProvider  style={getTheme(customVariables)}>
				<Container>
					<Header>
					<Left>
						<Button transparent>
						<Icon type="FontAwesome" name='bars' />
						</Button>
					</Left>
					<Body>
						<Title>Netflix Remote</Title>
					</Body>
					<Right>
						<Button
							transparent
							onPress={() => {
								this.setState({ roomID: null });
							}}
						>
							<Icon type="FontAwesome" name='qrcode' />
						</Button>
					</Right>
					</Header>
					<Header searchBar rounded>
						<Item>
							<Icon name="ios-search" />
							<Input
								value={this.state.query}
								onChangeText={(value) => {
									this.setState({ query: value });
								}}
								placeholder="Search" />
							{this.state.query.length > 0 && <Icon
								onPress={() => { this.setState({ query: "" }); }}
								type="FontAwesome"
								name="times" />}
						</Item>
						<Button
							disabled={this.state.query.length === 0}
							onPress={() => {
								this.sendCommand("location", { href: `https://www.netflix.com/search?q=${this.state.query}`}); 
							}}
							transparent
						>
							<Text>Search</Text>
						</Button>
					</Header>
						{/* {this.renderCamera()} */}
						{this.renderLists()}
						{this.renderRemote()}
				</Container>
			</StyleProvider>
		);
	}
}

const styles = StyleSheet.create({
	container: {
		// flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: '#F5FCFF',
		padding: 10,
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
	}
});
