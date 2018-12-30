(function() {

    var peer = new Peer({
		debug: 3
	});
    peer.on('open', function (id) {
		document.getElementById("peerID").innerHTML = peer.id;
		// let the qr code show
		currentDomainAndPort = `${window.location.protocol}//${window.location.host}`;
		document.getElementById("qr").src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${currentDomainAndPort}/index.html#${peer.id}`;
		document.getElementById("link").href = `${currentDomainAndPort}/index.html#${peer.id}`;
    });


    peer.on('connection', function(conn) {
        conn.on('data', function(data){
        // Will print 'hi!'
        console.log(JSON.parse(data));
        });
	});
	
	function sendMessage(conn, message) {
		if (typeof message === 'string') {
			conn.send(JSON.stringify({
				message,
			}));
		} else {
			conn.send(JSON.stringify(message));
		}
	}

    function connectPeer(id) {
        var conn = peer.connect(id);
        // on open will be launch when you successfully connect to PeerServer
        conn.on('open', function(){
            // here you have conn.id
            sendMessage(conn, JSON.stringify({
				message: `hi from ${peer.id} on ${conn.id}!`
			}));
            sendButton = document.getElementById("send");
            sendButton.onclick = function() {
                sendMessage(conn, document.getElementById("message").value);
                document.getElementById("message").value = '';
            };
            nextButton = document.getElementById("next");
            nextButton.onclick = function() {
                sendMessage(conn, { control: "next"});
            };
        });
    }
    // connectButton = document.getElementById("connect");
    // connectButton.onclick = function() {
    //     connectPeer(document.getElementById("remotePeerID").value);
	// };
	
	const hash = window.location.hash;
	if (hash.length > 0) {
		connectPeer(hash.slice(1));
	}

})();