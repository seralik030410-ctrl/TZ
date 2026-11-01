import 'dotenv/config';
import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const db=await mysql.createConnection(process.env.DATABASE_URL);
try {
  await db.beginTransaction();
  const [rows]=await db.query("SELECT * FROM personal_cleanup_archive WHERE batch='study-only-2026-11-01' AND restored_at IS NULL FOR UPDATE");
  for (const row of rows) {
    if (!/^[a-z_]+$/.test(row.table_name)) throw new Error('Invalid archive table');
    const [result]=await db.query(`UPDATE \`${row.table_name}\` SET is_deleted=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=? AND is_deleted=1 AND updated_at=?`,[row.record_id,row.owner_id,row.archived_at]);
    if (result.affectedRows!==1) throw new Error('Archived record changed; restoration rolled back');
  }
  await db.query("UPDATE personal_cleanup_archive SET restored_at=CURRENT_TIMESTAMP WHERE batch='study-only-2026-11-01' AND restored_at IS NULL");
  if(rows.length) await db.query('UPDATE settings SET task_epoch=task_epoch+1 WHERE owner_id=?',[rows[0].owner_id]);
  await db.commit();
  console.log(`Restored ${rows.length} archived records`);
} catch(error) { await db.rollback(); throw error; } finally { await db.end(); }
