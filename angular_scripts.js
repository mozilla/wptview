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
    return readFile(file).then(function(result) {
      var JSONArray = logCruncher(result, testsFilter);
      console.log(JSONArray);
      return lovefield.getDbConnection().then(function(db) {
        return lovefield.insertTests(JSONArray).then(function(results) {
          console.log("Tests successfully added!");
          return lovefield.insertTestResults(JSONArray, results).then(function() {
            console.log("Test results successfully added!");
          });
        });
      });
    });
  }

  ResultsModel.prototype.getResults = function() {
    var lovefield = this.service;
    return lovefield.selectNTests();
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
});