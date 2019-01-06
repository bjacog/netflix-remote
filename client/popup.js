// 
chrome.storage.sync.get('my_uuid', function(data) {
	document.getElementById('qr').src = "https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=" + data.my_uuid;
});