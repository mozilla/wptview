function logCruncher(rawtext, filter) {
  var JSONArray = [];
  var deferred = Promise.defer();
  setTimeout(function() {
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
    deferred.resolve(JSONArray);
  },0);
  return deferred.promise;
}

function testsFilter(parsedLine) {
  var pattr = /^test_/;
  var pattr2 = /^(?:error)|(?:critical)/i;
  return (pattr.test(parsedLine.action) || (parsedLine.action=="log" && pattr2.test(parsedLine.level)));
}

function readFile(file) {
  var reader = new FileReader();
  var deferred = Promise.defer();
  reader.onload = function(progressEvent) {
    deferred.resolve(this.result);
  };
  reader.readAsText(file, "UTF-8");
  return deferred.promise;
}
