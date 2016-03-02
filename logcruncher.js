importScripts("workerApi.js");

onmessage = messageAdapter(new LogReader());

function LogReader() {}

LogReader.prototype.read = read(readFile);
LogReader.prototype.readURL = read(readURL);

function read(reader) {
  return (data) => {
    return reader(data)
      .then((logData) => {return getLogType(logData)();});
  };
}

function getLogType(logData) {
  var parsed = null;
  var mozlogParser = () => parseMozlog(logData, testsFilter);
  try {
    parsed = JSON.parse(logData);
  } catch(e) {
    return mozlogParser;
  }
  if (!parsed.hasOwnProperty("results")) {
    return mozlogParser;
  }
  return () => parseRunnerJSON(parsed);
}

function parseMozlog(rawtext, filter) {
  return new Promise(function (resolve, reject) {
    var JSONArray = [];
    var lines = rawtext.split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] === "") {
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

function parseRunnerJSON(parsedJson) {
  return new Promise((resolve, reject) => {
    var JSONArray = [];
    parsedJson.results.forEach((result) => {
      JSONArray.push({"action": "test_start",
                      "test": result.test});
      result.subtests.forEach((subtest) => {
        JSONArray.push({"action": "test_status",
                        "test": result.test,
                        "subtest": subtest.name,
                        "status": subtest.status,
                        "message": subtest.message});
      });
      JSONArray.push({"action": "test_end",
                      "test": result.test,
                      "status": result.status,
                      "message": result.message});
    });
    resolve(JSONArray);
  });
}

function testsFilter(parsedLine) {
  var pattr = /^test_/;
  var pattr2 = /^(?:error)|(?:critical)/i;
  return (pattr.test(parsedLine.action) || (parsedLine.action === "log" && pattr2.test(parsedLine.level)));
}

function readFile(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReaderSync();
    resolve(reader.readAsText(file, "UTF-8"));
  });
}

function readURL(url) {
  return new Promise(function(resolve, reject) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
      if (xhttp.readyState == 4) {
        if (xhttp.status == 200) {
          resolve(xhttp.responseText);
        } else {
          reject("HTTP request failed!");
        }
      }
    };
    xhttp.open('GET', url, false);
    xhttp.send();
  });
}
