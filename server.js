'use strict';
/**
 * LTC Автосвет — Express + PostgreSQL API Server v2
 *
 * npm install express pg cors dotenv
 *
 * .env:
 *   PG_HOST=localhost
 *   PG_PORT=5432
 *   PG_USER=postgres
 *   PG_PASSWORD=yourpassword
 *   PG_DATABASE=ltc_db
 *   PORT=3000
 *
 * Запуск: node server.js
 */

require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── PostgreSQL пул ────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
});
pool.on('error', (err) => console.error('PG pool error:', err));

// ── Middleware ────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════════
// АВТОРИЗАЦИЯ: читаем tg_id из заголовка, проверяем таблицу admins
// ══════════════════════════════════════════════════════════
async function requireAdmin(req, res, next) {
  const rawId = req.headers['x-tg-user-id'];
  const tgId  = rawId ? parseInt(rawId, 10) : null;

  if (!tgId || isNaN(tgId)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: x-tg-user-id header missing' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, role FROM admins WHERE tg_id = $1',
      [tgId]
    );
    if (!rows.length) {
      return res.status(403).json({ ok: false, error: 'Forbidden: user is not an admin' });
    }
    req.admin = { tgId, role: rows[0].role };
    next();
  } catch (err) {
    console.error('requireAdmin DB error:', err);
    return res.status(500).json({ ok: false, error: 'Database error during auth' });
  }
}

// ── Хелпер форматирования ─────────────────────────────────
function fmtProduct(r) {
  return {
    id: r.id, name: r.name, category: r.category,
    price: Number(r.price), image_url: r.image_url,
    description: r.description, is_active: r.is_active,
    hyperlink: r.hyperlink, created_at: r.created_at,
  };
}

// ══════════════════════════════════════════════════════════
// КЛИЕНТСКИЕ ЭНДПОИНТЫ
// ══════════════════════════════════════════════════════════

/**
 * GET /api/client/products
 * Одноразовая загрузка — только is_active = true
 */
app.get('/api/client/products', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id,name,category,price,image_url,description,hyperlink,created_at
       FROM products WHERE is_active = true
       ORDER BY category, created_at DESC`
    );
    return res.json({ ok: true, products: rows.map(fmtProduct), total: rows.length });
  } catch (err) {
    console.error('GET /api/client/products:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * POST /api/client/register
 * Авто-регистрация клиента при входе в WebApp.
 * Тело: { tg_id, username, first_name }
 * Если уже существует — просто возвращает ok без ошибки.
 */
app.post('/api/client/register', async (req, res) => {
  const { tg_id, username, first_name } = req.body;

  if (!tg_id || isNaN(Number(tg_id))) {
    return res.status(400).json({ ok: false, error: 'tg_id is required and must be a number' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (tg_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tg_id) DO UPDATE
         SET username   = EXCLUDED.username,
             first_name = EXCLUDED.first_name
       RETURNING id, tg_id, username, first_name, created_at`,
      [Number(tg_id), username || null, first_name || null]
    );
    return res.json({ ok: true, user: rows[0], registered: true });
  } catch (err) {
    console.error('POST /api/client/register:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// ══════════════════════════════════════════════════════════
// АДМИНСКИЕ ЭНДПОИНТЫ
// ══════════════════════════════════════════════════════════

/**
 * GET /api/admin/products
 * Все товары (активные + скрытые)
 */
app.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    return res.json({ ok: true, products: rows.map(fmtProduct), total: rows.length });
  } catch (err) {
    console.error('GET /api/admin/products:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * PATCH /api/admin/products/:id/toggle
 * Переключение is_active
 */
app.patch('/api/admin/products/:id/toggle', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || id <= 0) return res.status(400).json({ ok: false, error: 'Invalid product id' });

  try {
    const { rows } = await pool.query(
      `UPDATE products SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Product not found' });
    return res.json({ ok: true, product: fmtProduct(rows[0]) });
  } catch (err) {
    console.error('PATCH /toggle:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * POST /api/admin/products/add
 * Добавление нового товара
 */
app.post('/api/admin/products/add', requireAdmin, async (req, res) => {
  const { name, category, price, image_url, description, hyperlink } = req.body;

  if (!name?.trim())                         return res.status(400).json({ ok: false, error: 'name is required' });
  if (price === undefined || isNaN(+price))  return res.status(400).json({ ok: false, error: 'price must be a number' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO products (name,category,price,image_url,description,is_active,hyperlink)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *`,
      [
        name.trim(), (category || 'lamp').trim(), Number(price),
        (image_url   || '').trim(),
        (description || '').trim(),
        hyperlink ? hyperlink.trim() : null,
      ]
    );
    return res.status(201).json({ ok: true, product: fmtProduct(rows[0]) });
  } catch (err) {
    console.error('POST /add:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * GET /api/admin/users
 * Список всех зарегистрированных подписчиков (новые сверху)
 */
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, tg_id, username, first_name, created_at
       FROM users ORDER BY created_at DESC`
    );
    return res.json({ ok: true, users: rows, total: rows.length });
  } catch (err) {
    console.error('GET /api/admin/users:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

/**
 * POST /api/admin/managers/add
 * Добавление нового менеджера/администратора в таблицу admins
 * Тело: { tg_id, role? }
 */
app.post('/api/admin/managers/add', requireAdmin, async (req, res) => {
  // Только superadmin может назначать других
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ ok: false, error: 'Only superadmin can add managers' });
  }

  const newTgId = parseInt(req.body.tg_id, 10);
  const role    = req.body.role || 'manager';

  if (!newTgId || isNaN(newTgId)) {
    return res.status(400).json({ ok: false, error: 'tg_id is required and must be a number' });
  }

  const allowedRoles = ['manager', 'superadmin'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ ok: false, error: `role must be one of: ${allowedRoles.join(', ')}` });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO admins (tg_id, role)
       VALUES ($1, $2)
       ON CONFLICT (tg_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING id, tg_id, role, created_at`,
      [newTgId, role]
    );
    return res.status(201).json({ ok: true, admin: rows[0] });
  } catch (err) {
    console.error('POST /managers/add:', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
});

// ── Healthcheck ───────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS products FROM products');
    return res.json({ ok: true, db: 'connected', products: rows[0].products, time: new Date().toISOString() });
  } catch {
    return res.status(503).json({ ok: false, db: 'disconnected' });
  }
});

// ── SPA fallback ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Безопасный запуск сервера и проверка таблиц
async function initDatabase() {
    try {
        // Возвращаем fs на место, здесь она никому не помешает
        const fs = require('fs'); 
        const schemaPath = path.join(__dirname, 'schema.sql');
        
        if (fs.existsSync(schemaPath)) {
            const sql = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(sql);
            console.log('✅ Таблицы базы данных успешно проверены/созданы!');
        }
    } catch (err) {
        console.error('❌ Ошибка автоматической инициализации базы:', err);
    }
}

// Запускаем
initDatabase().then(() => {
  app.post('/api/users/register', async (req, res) => {
  const { tg_id, username, first_name } = req.body;
  try {
    await pool.query(
      'INSERT INTO users (tg_id, username, first_name) VALUES ($1, $2, $3) ON CONFLICT (tg_id) DO UPDATE SET username = $2, first_name = $3',
      [tg_id, username, first_name]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
    app.listen(PORT, () => {
        console.log(`LTC Server v2 running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Критическая ошибка при старте:', err);
    app.listen(PORT, () => {
        console.log(`LTC Server v2 started in fallback mode on port ${PORT}`);
    });
});
