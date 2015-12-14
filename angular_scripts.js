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

app.factory('ResultsModel',function() {
  var ResultsModel = function() {
    this.service = new LovefieldService();
  }

  ResultsModel.prototype.addResultsFromLogs = function (file, runName) {
    var lovefield = this.service;
    var resultData = null;
    var testData = null;
    var testRunData = null;
    return readFile(file)
      .then((logData) => {return logCruncher(logData, testsFilter)})
      .then((data) => {resultData = data})
      .then(() => {return lovefield.getDbConnection()})
      // Filling the test_runs table
      .then(() => {return lovefield.selectParticularRun(runName)})
      .then((testRuns) => {return lovefield.insertTestRuns(runName, testRuns)})
      // Selecting current tests table, adding extra entries only
      .then((testRuns) => {testRunData = testRuns; return lovefield.selectAllParentTests()})
      .then((parentTests) => {return lovefield.insertTests(resultData, parentTests)})
      .then(() => {return lovefield.selectAllParentTests()})
      // populating results table with parent test results
      .then((tests) => {testData = tests; return lovefield.insertTestResults(resultData, testData, testRunData)})
      // add subtests to tests table
      .then(() => {return lovefield.selectAllSubtests()})
      .then((subtests) => {return lovefield.insertSubtests(resultData, testData, subtests)})
      .then(() => {return lovefield.selectAllSubtests()})
      // adding subtest results
      .then((subtests) => {return lovefield.insertSubtestResults(resultData, subtests, testRunData)})
  }

  ResultsModel.prototype.getResults = function(filter, pathFilter) {
    var lovefield = this.service;
    return lovefield.selectFilteredResults(filter, pathFilter);
  }

  ResultsModel.prototype.removeResults = function() {
    var lovefield = this.service;
    return lovefield.deleteEntries();
  }

  ResultsModel.prototype.getRuns = function() {
    var lovefield = this.service;
    return lovefield.getRuns();
  }

  return ResultsModel;
});

app.controller('wptviewController', function($scope, ResultsModel) {
  $scope.results = {};
  $scope.warning_message = "";
  $scope.warnings = [];
  $scope.isGenerateDisabled = true;
  $scope.isFileEmpty = true;
  $scope.filter = [];
  $scope.pathFilter = [];
  var runIndex = {};
  var resultsModel = new ResultsModel();

  $scope.range = function(min, max, step) {
      step = step || 1;
      var input = [];
      for (var i = min; i < max; i += step) {
          input.push(i);
      }
      return input;
  };

  $scope.uploadFile = function () {
    var evt = $scope.fileEvent;
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, $scope.run_name)
    .then(() => resultsModel.getRuns())
    .then((runs) => {
      $scope.runs = runs;
      console.log("Results added!");
      console.log($scope.runs);
      $scope.runs.forEach((run, i) => {
        runIndex[run.run_id] = i;
      });
      $scope.isGenerateDisabled = false;
      $scope.isFileEmpty = true;
      $scope.warning_message = $scope.warnings.length + " warnings found.";
      $scope.$apply();
    });
  }

  $scope.fillTable = function() {
    console.log($scope.pathFilter);
    console.log($scope.filter);
    resultsModel.getResults($scope.filter, $scope.pathFilter)
    .then((results) => {
      var finalResults = organizeResults(results);
      console.log(finalResults);
      $scope.results = finalResults;
      $scope.$apply();
    });
  }

  $scope.clearTable = function() {
    resultsModel.removeResults()
    .then(() => {
      console.log("Table successfully cleared!");
      $scope.results = {};
      $scope.runs = {};
      $scope.warnings = [];
      $scope.isGenerateDisabled = true;
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