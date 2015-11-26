function logCruncher(rawtext, filter) {
  return new Promise(function (resolve, reject) {
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
    resolve(JSONArray);
  });
}

function testsFilter(parsedLine) {
  var pattr = /^test_/;
  var pattr2 = /^(?:error)|(?:critical)/i;
  return (pattr.test(parsedLine.action) || (parsedLine.action=="log" && pattr2.test(parsedLine.level)));
}

function readFile(file) {
  return new Promise( function(resolve, reject) {
    var reader = new FileReader();
    var deferred = Promise.defer();
    reader.onload = function(progressEvent) {
      resolve(this.result);
    };
    reader.readAsText(file, "UTF-8");
  });
}
