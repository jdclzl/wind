/**
 * 谱子数据存储层（Neon Postgres）
 * - Vercel 部署时通过 Neon 集成自动注入连接串（DATABASE_URL 等）
 * - 本地开发未配置数据库时降级为内存存储（数据不持久，仅用于开发调试）
 */

import { neon } from '@neondatabase/serverless';
import { sanitizeSheet } from './sheet';

// 跨 route bundle 共享的模块状态（Next.js 每个 API route 独立打包，
// 用 globalThis 保证内存降级模式与惰性初始化在所有 route 间共享同一实例）
const g = globalThis;
if (!g.__windDbState) {
  g.__windDbState = {
    memory: new Map(),  // id -> 谱子记录（无数据库时的降级存储）
    dbAvailable: null,  // null=未检测 true/false=检测结果
    tableReady: false,
    sql: undefined,     // neon 实例（惰性创建）
  };
}
const dbState = g.__windDbState;
const memory = dbState.memory;

// 候选连接串（Vercel Neon 集成按项目名前缀注入 WIND_DATABASE_URL 等；兼容无前缀与旧版变量）
function connectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_DATABASE_URL ||
    process.env.WIND_DATABASE_URL ||
    process.env.WIND_POSTGRES_URL ||
    ''
  );
}

function sqlInstance() {
  if (dbState.sql === undefined) {
    const conn = connectionString();
    dbState.sql = conn ? neon(conn) : null;
  }
  return dbState.sql;
}

async function checkDb() {
  if (dbState.dbAvailable !== null) return dbState.dbAvailable;
  const sql = sqlInstance();
  if (!sql) {
    dbState.dbAvailable = false;
    console.warn('[db] 未配置数据库连接串，降级为内存存储（重启后数据丢失）');
    return false;
  }
  try {
    await sql`SELECT 1`;
    dbState.dbAvailable = true;
  } catch (e) {
    dbState.dbAvailable = false;
    console.warn('[db] 数据库连接失败，降级为内存存储:', e?.message);
  }
  return dbState.dbAvailable;
}

async function ensureTable() {
  if (dbState.tableReady) return;
  const sql = sqlInstance();
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS sheets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '未命名',
        sheet_key TEXT NOT NULL DEFAULT 'C',
        time_signature TEXT NOT NULL DEFAULT '4/4',
        bpm INTEGER NOT NULL DEFAULT 80,
        notes JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  } catch (e) {
    // 并发建表竞态：另一实例同时冷启动已建成该表
    // （42P07=表已存在 / 23505=pg_type 系统表唯一冲突），视为成功
    if (e?.code !== '42P07' && e?.code !== '23505') throw e;
  }
  dbState.tableReady = true;
}

// 内置示例曲目（首次启动自动生成，开箱即用）
function seedData() {
  const q = (pitch, octave, duration = 0.25) => ({ pitch, octave, duration, isRest: false });
  // 固定种子 id：配合 ON CONFLICT 保证并发冷启动下不重复播种
  return [
    {
      id: 'seed-twinkle',
      name: '小星星',
      key: 'C', timeSignature: '4/4', bpm: 84,
      notes: [
        q('C', 4), q('C', 4), q('G', 4), q('G', 4),
        q('A', 4), q('A', 4), q('G', 4, 0.5),
        q('F', 4), q('F', 4), q('E', 4), q('E', 4),
        q('D', 4), q('D', 4), q('C', 4, 0.5),
      ],
    },
    {
      id: 'seed-ode',
      name: '欢乐颂',
      key: 'C', timeSignature: '4/4', bpm: 96,
      notes: [
        q('E', 4), q('E', 4), q('F', 4), q('G', 4),
        q('G', 4), q('F', 4), q('E', 4), q('D', 4),
        q('C', 4), q('C', 4), q('D', 4), q('E', 4),
        q('E', 4, 0.5), q('D', 4, 0.5), q('D', 4, 1),
      ],
    },
    {
      id: 'seed-jasmine',
      name: '茉莉花（片段）',
      key: 'C', timeSignature: '4/4', bpm: 76,
      notes: [
        q('E', 4), q('E', 4), q('G', 4), q('A', 4),
        q('C', 5), q('C', 5), q('A', 4, 0.5),
        q('G', 4), q('G', 4), q('A', 4), q('G', 4, 0.5),
      ],
    },
  ];
}

