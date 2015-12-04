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

  ResultsModel.prototype.getResults = function() {
    var lovefield = this.service;
    return lovefield.selectNTests();
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
  var resultsModel = new ResultsModel();
  $scope.uploadFile = function () {
    var evt = $scope.fileEvent;
    var file = evt.target.files[0];
    resultsModel.addResultsFromLogs(file, $scope.run_name).then(function() {
      console.log("Results added!");
      $scope.isGenerateDisabled = false;
      $scope.isFileEmpty = true;
      $scope.warning_message = $scope.warnings.length + " warnings found.";
      $scope.$apply();
    });
  }
  $scope.fillTable = function() {
    resultsModel.getRuns().then(function(runs) {
      resultsModel.getResults().then(function(results) {
        console.log(results);

        $scope.runs = runs;
        var final_results = $scope.organizeResults(results);
        console.log(final_results);
        $scope.results = final_results;
        $scope.$apply();
      });
    });
  }

  $scope.organizeResults = function(results) {
    var testMap = {};
    results.forEach(function(result) {
      if (!testMap.hasOwnProperty(result.test)) {
        testMap[result.test]={};
      }
      if (!testMap[result.test].hasOwnProperty(result.title)) {
        testMap[result.test][result.title]=[];
      }
      testMap[result.test][result.title].push({
        'run_id': result.run_id,
        'run_name': result.run_name,
        'status': result.status,
        'message': result.message
      });
    });
    var final_results = [];
    for (var test in testMap) {
      for (var subtest in testMap[test]) {
        final_results.push({
          'test': test,
          'subtest': subtest,
          'runs': testMap[test][subtest]
        });
      }
    }
    return final_results;
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
});