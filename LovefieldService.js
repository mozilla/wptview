importScripts("workerApi.js");
importScripts("lf_scripts/lovefield.js");

onmessage = messageAdapter(new LovefieldService());

// http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex/6969486#6969486
function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function LovefieldService() {
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
      addColumn('enabled', lf.Type.BOOLEAN).
      addColumn('url', lf.Type.STRING).
      addNullable(['url']).
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

LovefieldService.prototype.insertTestRuns = function(runType, runName, testRuns) {
  if (testRuns.length != 0) {
    return new Promise(function(resolve, reject) {
      resolve(testRuns);
    });
  }
  var testRunRows = [];
  var test_runs = this.test_runs;
  testRunRows.push(test_runs.createRow({
    'name': runName,
    'enabled': true,
    'url': runType.url
  }));
  var q1 = this.db_.
      insert().
      into(test_runs).
      values(testRunRows);
  return q1.exec();
}

LovefieldService.prototype.switchRuns = function(run_ids, enabled) {
  var test_runs = this.test_runs;
  var q1 = this.db_.
      update(test_runs).
      set(test_runs.enabled, enabled).
      where(test_runs.run_id.in(run_ids));
  return q1.exec();
}


LovefieldService.prototype.insertTests = function(testLogsRaw, currentTests) {
  var testRows = [];
  var tests = this.tests;
  var currentTestMap = {};
  var duplicates = [];
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
    if (testLog.action === "test_start" && !(testLog.test in currentTestMap)) {
      // Checks whether this test is already present in the insert query array.
      if (testsBeingAdded.hasOwnProperty(testLog.test)) {
        // Notify UI as this is an anomaly.
        duplicates.push({test: testLog.test, subtest: null});
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
  return q1.exec().then((rows) => [rows, duplicates]);
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
    if (testLog.action === "test_end") {
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
          'expected': testLog.hasOwnProperty("expected") ? testLog.expected : testLog.status
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
  var duplicates = [];
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
    if (testLog.action === "test_status" && !(currentSubtestMap.hasOwnProperty(testLog.test) && currentSubtestMap[testLog.test].hasOwnProperty(testLog.subtest))) {
      // Checking whether this subtest has been added previously in the same insert query.
      if (subtestsBeingAdded.hasOwnProperty(testLog.test) && subtestsBeingAdded[testLog.test].hasOwnProperty(testLog.subtest)) {
        duplicates.push({test: testLog.test, subtest: testLog.subtest});
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
  return q1.exec().then((rows) => [rows, duplicates]);
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
    if (testLog.action === "test_status") {
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
          'expected': testLog.hasOwnProperty("expected") ? testLog.expected : testLog.status
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

LovefieldService.prototype.selectFilteredResults = function(filter, runs, minTestId, maxTestId, limit) {
  var lovefield = this;
  var tests = this.tests;
  var test_results = this.test_results;
  var test_runs = this.test_runs;

  var query = lovefield.db_.
    select(tests.id.as("test_id")).
    from(tests);

  var whereConditions = [];

  var joinRuns = {};
  filter.statusFilter.forEach((x) => {
    if (x.run == "ALL") {
      runs.forEach((run) => {
        if (run.enabled) {
          joinRuns[run.name] = 1;
        }
      });
    } else {
      joinRuns[x.run] = 1;
    }
    x.isRun = [];
    x.targets = [];
    x.status.forEach((status) => {
      if (status.startsWith("result_")) {
        x.isRun.push(true);
        var target = status.slice("result_".length);
        joinRuns[target] = 1;
        x.targets.push(target);
      } else {
        x.isRun.push(false);
        var target = status;
        x.targets.push(target);
      }
    });
  });
  // Account for the case where no status filters exist
  if (filter.statusFilter.length === 0) {
    runs.forEach((run) => {
      if (run.enabled) {
        joinRuns[run.name] = 1;
      }
    });
  }
  // JOINs with results and runs table
  var aliases = {};
  Object.keys(joinRuns).forEach((run) => {
    var resultAlias = this.test_results.as('results ' + run);
    query = query.leftOuterJoin(resultAlias, tests.id.eq(resultAlias.test_id));
    var runAlias = this.test_runs.as('run ' + run);
    query = query.innerJoin(runAlias, resultAlias.run_id.eq(runAlias.run_id));
    aliases[run] = {
      "runAlias": runAlias,
      "resultAlias": resultAlias
    };
    whereConditions.push(runAlias.name.eq(run));
  });

  // WHERE clause
  filter.statusFilter.forEach((constraint, i) => {
    var runConditions = [];
    var op = constraint.equality === "is" ? "eq" : "neq";
    var booleanOp = constraint.equality === "is" ? "or" : "and";
    if (constraint.run == "ALL") {
      runs.forEach((run) => {
        if (run.enabled) {
          runConditions = constraint.targets.map((x) => aliases[run.name].resultAlias.status[op](x));
          var condition = lf.op[booleanOp].apply(lf.op[booleanOp], runConditions);
          whereConditions.push(condition);
        }
      });
    } else {
      constraint.targets.forEach((x, j) => {
        var target = constraint.isRun[j] ? aliases[x].resultAlias.status : x;
        runConditions.push(aliases[constraint.run].resultAlias.status[op](target));
      });
      var condition = lf.op[booleanOp].apply(lf.op[booleanOp], runConditions);
      whereConditions.push(condition);
    }
  });

  // working on path filter
  var pathOrConditions = {
    include: [],
    exclude: []
  }
  filter.pathFilter.forEach((pathFilter) => {
    pathFilter.path = pathFilter.path.replace("\\", "/");
    var path_regex = escapeRegExp(pathFilter.path);
    var choice = pathFilter.choice.split(":");
    if (choice[1] === "start") {
      if (pathFilter.path.charAt(0) != "/") {
        path_regex = escapeRegExp("/" + pathFilter.path);
      }
      path_regex = "^" + path_regex;
    } else if (choice[1] === "end") {
      path_regex = path_regex + "$";
    }
    path_regex = new RegExp(path_regex, 'i');
    if (choice[0] === "include") {
      pathOrConditions.include.push(tests.test.match(path_regex));
    } else {
      pathOrConditions.exclude.push(tests.test.match(path_regex));
    }
  });

  if (pathOrConditions.include.length) {
    whereConditions.push(lf.op.or.apply(lf.op.or, pathOrConditions.include));
  }
  if (pathOrConditions.exclude.length) {
    whereConditions.push(lf.op.not(lf.op.or.apply(lf.op.or, pathOrConditions.exclude)));
  }

  // Working test type filter
  if (filter.testTypeFilter.type === "parent") {
      whereConditions.push(tests.parent_id.eq(null));
  } else if (filter.testTypeFilter.type === "child") {
      whereConditions.push(tests.parent_id.neq(null));
  }

  orderByDir = lf.Order.ASC;
  if (limit) {
    if (minTestId) {
      whereConditions.push(tests.id.gt(minTestId));
    } else if (maxTestId) {
      whereConditions.push(tests.id.lt(maxTestId));
      // The final results are always in ascending order because they come from a second query
      // with its own order
      orderByDir = lf.Order.DESC;
    }
  }

  if (whereConditions.length) {
    var whereClause = lf.op.and.apply(lf.op.and, whereConditions);
    query = query.where(whereClause);
  }
  query = query.orderBy(tests.id, orderByDir);
  if (limit) {
    query = query.limit(limit);
  }

  return query.exec()
  .then((test_ids) => {
    var test_list = test_ids.map((test) => test.test_id);

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
      .where(lf.op.and(tests.id.in(test_list), test_runs.enabled.eq(true)))
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
  return this.getDbConnection()
    .then(db => {
      return db
        .select()
        .from(test_runs)
        .where(test_runs.name.eq(runName))
        .exec();
    });
}

LovefieldService.prototype.getRunURLs = function() {
  var test_runs = this.test_runs;
  return this.db_.
    select(test_runs.url).
    from(test_runs).
    where(test_runs.url.neq(null)).
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
