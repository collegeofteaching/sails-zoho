var Connection = {},
    async = require('async'),
    url = require('url'),
    _ = require('lodash'),
    Zoho = require('node-zoho');
/**
 * Run all hook functions defined on `connection.hooks.before`.
 * Used to modify request properties before running the actual request.
 * Creates a SuperAgent Request object as soon as `config.endpoint` is defined by one of the hooks.
 *
 * @note When using your own hooks, please ensure the first hook in the chain defines `config.endpoint` properly, so
 *       SuperAgent Request object can be initialized with the correct HTTP endpoint.
 *
 * @param {Request} req - SuperAgent HTTP Request object
 * @param {String}  method - The model method
 * @param {Object}  config - configuration object used to hold request-specific configuration. this is used to avoid polluting the connection's own configuration object.
 * @param {Object}  conn - connection configuration object:
 *    - {Object} connection - Waterline connection configuration object
 *    - {String} collection - collection name. appended to API pathname.
 *                            For example, given the api `http://localhost:8080/api/v1`,
 *                            a collection named `user` will resolve to `http://localhost:8080/api/v1/user`.
 *    - {Object} options - query options object. contains query conditions (`where`), sort, limit etc. as per Waterline's API.
 *    - {Array<Object>} values - values of records to create.
 * @param {Function} cb - function with error (Error object, or a falsy value if finished succesfully) and req (SuperAgent Request object, or undefined if error is not falsy) that is called when runBeforeHooks finishes
 */
function runBeforeHooks(req, method, config, conn, cb){
  async.eachSeries(conn.connection.hooks.before, function (hook, nextHook) {
    hook(req, method, config, conn, function (err) {
      if(err) {
        return nextHook(err);
      }

      nextHook();
    });
  }, function (err) {
    if(err) {
      return cb(err);
    }
    cb(null, req);
  });
}

/**
 * Run all hook functions defined on `connection.hooks.after`.
 * Used to modify the response object and optionally handle any relevant errors if any.
 * @param {Object} connection - connection configuration object
 * @param {Error} err - response error object
 * @param {Response} res - SuperAgent HTTP Response object
 * @param {Function} cb - function with error (Error object, or a falsy value if finished succesfully) that is called when runAfterHooks finishes
 */
function runAfterHooks(connection, err, res, cb){
  async.eachSeries(connection.hooks.after, function (hook, nextHook) {
    hook(err, res, nextHook);
  }, cb);
}

/**
 * Handle SuperAgent HTTP Response. Calls hook functions followed by Waterline callback.
 * @param {Object} connection - connection configuration object
 * @param {Error} err - response error object
 * @param {Response} res - SuperAgent HTTP Response object
 * @param {Function} cb - function to call with query results.
 */
function handleResponse(connection, err, res, cb) {
  runAfterHooks(connection, err, res, function (errFromHooks) {
    if(errFromHooks) {
      return cb(errFromHooks, null);
    } else if (res === undefined) {
      cb(err, null);
    } else {
      cb(err, res.data);
    }
  });
}

/**
 * Creates a generic, anonymous HTTP response handler to handle SuperAgent responses.
 * @param {Object} connection - Waterline connection configuration object
 * @param {Function} cb - function to call with query results.
 * @returns {Function} SuperAgent response handler
 */
function getResponseHandler(connection, cb) {
  return function (err, res) {
    if (res && !err) {
      err = null;
    }
    handleResponse(connection, err, res, cb);
  }
}

/**
 * Find record(s) by issuing an HTTP GET request.
 * @param {Object} connection - connection configuration object
 * @param {String} collection - collection name. appended to API pathname.
 *                              For example, given the api `http://localhost:8080/api/v1`,
 *                              a collection named `user` will resolve to `http://localhost:8080/api/v1/user`.
 * @param {Object} options - query options object. contains query conditions (`where`), sort, limit etc. as per Waterline's API.
 * @param {Function} cb - function to call with query results.
 */
