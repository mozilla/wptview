var app = angular.module('wptview', ['angularSpinner']);

app.directive('customOnChange', function() {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.customOnChange);
      element.bind('change', onChangeHandler);
    }
  };
});

app.filter('arrFilter', function() {
  return function(collection, currentRun) {
    var output = [];
    collection.forEach((item) => {
        if (currentRun != item.name && currentRun != "ALL") {
            output.push(item);
        }
    });
    return output;
  }
});

function WorkerService(workerScript) {
  this.msg_id = 0;
  this.resolvers = {};

  this.worker = new Worker(workerScript);
  this.worker.onmessage = function(event) {
    var msg_id = event.data[0];
    var data = event.data[1];
    if (!this.resolvers.hasOwnProperty(msg_id)) {
      throw Error("Unexpected message " + msg_id);
    }
    resolve = this.resolvers[msg_id];
    delete this.resolvers[msg_id];
    console.log(data);
    resolve(data);
  }.bind(this);
}

WorkerService.prototype.run = function(command, data) {
  var data = data || [];
  var msg = [this.msg_id++, command, data];
  this.worker.postMessage(msg);
  return new Promise((resolve) => {
    console.log("Adding resolver " + msg[0]);
    this.resolvers[msg[0]] = resolve;
  });
}

app.factory('ResultsModel',function() {
  var ResultsModel = function() {
    this.service = new WorkerService("LovefieldService.js");
    this.logReader = new WorkerService("logcruncher.js");
  }

  ResultsModel.prototype.addResultsFromLogs = function (source, runName, fetchFunc) {
    var lovefield = this.service;
    var resultData = null;
    var testData = null;
    var testRunData = null;
    var duplicates = null;
    return this.logReader.run(fetchFunc, [source])
      .then((data) => {resultData = data})
      // Filling the test_runs table
      .then(() => {return lovefield.run("selectParticularRun", [runName])})
      .then((testRuns) => {return lovefield.run("insertTestRuns", [runName, testRuns])})
      // Selecting current tests table, adding extra entries only
      .then((testRuns) => {testRunData = testRuns;
                           return lovefield.run("selectAllParentTests")})
      .then((parentTests) => {return lovefield.run("insertTests", [resultData, parentTests])})
      .then((insertData) => {
        duplicates = insertData[1];
        return lovefield.run("selectAllParentTests")
      })
      // populating results table with parent test results
      .then((tests) => {testData = tests;
                        return lovefield.run("insertTestResults",
                                             [resultData, testData, testRunData])})
      // add subtests to tests table
      .then(() => {return lovefield.run("selectAllSubtests")})
      .then((subtests) => {return lovefield.run("insertSubtests",
                                                [resultData, testData, subtests])})
      .then((subtestData) => {duplicates = duplicates.concat(subtestData[1]);
                              return lovefield.run("selectAllSubtests")})
      // adding subtest results
      .then((subtests) => {return lovefield.run("insertSubtestResults",
                                                [resultData, subtests, testRunData])})
      .then(() => duplicates);
  }

    /*
    Load the results of a specified number of tests, ordered by test id, either taking all
    results above a lower limit test id, all results below an upper limit id, or all results
    starting from the first test.
    Results may be filtered by various filters.
    @param {Object[]} filter - Array of filter definitions for the allowed test results.
    @param {} pathFilter - Array if filter definitions for the allowed test names.
    @param {(number|null)} minTestId - Exclusive lower bound on the test ID to load, or null if
                                     there is no lower limit.
    @param {(number|null)} maxTestId - Exclusive upper bound on the test ID to load, or null if
                                     there is no upper limit.
    @param {(number)} limit - Number of tests to load.
   */
  ResultsModel.prototype.getResults = function(filter, runs, minTestId, maxTestId, limit) {
    return this.service.run("selectFilteredResults",
                            [filter, runs, minTestId, maxTestId, limit]);
  }

  ResultsModel.prototype.removeResults = function(run_id) {
    return this.service.run("deleteEntries", [run_id]);
  }

  ResultsModel.prototype.getRuns = function() {
    return this.service.run("getRuns");
  }

  ResultsModel.prototype.editRunName = function(run_id, newRunName) {
    return this.service.run("editRunName", [run_id, newRunName])
  }

  return ResultsModel;
});

