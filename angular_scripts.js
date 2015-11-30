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

  ResultsModel.prototype.addResultsFromLogs = function (file) {
    var lovefield = this.service;
    var resultData = null;
    return readFile(file)
      .then(function(logData) {return logCruncher(logData, testsFilter)})
      .then(function(data) {resultData = data})
      .then(function() {return lovefield.getDbConnection()})
      .then(function() {return lovefield.insertTests(resultData)})
      .then(function(tests) {return lovefield.insertTestResults(resultData, tests)})
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
    resultsModel.addResultsFromLogs(file).then(function() {
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