Connection.find = function (connection, collection, options, cb) {
  var config = {},
      req,
      conn = {
        connection: connection,
        collection: collection,
        options: options,
        values: {}
      };
  runBeforeHooks(req, 'find', config, conn, function (err, req) {
    if(err) {
      return cb(err);
    }
    var id = null
    if(collection == 'member'){
      collection = 'Contacts'
      if(options.CONTACTID){
        id = options.CONTACTID
      }
    }

    console.log('making request')

    var zoho = new Zoho({authToken:conn.connection.authtoken});

    if(id){
      return zoho.execute('crm', collection, 'getRecordById', id, function (err, result) {
        console.log(result)
        console.log(err)
        if (err !== null) {
          console.log(err);
        } else if (result.isError()) {
          console.log(result.message);
        } else {
          console.log(result.data);

          console.log('heeee')
          console.log(result.data)

          result.data = [result.data]
          handleResponse(conn.connection, err, result, cb);
        }
      })
    }

    else{
      return zoho.execute('crm', collection, 'getRecords', null, function (err, result) {

        if (err !== null) {
          console.log(err);
        } else if (result.isError()) {
          console.log(result.message);
        } else {
          console.log(result.data)
          handleResponse(conn.connection, err, result, cb);
        }
      })
    }


  });
};

/**
 * Create record(s) by issuing an HTTP POST request
 * @param {Object} connection - connection configuration object
 * @param {String} collection - collection name. appended to API pathname.
 *                              For example, given the api `http://localhost:8080/api/v1`,
 *                              a collection named `user` will resolve to `http://localhost:8080/api/v1/user`.
 * @param {Array<Object>} values - values of records to create.
 * @param {Function} cb - function to call with query results.
 */
Connection.create = function (connection, collection, values, cb) {
  var config = {},
    req,
    conn = {
      connection: connection,
      collection: collection,
      options: {},
      values: values
    };
  runBeforeHooks(req, 'create', config, conn, function (err, req) {
    if(err) {
      return cb(err);
    }

    console.log('create')
    return req.send(conn.values).end(getResponseHandler(conn.connection, cb));
  });
};

/**
 * Update record(s) by issuing an HTTP PUT request.
 * @param {Object} connection - connection configuration object
 * @param {String} collection - collection name. appended to API pathname.
 *                              For example, given the api `http://localhost:8080/api/v1`,
 *                              a collection named `user` will resolve to `http://localhost:8080/api/v1/user`.
 * @param {Object} options - query options object. contains query conditions (`where`), sort, limit etc. as per Waterline's API.
 * @param {Array<Object>} values - values of records to create.
 * @param {Function} cb - function to call with query results.
 */
Connection.update = function (connection, collection, options, values, cb) {
  var config = {},
    req,
    conn = {
      connection: connection,
      collection: collection,
      options: options,
      values: values
    };
  runBeforeHooks(req, 'update', config, conn, function (err, req) {
    if(err) {
      return cb(err);
    }
    console.log('update is not implemented')

    return req.query(conn.options).send(conn.values).end(getResponseHandler(conn.connection, cb));
  });
};

/**
 * Destroy record(s) by issuing an HTTP DELETE request.
 * @param {Object} connection - connection configuration object
 * @param {String} collection - collection name. appended to API pathname.
 *                              For example, given the api `http://localhost:8080/api/v1`,
 *                              a collection named `user` will resolve to `http://localhost:8080/api/v1/user`.
 * @param {Object} options - query options object. contains query conditions (`where`), sort, limit etc. as per Waterline's API.
 * @param {Function} cb - function to call with query results.
 */
Connection.destroy = function (connection, collection, options, cb) {
  var config = {},
    req,
    conn = {
      connection: connection,
      collection: collection,
      options: options,
      values: {}
    };
  runBeforeHooks(req, 'destroy', config, conn, function (err, req) {
    if(err) {
      return cb(err);
    }
    console.log('destroy is not implemented')

    return req.query(conn.options).end(getResponseHandler(conn.connection, cb));
  });
};

module.exports = Connection;
