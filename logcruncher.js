function logCruncher(rawtext, filter) {
  var JSONArray = [];
  var lines = rawtext.split('\n');
  for (var i=0; i<lines.length; i++) {
    if (lines[i]=="") {
      continue;
    }
    var json = JSON.parse(lines[i]);
    if (filter(json)) {
      JSONArray.push(json);
    }
  }
  return JSONArray;
}

function testsFilter(parsedLine) {
  var pattr = /^test_/;
  var pattr2 = /^(?:error)|(?:critical)/i;
  if (pattr.test(parsedLine.action) || (parsedLine.action=="log" && pattr2.test(parsedLine.level))) {
    return true;
  }
  else {
    return false;
  }
}