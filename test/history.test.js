import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { getFarmHistory } from '../src/history.js';

function makeDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE metrics (
      server_id INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      hash_60s REAL,
      temp_c REAL
    );
  `);
  return db;
}

test('farm history does not multiply one server by samples in a 5 minute bucket', () => {
  const db = makeDb();
  const insert = db.prepare('INSERT INTO metrics(server_id,ts,hash_60s,temp_c) VALUES(?,?,?,?)');
  const bucketStart = 1_800_000_000_000;

  for (let minute = 0; minute < 5; minute += 1) {
    insert.run(1, bucketStart + minute * 60_000, 44_000, 48 + minute * 0.1);
  }

  const rows = getFarmHistory(db, { hours: 24, now: bucketStart + 5 * 60_000 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hash60s, 44_000);
});

test('farm history sums per-server bucket averages and treats recorded offline samples as zero', () => {
  const db = makeDb();
  const insert = db.prepare('INSERT INTO metrics(server_id,ts,hash_60s,temp_c) VALUES(?,?,?,?)');
  const bucketStart = 1_800_000_000_000;

  for (let minute = 0; minute < 5; minute += 1) {
    insert.run(1, bucketStart + minute * 60_000, 44_000, 48);
    insert.run(2, bucketStart + minute * 60_000, minute < 2 ? 30_000 : null, 52);
  }

  const rows = getFarmHistory(db, { hours: 24, now: bucketStart + 5 * 60_000 });
  assert.equal(rows.length, 1);
  // Server 1: 44k average. Server 2: (30k + 30k + 0 + 0 + 0) / 5 = 12k.
  assert.equal(rows[0].hash60s, 56_000);
  assert.equal(rows[0].maxTemp, 52);
});
