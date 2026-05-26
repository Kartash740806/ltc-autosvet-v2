-- ═══════════════════════════════════════════════════════════
-- LTC Автосвет — PostgreSQL Schema v2
-- psql -U postgres -d ltc_db -f schema.sql
-- ═══════════════════════════════════════════════════════════

-- ── Товары ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255)   NOT NULL,
  category    VARCHAR(100)   NOT NULL DEFAULT 'lamp',
  price       NUMERIC(10,2)  NOT NULL DEFAULT 0,
  image_url   TEXT           NOT NULL DEFAULT '',
  description TEXT           NOT NULL DEFAULT '',
  is_active   BOOLEAN        NOT NULL DEFAULT true,
  hyperlink   TEXT           DEFAULT NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_is_active  ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- ── Пользователи (авто-регистрация клиентов) ─────────────
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  tg_id      BIGINT        UNIQUE NOT NULL,
  username   VARCHAR(255),
  first_name VARCHAR(255),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_tg_id      ON users(tg_id);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

-- ── Администраторы / менеджеры ────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id         SERIAL PRIMARY KEY,
  tg_id      BIGINT        UNIQUE NOT NULL,
  role       VARCHAR(50)   NOT NULL DEFAULT 'manager',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admins_tg_id ON admins(tg_id);

-- ── Тестовые сид-данные: один суперадмин ─────────────────
INSERT INTO admins (tg_id, role) VALUES (6314291903, 'superadmin')
  ON CONFLICT (tg_id) DO NOTHING;

-- ── Тестовые товары ──────────────────────────────────────
INSERT INTO products (name,category,price,image_url,description,is_active,hyperlink) VALUES
  ('Bi-LED линзы Zorkiy A50','biled',14900,'',
   'Тип: Bi-LED линза | Мощность: 45W | Цоколь: H4/H7 | Для: Toyota LC200, Pajero 4, UAZ Patriot',
   true,NULL),
  ('Модуль WD016+ LED Vesta/Toyota','biled',8500,'',
   'Тип: Bi-LED проектор | Мощность: 70W | Крепление: 90мм, 3 точки | Для: Lada Vesta, Granta FL',
   true,NULL),
  ('Лампы H4 Viper LED 130W','lamp',5500,'',
   'Тип: LED | Мощность: 130W | Цоколь: H4 | Свет: 6000K | Для: Kia Sportage 3, Ford Focus 2',
   true,NULL),
  ('Лампы H7 Nano Turbo LED','lamp',4200,'',
   'Тип: LED CSP | Мощность: 55W | Цоколь: H7 | Для: Hyundai Tucson 3, Kia Ceed 2, VW Polo',
   true,NULL),
  ('Лампы H11 Nano LED 30W','lamp',2900,'',
   'Тип: LED | Мощность: 30W | Цоколь: H8/H11/H16 | Для: Hyundai Tucson, Kia Ceed',
   true,NULL),
  ('ПТФ LED Легковые LT-F01','ptf',3800,'',
   'Тип: LED противотуманка | Мощность: 30W | 12V | Для: Lada Vesta, Solaris 2, Kia Rio 3',
   true,NULL),
  ('Туманки КАМАЗ NEO 24V','ptf',5600,'',
   'Тип: LED прожектор | Мощность: 60W | 24V | IP67 | Для: КАМАЗ 65115, 5490, 43118',
   true,NULL),
  ('Боковые габариты LED G7025-24V','gabarit',890,'',
   'Тип: LED маркер | Мощность: 3W | 24V | Для: Volvo FH, Mercedes Actros, DAF XF',
   true,NULL),
  ('ПТФ грузовые LED 24V LT-G50','ptf',4900,'',
   'Тип: LED туманка | Мощность: 50W | 24V | Для: Volvo FH, Scania R, Mercedes Actros',
   true,NULL),
  ('Bi-LED модули 24V Truck Pro','biled',18500,'',
   'Тип: Bi-LED 24V | Мощность: 80W | Цоколь: H4/H7 | Встроенный стабилизатор',
   true,NULL),
  ('Тестовый скрытый товар','lamp',1000,'',
   'Этот товар скрыт от клиентов (is_active = false)',
   false,NULL)
ON CONFLICT DO NOTHING;
