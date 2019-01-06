chrome.runtime.onInstalled.addListener(function() {
	const my_uuid = crypto.getRandomValues(new Uint32Array(4)).join('-');
	chrome.storage.sync.set({ my_uuid }, function() {
		console.log('client token:', my_uuid);
	});
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([{
		conditions: [new chrome.declarativeContent.PageStateMatcher({
			pageUrl: {hostEquals: 'www.netflix.com'},
		})
		],
			actions: [new chrome.declarativeContent.ShowPageAction()]
		}]);
	});
});