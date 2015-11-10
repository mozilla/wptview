function logCruncher(rawtext) {
  var JSONArray = [];
  var lines = rawtext.split('\n');
  for (var i=0; i<lines.length; i++) {
    if (lines[i]=="") {
      continue;
    }
    var json = JSON.parse(lines[i]);
    if (filterOutput(json)) {
      JSONArray.push(json);
    }
  }
  console.log(lines.length+", ");
  return JSONArray;
}

function logParameter(parameter, valueRegex) {
  this.parameter = parameter;
  this.valueRegex = valueRegex;
}
logParameter.prototype = {

}

function filterOutput(parsedLine) {
  var isValidOutput = false;
  var validTestEntries = [
    [ new logParameter("action", /^test/) ],
    [ new logParameter("action", /^log/), new logParameter("level", /^(error)|(critical)/i) ],
  ];
  validTestEntries.forEach(function(validTestEntry) {
    var isValidTestEntry = true;
    validTestEntry.forEach(function(logParameter) {
      var pattr = logParameter.valueRegex;
      var result = pattr.test(parsedLine[logParameter.parameter]);
      if (!result) {
        isValidTestEntry = false;
      }
    });
    if (isValidTestEntry) {
      isValidOutput = true;
    }
  });
  return isValidOutput;
}