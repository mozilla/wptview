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
      .then(function(logData) {return logCruncher(logData, testsFilter)})
      .then(function(data) {resultData = data})
      .then(function() {return lovefield.getDbConnection()})
      // Filling the test_runs table
      .then(function() {return lovefield.selectParticularRun(runName)})
      .then(function(testRuns) {return lovefield.insertTestRuns(runName, testRuns)})
      // Selecting current tests table, adding extra entries only
      .then(function(testRuns) {testRunData = testRuns; return lovefield.selectAllParentTests()})
      .then(function(parentTests) {return lovefield.insertTests(resultData, parentTests)})
      .then(function() {return lovefield.selectAllParentTests()})
      // populating results table with parent test results
      .then(function(tests) {testData = tests; return lovefield.insertTestResults(resultData, testData, testRunData)})
      // add subtests to tests table
      .then(function() {return lovefield.selectAllSubtests()})
      .then(function(subtests) {return lovefield.insertSubtests(resultData, testData, subtests)})
      .then(function() {return lovefield.selectAllSubtests()})
      // adding subtest results
      .then(function(subtests) {return lovefield.insertSubtestResults(resultData, subtests, testRunData)})
  }

  ResultsModel.prototype.getResults = function(filter) {
    var lovefield = this.service;
    return lovefield.selectFilteredResults(filter);
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
  $scope.filter = {
    "negate": false,
    "run": "",
    "status": ""
  }
  var resultsModel = new ResultsModel();
  $scope.uploadFile = function () {
    var evt = $scope.fileEvent;
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, $scope.run_name)
    .then(() => resultsModel.getRuns())
    .then((runs) => {
      $scope.runs = runs;
      console.log("Results added!");
      console.log($scope.runs);
      $scope.isGenerateDisabled = false;
      $scope.isFileEmpty = true;
      $scope.warning_message = $scope.warnings.length + " warnings found.";
      $scope.$apply();
    });
  }

  $scope.fillTable = function() {
    console.log($scope.filter);
    resultsModel.getResults($scope.filter).then(function(results) {
      console.log(results);
      var finalResults = organizeResults(results);
      console.log(finalResults);
      $scope.results = finalResults;
      $scope.$apply();
    });
  }

  $scope.clearTable = function() {
    resultsModel.removeResults().then(function() {
      console.log("Table successfully cleared!");
      $scope.results = {};
      $scope.runs = {};
      $scope.isGenerateDisabled = true;
      $scope.$apply();
    });
  }

  $scope.newFile = function(evt) {
    $scope.isFileEmpty = false;
    $scope.fileEvent = evt;
    $scope.$apply();
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
        'expected': result.expected,
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
});