function toMeta(rec) {
  return {
    id: rec.id,
    name: rec.name,
    key: rec.key,
    timeSignature: rec.timeSignature,
    bpm: rec.bpm,
    noteCount: Array.isArray(rec.notes) ? rec.notes.length : 0,
    updatedAt: rec.updatedAt,
  };
}

async function seedIfEmpty(sql) {
  const rows = await sql`SELECT COUNT(*)::int AS c FROM sheets`;
  if (rows[0].c > 0) return;
  for (const data of seedData()) {
    await sql`
      INSERT INTO sheets (id, name, sheet_key, time_signature, bpm, notes)
      VALUES (${data.id}, ${data.name}, ${data.key}, ${data.timeSignature}, ${data.bpm}, ${JSON.stringify(data.notes)}::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

function genId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 获取所有谱子（元数据列表，按更新时间倒序） */
export async function listSheets() {
  if (!(await checkDb())) {
    if (memory.size === 0) {
      for (const data of seedData()) {
        const id = genId();
        memory.set(id, { id, ...data, updatedAt: new Date().toISOString() });
      }
    }
    return [...memory.values()].map(toMeta).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  const sql = sqlInstance();
  await ensureTable();
  await seedIfEmpty(sql);
  const rows = await sql`
    SELECT id, name, sheet_key, time_signature, bpm, notes, updated_at
    FROM sheets ORDER BY updated_at DESC
  `;
  return rows.map((r) => toMeta({
    id: r.id, name: r.name, key: r.sheet_key,
    timeSignature: r.time_signature, bpm: r.bpm,
    notes: r.notes, updatedAt: r.updated_at,
  }));
}

/** 获取单个谱子（含完整音符） */
export async function getSheet(id) {
  if (!(await checkDb())) {
    const rec = memory.get(id);
    if (!rec) return null;
    const { updatedAt, ...rest } = rec;
    return rest;
  }
  const sql = sqlInstance();
  await ensureTable();
  const rows = await sql`
    SELECT id, name, sheet_key, time_signature, bpm, notes
    FROM sheets WHERE id = ${id}
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id, name: r.name, key: r.sheet_key,
    timeSignature: r.time_signature, bpm: r.bpm, notes: r.notes,
  };
}

/** 创建谱子，返回新记录 */
export async function createSheet(body) {
  const clean = sanitizeSheet(body);
  const id = genId();
  if (!(await checkDb())) {
    memory.set(id, { id, ...clean, updatedAt: new Date().toISOString() });
    return getSheet(id);
  }
  const sql = sqlInstance();
  await ensureTable();
  await sql`
    INSERT INTO sheets (id, name, sheet_key, time_signature, bpm, notes)
    VALUES (${id}, ${clean.name}, ${clean.key}, ${clean.timeSignature}, ${clean.bpm}, ${JSON.stringify(clean.notes)}::jsonb)
  `;
  return getSheet(id);
}

/** 更新谱子 */
export async function updateSheet(id, body) {
  const clean = sanitizeSheet(body);
  if (!(await checkDb())) {
    const rec = memory.get(id);
    if (!rec) return null;
    Object.assign(rec, clean, { updatedAt: new Date().toISOString() });
    return getSheet(id);
  }
  const sql = sqlInstance();
  await ensureTable();
  const rows = await sql`
    UPDATE sheets SET
      name = ${clean.name},
      sheet_key = ${clean.key},
      time_signature = ${clean.timeSignature},
      bpm = ${clean.bpm},
      notes = ${JSON.stringify(clean.notes)}::jsonb,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  if (!rows.length) return null;
  return getSheet(id);
}

/** 删除谱子 */
export async function deleteSheet(id) {
  if (!(await checkDb())) {
    return memory.delete(id);
  }
  const sql = sqlInstance();
  await ensureTable();
  const rows = await sql`DELETE FROM sheets WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
