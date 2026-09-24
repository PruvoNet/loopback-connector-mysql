// Copyright IBM Corp. 2026. All Rights Reserved.
// Node module: loopback-connector-mysql
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';
/* global WeakRef */
require('./init.js');
const should = require('should');

function select(db, value, options, cb) {
  db.connector.execute('SELECT ? AS ok', [value], options, cb);
}

describe('acquireTimeout', function() {
  let db;

  afterEach(function(done) {
    db.disconnect(done);
  });

  function connect(settings, done) {
    db = global.getDataSource(settings);
    db.once('connected', function() {
      done();
    });
  }

  describe('when set', function() {
    beforeEach(function(done) {
      connect({connectionLimit: 1, acquireTimeout: 500}, done);
    });

    it('fails fast on a drained pool and gets the late connection back',
      function(done) {
        this.timeout(10000);
        db.connector.beginTransaction('READ COMMITTED', function(err, conn) {
          if (err) return done(err);
          const started = Date.now();
          select(db, 1, {}, function(err) {
            should.exist(err);
            err.code.should.equal('ER_POOL_ACQUIRE_TIMEOUT');
            (Date.now() - started).should.be.aboveOrEqual(400);
            // The open transaction still runs while the pool is drained.
            const tx = {connection: conn, connector: db.connector};
            select(db, 2, {transaction: tx}, function(err, rows) {
              if (err) return done(err);
              rows[0].ok.should.equal(2);
              db.connector.rollback(conn, function(err) {
                if (err) return done(err);
                // The timed-out request is still queued and gets this
                // connection first; if it keeps it, this query hangs.
                select(db, 3, {}, function(err, rows) {
                  if (err) return done(err);
                  rows[0].ok.should.equal(3);
                  done();
                });
              });
            });
          });
        });
      });

    it('does not keep the caller alive while its request waits in the queue',
      function(done) {
        this.timeout(10000);
        // mysql2 has no way to take a callback out of its queue, so after a
        // timeout the queued entry must not hold on to the caller's callback.
        require('v8').setFlagsFromString('--expose-gc');
        const gc = require('vm').runInNewContext('gc');
        function request() {
          const caller = {payload: Buffer.alloc(1024 * 1024)};
          db.connector.getPoolConnection(function(err) {
            caller.err = err;
          });
          return new WeakRef(caller);
        }
        db.connector.beginTransaction('READ COMMITTED', function(err, conn) {
          if (err) return done(err);
          const ref = request();
          setTimeout(function() {
            gc();
            setImmediate(function() {
              const alive = ref.deref() !== undefined;
              db.connector.rollback(conn, function(err) {
                if (err) return done(err);
                alive.should.equal(false);
                done();
              });
            });
          }, 1000);
        });
      });
  });

  describe('when not set', function() {
    beforeEach(function(done) {
      connect({connectionLimit: 1}, done);
    });

    it('waits for a connection instead of failing', function(done) {
      this.timeout(10000);
      db.connector.beginTransaction('READ COMMITTED', function(err, conn) {
        if (err) return done(err);
        let answered = false;
        select(db, 1, {}, function(err, rows) {
          if (err) return done(err);
          answered = true;
          rows[0].ok.should.equal(1);
          done();
        });
        setTimeout(function() {
          answered.should.equal(false);
          db.connector.rollback(conn, function(err) {
            if (err) done(err);
          });
        }, 1500);
      });
    });
  });
});
