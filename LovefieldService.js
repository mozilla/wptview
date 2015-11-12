var LovefieldService = function() {
  // Following member variables are initialized within getDbConnection().
  this.db_ = null;
  this.tests = null;
};

/**
 * Initializes member variables that can't be initialized before getting a
 * connection to the database.
 * @private
 */
LovefieldService.prototype.onConnected_ = function() {
  this.tests = this.db_.getSchema().table('tests');
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
      addColumn('test_id', lf.Type.INTEGER).
      addPrimaryKey(['id'],true);

  return schemaBuilder;
};


var testLogsRaw;


LovefieldService.prototype.insertData = function(testLogsRaw) {
  var testRows = [];
  var tests = this.tests;
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_start") {
      var row = tests.createRow({
        'test_id': testLog.test
      });
      testRows.push(row);
    }
  });
  var q1 = this.db_.
      insert().
      into(this.tests).
      values(testRows);
  return q1.exec();
};