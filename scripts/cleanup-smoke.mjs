import mysql from 'mysql2/promise';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const name=`ritm_cleanup_${Date.now()}`;
const db=await mysql.createConnection({host:'127.0.0.1',port:3307,user:'root',password:'ritm_local_test'});
const env={...process.env,DATABASE_URL:`mysql://root:ritm_local_test@127.0.0.1:3307/${name}`};
try {
 await db.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); await db.query(`USE ${name}`);
 execFileSync(process.execPath,['scripts/migrate.mjs'],{env,stdio:'pipe'});
 await db.query('ALTER TABLE personal_cleanup_archive CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
 const owner='00000000-0000-4000-8000-000000000001';
 await db.query("INSERT INTO transactions(id,owner_id,kind,amount) VALUES ('personal',?,'income',100),('friend','friend','income',200)",[owner]);
 await db.query("INSERT INTO tasks(id,owner_id,title,workspace_id) VALUES ('personal',?,'private',NULL),('shared',?,'shared','workspace')",[owner,owner]);
 await db.query("INSERT INTO settings(id,owner_id) VALUES ('default',?)",[owner]);
 // Replay only DML to exercise archival on populated data, in one transaction.
 await db.beginTransaction();
 for(const sql of readFileSync('db/migrations/0016_study_only_archive.sql','utf8').split('--> statement-breakpoint').slice(1)) await db.query(sql);
 await db.commit();
 const [tasks]=await db.query('SELECT id,is_deleted FROM tasks');
 assert.equal(tasks.find(r=>r.id==='personal').is_deleted,1);
 assert.equal(tasks.find(r=>r.id==='shared').is_deleted,0);
 const [[friend]]=await db.query("SELECT is_deleted FROM transactions WHERE id='friend'"); assert.equal(friend.is_deleted,0);
 const [[classes]]=await db.query("SELECT COUNT(*) n FROM schedule_items WHERE is_deleted=0");assert.equal(classes.n,113);
 execFileSync(process.execPath,['scripts/restore-study-cleanup.mjs'],{env,stdio:'pipe'});
 execFileSync(process.execPath,['scripts/restore-study-cleanup.mjs'],{env,stdio:'pipe'});
 const [[restored]]=await db.query("SELECT is_deleted FROM transactions WHERE id='personal'");assert.equal(restored.is_deleted,0);
 console.log('PASS cleanup, preserved classes/Koreo/shared/friend, restore and duplicate restore');
} finally {await db.end();console.log(`Local database preserved: ${name}`);}

