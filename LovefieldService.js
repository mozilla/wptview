var LovefieldService = function() {
  // Following member variables are initialized within getDbConnection().
  this.db_ = null;
  this.test_runs = null;
  this.tests = null;
  this.test_results = null;
};

/**
 * Initializes member variables that can't be initialized before getting a
 * connection to the database.
 * @private
 */
LovefieldService.prototype.onConnected_ = function() {

  this.test_runs = this.db_.getSchema().table('test_runs');
  this.tests = this.db_.getSchema().table('tests');
  this.test_results = this.db_.getSchema().table('test_results');
};


/**
 * Instantiates the DB connection (re-entrant).
 * @return {!IThenable<!lf.Database>}
 */
LovefieldService.prototype.getDbConnection = function() {
  if (this.db_ != null) {
    return this.db_;
  }
  var connectOptions = {storeType: lf.schema.DataStoreType.INDEXED_DB};
  return this.buildSchema_().connect(connectOptions).then(
      function(db) {
        this.db_ = db;
        this.onConnected_();
        return db;
      }.bind(this));
};


/**
 * Builds the database schema.
 * @return {!lf.schema.Builder}
 * @private
 */
LovefieldService.prototype.buildSchema_ = function() {
  var schemaBuilder = lf.schema.create('wptview4', 1);
  schemaBuilder.createTable('test_runs').
      addColumn('run_id', lf.Type.INTEGER).
      addColumn('name', lf.Type.STRING).
      addPrimaryKey(['run_id'],true);
  schemaBuilder.createTable('tests').
      addColumn('id', lf.Type.INTEGER).
      addColumn('test', lf.Type.STRING).
      addColumn('parent_id',lf.Type.INTEGER).
      addColumn('title',lf.Type.STRING).
      addNullable(['parent_id','title']).
      addPrimaryKey(['id'], true);
  schemaBuilder.createTable('test_results').
      addColumn('result_id', lf.Type.INTEGER).
      addColumn('status', lf.Type.STRING).
      addColumn('message', lf.Type.STRING).
      addColumn('test_id', lf.Type.INTEGER).
      addColumn('run_id', lf.Type.INTEGER).
      addPrimaryKey(['result_id'], true).
      addForeignKey('fk_test_id', {
        local: 'test_id',
        ref: 'tests.id'
      }).
      addForeignKey('fk_run_id', {
        local: 'run_id',
        ref: 'test_runs.run_id'
      });

  return schemaBuilder;
};


var testLogsRaw;

LovefieldService.prototype.insertTestRuns = function(run_name) {
  var testRunRows = [];
  var test_runs = this.test_runs;
  testRunRows.push(test_runs.createRow({
    'name': run_name
  }));
  var q1 = this.db_.
      insert().
      into(test_runs).
      values(testRunRows);
  return q1.exec();
}

LovefieldService.prototype.insertTests = function(testLogsRaw, currentTests) {
  var testRows = [];
  var tests = this.tests;
  var currentTestMap = {};
  currentTests.forEach(function(currentTest) {
    currentTestMap[currentTest.test]=currentTest;
  });
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_start" && !(testLog.test in currentTestMap)) {
      var row = tests.createRow({
        'test': testLog.test,
      });
      testRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(tests).
      values(testRows);
  return q1.exec();
}

LovefieldService.prototype.insertTestResults = function(testLogsRaw, tests, test_runs) {
  // Let's first create a test to id mapping
var test_run_id = test_runs[0].run_id;
  testIds = {};
  tests.forEach(function(test) {
    testIds[test.test] = test.id;
  });
  var testResultsRows = [];
  var test_results = this.test_results;
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_end") {
      var resultId = testIds[testLog.test];
      var row = test_results.createRow({
        'status': testLog.status,
        'message': testLog.message,
        'test_id': resultId,
        'run_id': test_run_id
      });
      testResultsRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(test_results).
      values(testResultsRows);
  return q1.exec();
}

LovefieldService.prototype.insertSubtests = function(testLogsRaw, tests, currentSubtests) {
  testIds = {};
  tests.forEach(function(test) {
    testIds[test.test] = test.id;
  });
  var subtestRows = [];
  var tests = this.tests;
  var currentSubtestMap = {};
  currentSubtests.forEach(function(currentSubtest) {
    if (!(currentSubtest.test in currentSubtestMap))
      currentSubtestMap[currentSubtest.test] = {};
    currentSubtestMap[currentSubtest.test][currentSubtest.title] = currentSubtest;
  });
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_status" && (!(testLog.test in currentSubtestMap) || !(testLog.subtest in currentSubtestMap[testLog.test]))) {
      var row = tests.createRow({
        'test': testLog.test,
        'parent_id': testIds[testLog.test],
        'title': testLog.subtest
      });
      subtestRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(tests).
      values(subtestRows);
  return q1.exec();
}

LovefieldService.prototype.insertSubtestResults = function(testLogsRaw, subtests, test_runs) {
  subtestIds = {};
  var test_run_id = test_runs[0].run_id;
  subtests.forEach(function(subtest) {
    if (!(subtest.test in subtestIds))
      subtestIds[subtest.test] = {};
    subtestIds[subtest.test][subtest.title] = subtest.id;
  });
  var subtestResultsRows = [];
  var test_results = this.test_results;
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_status") {
      var resultId = subtestIds[testLog.test][testLog.subtest];
      var row = test_results.createRow({
        'status': testLog.status,
        'message': testLog.message,
        'test_id': resultId,
        'run_id': test_run_id
      });
      subtestResultsRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(test_results).
      values(subtestResultsRows);
  return q1.exec();
}

LovefieldService.prototype.selectAllParentTests = function() {
  var tests = this.tests;
  return this.db_.
    select().
    from(tests).
    where(tests.parent_id.eq(null)).
    exec();
}

LovefieldService.prototype.selectAllSubtests = function() {
  var tests = this.tests;
  return this.db_.
    select().
    from(tests).
    where(tests.parent_id.neq(null)).
    exec();
}

LovefieldService.prototype.selectNTests = function() {
  var tests = this.tests;
  var test_results = this.test_results;
  return this.db_.
    select(tests.test.as("test"), test_results.message.as("message"), test_results.status.as("status")).
    from(tests).
    innerJoin(test_results, tests.id.eq(test_results.test_id)).
    where(tests.id.lt(40)).
    orderBy(tests.id).
    exec();
}

LovefieldService.prototype.deleteEntries = function() {
  var q1 = this.db_.delete().from(this.tests);
  var q2 = this.db_.delete().from(this.test_results);
  var q3 = this.db_.delete().from(this.test_runs);
  var tx = this.db_.createTransaction();
  return tx.exec([q1, q2, q3]);
}