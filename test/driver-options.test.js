// Copyright IBM Corp. 2026. All Rights Reserved.
// Node module: loopback-connector-mysql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
require('./init.js');
const sinon = require('sinon');

describe('options passed to mysql2', function() {
  afterEach(function() {
    sinon.restore();
  });

  it('does not warn about connector-only settings', function(done) {
    this.timeout(10000);
    const errorLog = sinon.spy(console, 'error');
    // getConfig already sets username and createDatabase.
    const db = global.getDataSource({acquireTimeout: 1000});
    db.once('connected', function() {
      const warnings = errorLog.getCalls()
        .map(function(call) {
          return String(call.args[0]);
        })
        .filter(function(line) {
          return line.includes('Ignoring invalid configuration option');
        });
      // The juggler swallows errors thrown in this handler, so report through done.
      db.disconnect(function() {
        try {
          warnings.should.eql([]);
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
});
