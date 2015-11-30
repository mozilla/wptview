var LovefieldService = function() {
  // Following member variables are initialized within getDbConnection().
  this.db_ = null;
  this.tests = null;
  this.test_results = null;
};

/**
 * Initializes member variables that can't be initialized before getting a
 * connection to the database.
 * @private
 */
LovefieldService.prototype.onConnected_ = function() {
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
  var schemaBuilder = lf.schema.create('wptview', 1);
  schemaBuilder.createTable('tests').
      addColumn('id', lf.Type.INTEGER).
      addColumn('test', lf.Type.STRING).
      addPrimaryKey(['id'], true);
  schemaBuilder.createTable('test_results').
      addColumn('result_id', lf.Type.INTEGER).
      addColumn('status', lf.Type.STRING).
      addColumn('message', lf.Type.STRING).
      addColumn('test_id', lf.Type.INTEGER).
      addPrimaryKey(['result_id'], true).
      addForeignKey('fk_test_id', {
        local: 'test_id',
        ref: 'tests.id'
      });

  return schemaBuilder;
};


var testLogsRaw;


LovefieldService.prototype.insertTests = function(testLogsRaw) {
  var testRows = [];
  var tests = this.tests;
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_start") {
      var row = tests.createRow({
        'test': testLog.test
      });
      testRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(tests).
      values(testRows);
  return q1.exec();
};

LovefieldService.prototype.insertTestResults = function(testLogsRaw, tests) {
  // Let's first create a test to id mapping
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
        'test_id': resultId
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
  var tx = this.db_.createTransaction();
  return tx.exec([q1, q2]);
}