app.controller('wptviewController', function($scope, ResultsModel) {
  $scope.results = null;
  $scope.warnings = [];
  $scope.showImport = false;
  $scope.editSelected = false;
  $scope.busy = true;
  $scope.runs = null;
  $scope.upload = {};
  $scope.resultsView = {
      limit: 50,
      firstPage: true,
      lastPage: false,
      minTestId: null,
      maxTestId: null,
      firstTestId: null
  }
  $scope.filter = {
    "statusFilter": [],
    "pathFilter": [],
    "testTypeFilter": {
      type:"both"
    }
  }
  var runIndex = {};
  var resultsModel = new ResultsModel();

  function updateRuns() {
    var runs;
    return resultsModel.getRuns()
      .then((runsData) => runs = runsData)
      .then(() => {
        $scope.runs = runs;
        $scope.runs.forEach((run, i) => {
          runIndex[run.run_id] = i;
        });
      });
  }

  updateRuns().then(() => {
    $scope.busy = false;
    $scope.$apply();
  });

  function updateWarnings(duplicates) {
    $scope.$apply(function() {
      $scope.warnings = duplicates;
    })
  }

  $scope.range = function(min, max, step) {
      step = step || 1;
      var input = [];
      for (var i = min; i < max; i += step) {
          input.push(i);
      }
      return input;
  };

  $scope.fetchLog = function () {
     if ($scope.upload.logSrc == 'file') {
         $scope.uploadFile();
     } else if ($scope.upload.logSrc == 'url') {
         $scope.fetchFromUrl();
     }
  }

  $scope.uploadFile = function () {
    $scope.busy = true;
    var evt = $scope.fileEvent;
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, $scope.upload.runName, "read")
    .then((duplicates) => updateWarnings(duplicates))
    .then(updateRuns)
    .then(() => {
      $scope.isFileEmpty = true;
      $scope.upload.runName = "";
      $scope.busy = false;
      $scope.$apply();
    });
  }

  $scope.fetchFromUrl = function () {
    $scope.busy = true;
    resultsModel.addResultsFromLogs($scope.upload.logUrl, $scope.upload.runName, "readURL")
    .then((duplicates) => updateWarnings(duplicates))
    .then(updateRuns)
    .then(() => {
      $scope.upload.runName = "";
      $scope.busy = false;
      $scope.$apply();
    });
  }

  $scope.editName = function(rowNo, run_id) {
    if(!$scope.editSelected) {
      $scope.editSelected = true;
      var runs = [];
      var names = [];
      var runsTable = document.getElementById("runsTable");
      var nameCell = runsTable.rows[rowNo+1].cells[1];
      var prevName = nameCell.innerHTML;
      var edit_images = document.getElementsByName("edit");
      nameCell.innerHTML='<input type="text" id="currentEdit">';
      document.onkeydown = function(evt) {
        evt = evt || window.event;
        //Enter key to confirm name
        if (evt.keyCode == 13 && $scope.editSelected) {          
          var curName = document.getElementById("currentEdit").value;
          if(!(curName === null || curName.match(/^\s*$/) !== null)) {
            return resultsModel.getRuns()
              .then((runsData) => {
                runs = runsData;
                for(var i=0; i<runs.length ; i++) {
                  names.push(runs[i].name);
                }
                if(names.indexOf(curName) === -1) {
                  resultsModel.editRunName(run_id, curName)
                    .then(() => {console.log("Name successfully edited.");})
                  nameCell.innerHTML = curName;
                  prevName = nameCell.innerHTML;
                  $scope.editSelected = false;
                }
                else {
                  console.log("Name already exists in DB");
                  document.getElementById("currentEdit").style.borderColor = "red";
                }
              })
          }
          else {
            document.getElementById("currentEdit").style.borderColor = "red";
          }
        }
        //Escape key to exit edit mode
        else if (evt.keyCode == 27 && $scope.editSelected) {
          nameCell.innerHTML = prevName;
          $scope.editSelected = false;
        }
      };
    } 
  }  

  $scope.clearTable = function(run_id) {
    $scope.busy = true;
    resultsModel.removeResults(run_id)
      .then(() => {
        console.log("Table successfully cleared!");
        $scope.results = null;
        $scope.warnings = []})
    .then(updateRuns)
    .then(() => {
      $scope.busy = false;
      $scope.$apply();
    });
  }

  $scope.export = function() {
    $scope.busy = true;
    resultsModel.getResults($scope.filter, $scope.runs)
    .then((results) => {
      var finaljson = {};
      finaljson.runs = $scope.runs.map((run) => run.name);
      finaljson.results = {};
      var organizedResults = organizeResults(results);
      organizedResults.forEach((result) => {
        if (!finaljson.results.hasOwnProperty(result.test)) {
          finaljson.results[result.test] = [];
        }
        var run_results = result.runs.map((run) => [run.expected, run.status, run.message]);
        finaljson.results[result.test].push([result.subtest].concat(run_results));
      });
      saveData(finaljson, "result.json");
      $scope.busy = false;
      $scope.$apply();
    });
  }


  // http://jsfiddle.net/koldev/cw7w5/
  function saveData(data, fileName) {
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.style = "display: none";
    var json = JSON.stringify(data),
        blob = new Blob([json], {type: "octet/stream"}),
        url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  $scope.fillTable = function(page) {
    var minTestId = null;
    var maxTestId = null;

    $scope.busy = true;

    if (page === "next") {
      var minTestId = $scope.resultsView.maxTestId;
    } else if (page === "prev") {
      var maxTestId = $scope.resultsView.minTestId;
    }

    resultsModel.getResults($scope.filter, $scope.runs, minTestId, maxTestId, $scope.resultsView.limit)
      .then((results) => {
        if (results.length) {
          if (!page) {
            $scope.resultsView.firstTestId = results[0].test_id;
          }
          $scope.resultsView.lastPage = results.length < $scope.resultsView.limit;
          $scope.resultsView.firstPage = results[0].test_id === $scope.resultsView.firstTestId;
          $scope.resultsView.minTestId = results[0].test_id;
          $scope.resultsView.maxTestId = results[results.length - 1].test_id;
        } else {
          // We want to disable NEXT when we are on the last page
          $scope.resultsView.lastPage = true;
        }
        var finalResults = organizeResults(results);
        $scope.results = finalResults;
        $scope.busy = false;
        $scope.$apply();
      });
  }

  $scope.newFile = function(evt) {
    $scope.isFileEmpty = false;
    $scope.fileEvent = evt;
    $scope.$apply();
  }

  $scope.addConstraint = function() {
    $scope.filter.statusFilter.push({
      run : $scope.runs[0].name,
      equality : "is",
      status : ["PASS"]
    });
  }

  $scope.deleteConstraint = function() {
    $scope.filter.statusFilter.pop();
  }

  $scope.addOrConstraint = function(index) {
    $scope.filter.statusFilter[index].status.push("PASS");
  }

  $scope.deleteOrConstraint = function(index) {
    $scope.filter.statusFilter[index].status.pop();
  }

  $scope.addPath = function() {
    $scope.filter.pathFilter.push({
      choice: "include:start",
      path: ""
    });
  }

  $scope.deletePath = function() {
    $scope.filter.pathFilter.pop();
  }

  $scope.warning_message = function() {
    return $scope.warnings.length + " warnings found.";
  }

  function organizeResults(results) {
    var testMap = {};
    results.forEach(function(result) {
      if (result.title === undefined) {
        result.title = "";
      }
      if (!testMap.hasOwnProperty(result.test)) {
        testMap[result.test] = {};
      }
      if (!testMap[result.test].hasOwnProperty(result.title)) {
        testMap[result.test][result.title] = [];
        for (var i = 0; i < $scope.runs.length; i++) {
          testMap[result.test][result.title].push({
            'run_id': $scope.runs[i].run_id,
            'run_name': $scope.runs[i].run_name,
            'status': "",
            'expected': "",
            'message': ""
          });
        }
      }
      testMap[result.test][result.title][runIndex[result.run_id]] = {
        'run_id': result.run_id,
        'run_name': result.run_name,
        'status': result.status,
        'expected': result.expected,
        'message': result.message
      };
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
});