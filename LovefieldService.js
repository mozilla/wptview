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
    return new Promise((resolve) => resolve(this.db_));
  }
  var connectOptions = {storeType: lf.schema.DataStoreType.INDEXED_DB};
  return this.buildSchema_().connect(connectOptions).then((db) => {
    this.db_ = db;
    this.onConnected_();
    return db;
  });
};


/**
 * Builds the database schema.
 * @return {!lf.schema.Builder}
 * @private
 */
LovefieldService.prototype.buildSchema_ = function() {
  var schemaBuilder = lf.schema.create('wptview', 1);
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
      addColumn('expected', lf.Type.STRING).
      addColumn('status', lf.Type.STRING).
      addColumn('message', lf.Type.STRING).
      addColumn('test_id', lf.Type.INTEGER).
      addColumn('run_id', lf.Type.INTEGER).
      addPrimaryKey(['result_id'], true).
      addNullable(['message']).
      addUnique("unique_fk", ['run_id', 'test_id']).
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

LovefieldService.prototype.insertTestRuns = function(runName, testRuns) {
  if (testRuns.length != 0) {
    return new Promise(function(resolve, reject) {
      resolve(testRuns);
    });
  }
  var testRunRows = [];
  var test_runs = this.test_runs;
  testRunRows.push(test_runs.createRow({
    'name': runName
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
  // We create an associative array whose keys are tests that have been added
  // in previous insert queries.
  currentTests.forEach(function(currentTest) {
    currentTestMap[currentTest.test] = 1;
  });
  // This is a list of the tests currently being added with keys being tests.
  // It differs from testRows as testRows is a special lovefield object.
  var testsBeingAdded = {};
  testLogsRaw.forEach(function(testLog) {
    // First set of checks to ensure log has "action" set to "test_start"
    // and does not exist in table. (We don't want to add duplicates!)
    if (testLog.action == "test_start" && !(testLog.test in currentTestMap)) {
      // Checks whether this test is already present in the insert query array.
      if (testsBeingAdded.hasOwnProperty(testLog.test)) {
        // Notify UI as this is an anomaly.
        updateWarnings(testLog.test);
      } else {
        // Add it to the set of keys
        testsBeingAdded[testLog.test] = 1;
        var row = tests.createRow({
          'test': testLog.test,
        });
        testRows.push(row);
      }
    }
  });
  var q1 = this.db_.
      insert().
      into(tests).
      values(testRows);
  return q1.exec();
}

LovefieldService.prototype.insertTestResults = function(testLogsRaw, tests, testRuns) {
  // Let's first create a test to id mapping
  var testRunId = testRuns[0].run_id;
  testIds = {};
  tests.forEach(function(test) {
    testIds[test.test] = test.id;
  });
  var testResultsRows = [];
  var test_results = this.test_results;
  // As in insertTests(), support added to ensure no duplicate entries are added
  // in same select query.
  var testResultsBeingAdded = {};
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_end") {
      // Duplicate found in same insert query array.
      if (!testResultsBeingAdded.hasOwnProperty(testLog.test)) {
        // Add it to set of keys
        testResultsBeingAdded[testLog.test] = 1;
        var resultId = testIds[testLog.test];
        var row = test_results.createRow({
          'status': testLog.status,
          'message': testLog.message,
          'test_id': resultId,
          'run_id': testRunId,
          'expected': testLog.hasOwnProperty("expected") ? testLog.expected : "PASS"
        });
        testResultsRows.push(row);
      }
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
  // Creating a 2-D hash map to store existing subtests in the table inserted
  // via previous insert queries. The first dimension corresponds to test,
  // and the second dimension corresponds to subtest.
  var currentSubtestMap = {};
  currentSubtests.forEach(function(currentSubtest) {
    if (!currentSubtestMap.hasOwnProperty(currentSubtest.test)) {
      currentSubtestMap[currentSubtest.test] = {};
    }
    currentSubtestMap[currentSubtest.test][currentSubtest.title] = 1;
  });

  // Similarly, creating a 2-D hash map for tests being added in this insert query.
  var subtestsBeingAdded = {};
  testLogsRaw.forEach(function(testLog) {
    // Checking whether subtest hasn't been inserted previously to our test table.
    if (testLog.action == "test_status" && !(currentSubtestMap.hasOwnProperty(testLog.test) && currentSubtestMap[testLog.test].hasOwnProperty(testLog.subtest))) {
      // Checking whether this subtest has been added previously in the same insert query.
      if (subtestsBeingAdded.hasOwnProperty(testLog.test) && subtestsBeingAdded[testLog.test].hasOwnProperty(testLog.subtest)) {
        // Notify UI
        updateWarnings(testLog.test, testLog.subtest);
      } else {
        // Adding test-subtest pair to hash map subtestsBeingAdded
        if (!subtestsBeingAdded.hasOwnProperty(testLog.test)) {
          subtestsBeingAdded[testLog.test] = {};
        }
        subtestsBeingAdded[testLog.test][testLog.subtest] = 1;
        var row = tests.createRow({
          'test': testLog.test,
          'parent_id': testIds[testLog.test],
          'title': testLog.subtest
        });
        subtestRows.push(row);
      }
    }
  });
  var q1 = this.db_.
      insert().
      into(tests).
      values(subtestRows);
  return q1.exec();
}

LovefieldService.prototype.insertSubtestResults = function(testLogsRaw, subtests, testRuns) {
  subtestIds = {};
  var testRunId = testRuns[0].run_id;
  subtests.forEach(function(subtest) {
    if (!(subtest.test in subtestIds))
      subtestIds[subtest.test] = {};
    subtestIds[subtest.test][subtest.title] = subtest.id;
  });
  var subtestResultsRows = [];
  var test_results = this.test_results;
  var subtestResultsBeingAdded = {};
  testLogsRaw.forEach(function(testLog) {
    if (testLog.action == "test_status") {
      if (!(subtestResultsBeingAdded.hasOwnProperty(testLog.test) && subtestResultsBeingAdded[testLog.test].hasOwnProperty(testLog.subtest))) {
        if (!subtestResultsBeingAdded.hasOwnProperty(testLog.test)) {
          subtestResultsBeingAdded[testLog.test] = {};
        }
        subtestResultsBeingAdded[testLog.test][testLog.subtest] = 1;
        var resultId = subtestIds[testLog.test][testLog.subtest];
        var row = test_results.createRow({
          'status': testLog.status,
          'message': testLog.message,
          'test_id': resultId,
          'run_id': testRunId,
          'expected': testLog.hasOwnProperty("expected") ? testLog.expected : "PASS"
        });
        subtestResultsRows.push(row);
      }
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

LovefieldService.prototype.selectFilteredResults = function(filters, pathFilters,
                                                            minTestId, maxTestId, limit) {
  var lovefield = this;
  var tests = this.tests;
  var test_results = this.test_results;
  var test_runs = this.test_runs;

  var query = lovefield.db_.
    select(tests.id.as("test_id")).
    from(tests);
  var runs = [];

  // JOINs with results table
  var results = filters.map((filter, i) => {
    var alias = this.test_results.as('results' + i);
    query = query.leftOuterJoin(alias, tests.id.eq(alias.test_id));
    return alias;
  });

  // JOINs with runs table
  var runs = filters.map((filter, i) => {
    var alias = this.test_runs.as('runs' + i);
    query = query.innerJoin(alias, results[i].run_id.eq(alias.run_id));
    return alias;
  });

  // WHERE clause
  var whereConditions = [];
  filters.forEach((constraint, i) => {
    whereConditions.push(runs[i].name.eq(constraint.run));
    var status_op;
    if (constraint.equality == "is") {
      status_op = results[i].status.eq(constraint.status);
    } else if (constraint.equality == "is not") {
      status_op = results[i].status.neq(constraint.status);
    }
    whereConditions.push(status_op);
  });

  // working on path filter
  var pathOrConditions = {
    include: [],
    exclude: []
  }
  pathFilters.forEach((pathFilter) => {
    pathFilter.path = pathFilter.path.replace("\\", "/");
    var path_regex = escapeRegExp(pathFilter.path);
    var choice = pathFilter.choice.split(":");
    if (choice[1] == "start") {
      if (pathFilter.path.charAt(0) != "/") {
        path_regex = escapeRegExp("/" + pathFilter.path);
      }
      path_regex = "^" + path_regex;
    } else if (choice[1] == "end") {
      path_regex = path_regex + "$";
    }
    path_regex = new RegExp(path_regex, 'i');
    if (choice[0] == "include") {
      pathOrConditions.include.push(tests.test.match(path_regex));
    } else {
      pathOrConditions.exclude.push(tests.test.match(path_regex));
    }
    console.log(path_regex.toString());
  });

  if (pathOrConditions.include.length) {
    whereConditions.push(lf.op.or.apply(lf.op.or, pathOrConditions.include));
  }
  if (pathOrConditions.exclude.length) {
    whereConditions.push(lf.op.not(lf.op.or.apply(lf.op.or, pathOrConditions.exclude)));
  }

  orderByDir = lf.Order.ASC;
  if (minTestId) {
      whereConditions.push(tests.id.gt(minTestId))
  } else if (maxTestId) {
      whereConditions.push(tests.id.lt(maxTestId))
      orderByDir = lf.Order.DESC;
  }

  if (whereConditions.length) {
    var whereClause = lf.op.and.apply(lf.op.and, whereConditions);
    query = query.where(whereClause);
  }

  query = query.orderBy(tests.id, orderByDir);
  query = query.limit(limit);

  return query.exec()
  .then((test_ids) => {
    var test_list = test_ids.map((test) => test.test_id);
    console.log(test_list);

    // We need an additional query to select test results for ALL runs
    // for the tests filtered by q1. We need this unusual approach as
    // lovefield doesn't support subqueries.
    return lovefield.db_.
      select(
        tests.id.as("test_id"),
        tests.test.as("test"),
        test_results.message.as("message"),
        test_results.status.as("status"),
        test_results.expected.as("expected"),
        tests.title.as("title"),
        test_runs.run_id.as("run_id"),
        test_runs.name.as("run_name")
      )
      .from(tests)
      .innerJoin(test_results, tests.id.eq(test_results.test_id))
      .innerJoin(test_runs, test_results.run_id.eq(test_runs.run_id))
      .where(tests.id.in(test_list))
      .orderBy(tests.id)
      .orderBy(test_runs.run_id)
      .exec();
  });
}

LovefieldService.prototype.deleteEntries = function(run_id) {
  return this.getDbConnection().then((db) => {
    var test_results = this.test_results;
    var tests = this.tests;
    var test_runs = this.test_runs;
    var q1 = db.delete().from(test_results);
    var q2 = db.delete().from(test_runs);
    if (run_id) {
      q1 = q1.where(test_results.run_id.eq(run_id));
      q2 = q2.where(test_runs.run_id.eq(run_id));
    }
    var queries = [q1, q2];
    if (!run_id) {
      queries.push(db.delete().from(tests));
    }
    var tx = db.createTransaction();
    var rv = tx.exec(queries);
    if (run_id) {
      var keepIds = {};
      rv = rv
        .then(() => {
          // Can't do a leftOuterJoin in a delete
          // and doing
          // SELECT id FROM tests
          // LEFT OUTER JOIN test_results ON tests.id = test_results.test_id
          // WHERE test_results.test_id = null
          // returned all rows in tests, not just those with no matching row in test_results.
          // So we select all the tests with a matching result in one query, all the tests
          // in another query and take the difference in application code. This is silly.
          return db.select(tests.id)
            .from(tests)
            .innerJoin(test_results, tests.id.eq(test_results.test_id))
            .exec();
        })
        .then((ids) => {
          ids.forEach((id) => keepIds[id] = true);
          return db.select(tests.id)
            .from(tests)
            .exec();
        })
        .then((allIds) => {
          var removeIds = allIds.filter((x) => !keepIds.hasOwnProperty(x));
          return db.delete()
            .from(tests)
            .where(tests.id.in(removeIds))
            .exec();
        });
    }
    return rv;
  });
}

LovefieldService.prototype.selectParticularRun = function(runName) {
  var test_runs = this.test_runs;
  return this.db_.
    select().
    from(test_runs).
    where(test_runs.name.eq(runName)).
    exec();
}

LovefieldService.prototype.getRuns = function() {
  var db = null;
  var service = this;
  var test_runs = null;
  var test_results = null;
  var counts = {};
  return this.getDbConnection()
    .then((db_conn) => {
      db = db_conn;
      test_runs = this.test_runs;
      test_results = this.test_results;
      return db.select(test_runs.run_id, lf.fn.count(test_results.result_id).as('count'))
        .from(test_runs)
        .innerJoin(test_results, test_results.run_id.eq(test_runs.run_id))
        .groupBy(test_runs.run_id)
        .exec()
    })
    .then((count_data) => {
      // Lovefield doesn't allow us to grab all the data from test_runs and the counts
      // in a single query
      count_data.forEach((x) => counts[x.test_runs.run_id] = x.count);
      return db.select().from(test_runs).exec()
    })
    .then((data) => {
      data.forEach((x) => x.count = counts[x.run_id]);
      return data;
    });
}
