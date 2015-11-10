function logCruncher(rawtext) {
  var JSONArray = [];
  var lines = rawtext.split('\n');
  for (var i=0; i<lines.length; i++) {
    if (lines[i]=="") {
      continue;
    }
    var json = JSON.parse(lines[i]);
    JSONArray.push(json);
  }
  return JSONArray;
}