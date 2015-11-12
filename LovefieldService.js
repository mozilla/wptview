var LovefieldService = function() {
  // Following member variables are initialized within getDbConnection().
  this.db_ = null;
  this.testStart = null;
};

/**
 * Initializes member variables that can't be initialized before getting a
 * connection to the database.
 * @private
 */
LovefieldService.prototype.onConnected_ = function() {
  this.testStart = this.db_.getSchema().table('test_start');
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
  schemaBuilder.createTable('test_start').
      addColumn('id', lf.Type.INTEGER).
      addColumn('test_id', lf.Type.INTEGER).
      addPrimaryKey(['id'],true);

  return schemaBuilder;
};


var testLogsRaw;


LovefieldService.prototype.insertData = function(testLogsRaw) {
  var testStartRows = [];
  var testStart = this.testStart;
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action=="test_start") {
      var row = testStart.createRow({
        'test_id': testLog.test
      });
      testStartRows.push(row);  
    }
  });
  var q1 = this.db_.
      insert().
      into(this.testStart).
      values(testStartRows);
  return q1.exec();
};