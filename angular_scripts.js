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

  ResultsModel.prototype.addResultsFromLogs = function (file, run_name) {
    var lovefield = this.service;
    var resultData = null;
    var testData = null;
    var testRunData = null;
    return readFile(file)
      .then(function(logData) {return logCruncher(logData, testsFilter)})
      .then(function(data) {resultData = data})
      .then(function() {return lovefield.getDbConnection()})
      // Filling the test_runs table
      .then(function() {return lovefield.insertTestRuns(run_name)})
      // Selecting current tests table, adding extra entries only
      .then(function(test_runs) {testRunData = test_runs; return lovefield.selectAllParentTests()})
      .then(function(parent_tests) {return lovefield.insertTests(resultData, parent_tests)})
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

  ResultsModel.prototype.getResults = function() {
    var lovefield = this.service;
    return lovefield.selectNTests();
  }

  ResultsModel.prototype.removeResults = function() {
    var lovefield = this.service;
    return lovefield.deleteEntries();
  }

  return ResultsModel;
});

app.controller('wptviewController', function($scope, ResultsModel) {
  $scope.results = {};
  $scope.isGenerateDisabled = true;
  var resultsModel = new ResultsModel();
  $scope.uploadFile = function (evt) {
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, "Firefox").then(function() {
      console.log("Results added!");
      $scope.isGenerateDisabled = false;
      $scope.$apply();
    });
  }
  $scope.fillTable = function() {
    resultsModel.getResults().then(function(results) {
      console.log(results);
      $scope.results = results;
      $scope.$apply();
    });
  }
  $scope.clearTable = function() {
    resultsModel.removeResults().then(function() {
      console.log("Table successfully cleared!");
      $scope.results = {};
      $scope.isGenerateDisabled = true;
      $scope.$apply();
    });
  }
});