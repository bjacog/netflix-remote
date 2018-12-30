(function() {

    var peer = new Peer({
		secure: true,
	});
    peer.on('open', function (id) {
        document.getElementById("peerID").innerHTML = peer.id;
    });


    peer.on('connection', function(conn) {
        conn.on('data', function(data){
        // Will print 'hi!'
        console.log(data);
        });
    });

    function connectPeer(id) {
        var conn = peer.connect(id);
        // on open will be launch when you successfully connect to PeerServer
        conn.on('open', function(){
            // here you have conn.id
            conn.send(`hi from ${peer.id} on ${conn.id}!`);
            sendButton = document.getElementById("send");
            sendButton.onclick = function() {
                conn.send(document.getElementById("message").value);
                document.getElementById("message").value = '';
            };
        });
    }
    connectButton = document.getElementById("connect");
    connectButton.onclick = function() {
        connectPeer(document.getElementById("remotePeerID").value);
    };

})();