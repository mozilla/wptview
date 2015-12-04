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
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(progressEvent) {
      resolve(this.result);
    };
    reader.readAsText(file, "UTF-8");
  });
}

function updateWarnings(test, subtest) {
    var scope = angular.element(document.getElementById("wptview")).scope();
    scope.$apply(function() {
        scope.warnings.push({test: test, subtest: subtest});
    })
}

function organizeResults(results) {
  var testMap = {};
  results.forEach(function(result) {
    if (!testMap.hasOwnProperty(result.test)) {
      testMap[result.test] = {};
    }
    if (!testMap[result.test].hasOwnProperty(result.title)) {
      testMap[result.test][result.title] = [];
    }
    testMap[result.test][result.title].push({
      'run_id': result.run_id,
      'run_name': result.run_name,
      'status': result.status,
      'message': result.message
    });
  });
  var finalResults = [];
  for (var test in testMap) {
    for (var subtest in testMap[test]) {
      finalResults.push({
        'test': test,
        'subtest': subtest,
        'runs': testMap[test][subtest]
      });
    }
  }
  return finalResults;
}
