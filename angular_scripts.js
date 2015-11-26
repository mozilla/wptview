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

app.factory('Lovefield',function() {
  var Lovefield = function() {
    this.service = new LovefieldService();
  }
  return Lovefield;
});

app.controller('wptviewController', function($scope, Lovefield) {
  var lovefield = (new Lovefield()).service;
  $scope.results = {};
  $scope.uploadFile = function (evt) {
    var file = evt.target.files[0];
    var reader = new FileReader();
    reader.onload = function(progressEvent) {
      var JSONArray = logCruncher(this.result, testsFilter);
      console.log(JSONArray);
      lovefield.getDbConnection().then( function(db) {
        lovefield.insertTests(JSONArray).then(function(results) {
          console.log("Tests successfully added!");
          lovefield.insertTestResults(JSONArray, results).then(function() {
            console.log("Test results successfully added!");
          });
        });
      });
    };
    reader.readAsText(file, "UTF-8");
  }
  $scope.fillTable = function() {
    lovefield.selectNTests().then(function(results) {
      console.log(results);
      $scope.results = results;
      $scope.$apply();
    });
  }
});