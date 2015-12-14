var app = angular.module('wptview', []);

app.directive('customOnChange', function() {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.customOnChange);
      element.bind('change', onChangeHandler);
    }
  };
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

  ResultsModel.prototype.addResultsFromLogs = function (file, runName) {
    var lovefield = this.service;
    var resultData = null;
    var testData = null;
    var testRunData = null;
    var duplicates = null;
    return this.logReader.run("read", [file])
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
  ResultsModel.prototype.getResults = function(filter, pathFilter, minTestId, maxTestId, limit, testTypeFilter) {
    return this.service.run("selectFilteredResults",
                            [filter, pathFilter, minTestId, maxTestId, limit, testTypeFilter]);
  }

  ResultsModel.prototype.removeResults = function(run_id) {
    return this.service.run("deleteEntries", [run_id]);
  }

  ResultsModel.prototype.getRuns = function() {
    return this.service.run("getRuns");
  }

  return ResultsModel;
});

app.controller('wptviewController', function($scope, ResultsModel) {
  $scope.results = null;
  $scope.warnings = [];
  $scope.showImport = false;
  $scope.filter = [];
  $scope.pathFilter = [];
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
  $scope.testTypeFilter = "both";
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

  $scope.uploadFile = function () {
    $scope.busy = true;
    var evt = $scope.fileEvent;
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, $scope.upload.runName)
    .then((duplicates) => updateWarnings(duplicates))
    .then(updateRuns)
    .then(() => {
      $scope.isFileEmpty = true;
      $scope.upload.runName = "";
      $scope.busy = false;
      $scope.$apply();
    });
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

  $scope.fillTable = function(page) {
    var minTestId = null;
    var maxTestId = null;

    $scope.busy = true;

    if (page == "next") {
      var minTestId = $scope.resultsView.maxTestId;
    } else if (page == "prev") {
      var maxTestId = $scope.resultsView.minTestId;
    }

    resultsModel.getResults($scope.filter, $scope.pathFilter, minTestId, maxTestId,
                            $scope.resultsView.limit, $scope.testTypeFilter)
      .then((results) => {
        if (!page) {
          $scope.resultsView.firstTestId = results[0].test_id;
        }
        $scope.resultsView.lastPage = results.length < $scope.resultsView.limit;
        $scope.resultsView.firstPage = results[0].test_id === $scope.resultsView.firstTestId;
        $scope.resultsView.minTestId = results[0].test_id;
        $scope.resultsView.maxTestId = results[results.length - 1].test_id;
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
    $scope.filter.push({
      run : "",
      equality : "is",
      status : ""
    });
  }

  $scope.deleteConstraint = function() {
    $scope.filter.pop();
  }

  $scope.addPath = function() {
    $scope.pathFilter.push({
      choice: "include:start",
      path: ""
    });
  }

  $scope.deletePath = function() {
    $scope.pathFilter.pop();
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
