function LogCruncher(rawtext) {
	this.JSONArray = [];
	var lines = rawtext.split('\n');
	for (var i=0; i<lines.length; i++) {
		if (lines[i]=="")
			continue;
		var json = JSON.parse(lines[i]);
		this.JSONArray.push(json);
	}
}

LogCruncher.prototype = {
	
};