// server.js — REST API + static file server, zero external npm dependencies
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, hashPassword, verifyPassword } = require('./db.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function rowLanguages(row) {
  return { ...row, languages: row.languages ? row.languages.split(',') : [] };
}

function rowFull(row) {
  return {
    ...rowLanguages(row),
    slots: row.slots ? row.slots.split(',').map(s => s.trim()).filter(Boolean) : [],
  };
}

// ---- simple in-memory session store: token -> user ----
const sessions = new Map();
function makeToken() { return crypto.randomBytes(24).toString('hex'); }
function getUserFromReq(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return token ? sessions.get(token) : null;
}

function getDoctorProfileForUser(userId) {
  return db.prepare('SELECT * FROM doctors WHERE user_id = ?').get(userId);
}

function recomputeDoctorRating(doctorId) {
  const row = db.prepare('SELECT AVG(rating) AS avgRating, COUNT(*) AS c FROM reviews WHERE doctor_id = ?').get(doctorId);
  const avg = row.avgRating ? Math.round(row.avgRating * 10) / 10 : 0;
  db.prepare('UPDATE doctors SET rating = ?, reviews_count = ? WHERE id = ?').run(avg, row.c, doctorId);
  return { rating: avg, reviews_count: row.c };
}

// ---------------- API handlers ----------------
const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

route('GET', /^\/api\/specialties$/, async (req, res) => {
  const rows = db.prepare('SELECT * FROM specialties ORDER BY name').all();
  sendJSON(res, 200, rows);
});

route('GET', /^\/api\/cities$/, async (req, res) => {
  const rows = db.prepare('SELECT DISTINCT city FROM doctors ORDER BY city').all();
  sendJSON(res, 200, rows.map(r => r.city));
});

route('GET', /^\/api\/doctors$/, async (req, res, url) => {
  const q = url.searchParams;
  const specialty = q.get('specialty') || '';
  const city = q.get('city') || '';
  const hospital = (q.get('hospital') || '').toLowerCase();
  const lang = q.get('lang') || '';

  let sql = 'SELECT * FROM doctors WHERE 1=1';
  const params = [];
  if (specialty) { sql += ' AND specialty = ?'; params.push(specialty); }
  if (city) { sql += ' AND city = ?'; params.push(city); }
  if (hospital) { sql += ' AND LOWER(hospital) LIKE ?'; params.push('%' + hospital + '%'); }
  if (lang) { sql += ' AND languages LIKE ?'; params.push('%' + lang + '%'); }
  sql += ' ORDER BY rating DESC';

  const rows = db.prepare(sql).all(...params);
  sendJSON(res, 200, rows.map(rowFull));
});

route('GET', /^\/api\/doctors\/(\d+)$/, async (req, res, url, mparams) => {
  const id = Number(mparams[1]);
  const doc = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id);
  if (!doc) return sendJSON(res, 404, { error: 'Doctor not found' });
  const reviews = db.prepare('SELECT who, rating, text, created_at FROM reviews WHERE doctor_id = ? ORDER BY id DESC').all(id);
  sendJSON(res, 200, { ...rowFull(doc), reviews });
});

// ---- Patient reviews ----
route('POST', /^\/api\/doctors\/(\d+)\/reviews$/, async (req, res, url, mparams) => {
  const id = Number(mparams[1]);
  const doc = db.prepare('SELECT id FROM doctors WHERE id = ?').get(id);
  if (!doc) return sendJSON(res, 404, { error: 'Doctor not found' });

  const user = getUserFromReq(req);
  let { who, rating, text } = req._body;
  if (user && user.name) who = user.name; // trust the logged-in name over client input
  rating = Number(rating);
  if (!who || !who.trim()) return sendJSON(res, 400, { error: 'Please enter your name' });
  if (!rating || rating < 1 || rating > 5) return sendJSON(res, 400, { error: 'Rating must be between 1 and 5' });
  if (!text || !text.trim()) return sendJSON(res, 400, { error: 'Please write a short review' });

  db.prepare('INSERT INTO reviews (doctor_id, who, rating, text) VALUES (?,?,?,?)').run(id, who.trim(), rating, text.trim());
  const agg = recomputeDoctorRating(id);
  const reviews = db.prepare('SELECT who, rating, text, created_at FROM reviews WHERE doctor_id = ? ORDER BY id DESC').all(id);
  sendJSON(res, 201, { ...agg, reviews });
});

route('GET', /^\/api\/emergency-hospitals$/, async (req, res) => {
  const rows = db.prepare('SELECT * FROM emergency_hospitals ORDER BY city').all();
  sendJSON(res, 200, rows);
});

route('POST', /^\/api\/appointments$/, async (req, res) => {
  const body = req._body;
  const { doctor_id, patient_name, phone, date, slot, reason } = body;
  if (!doctor_id || !patient_name || !phone) {
    return sendJSON(res, 400, { error: 'doctor_id, patient_name, and phone are required' });
  }
  const doc = db.prepare('SELECT id FROM doctors WHERE id = ?').get(Number(doctor_id));
  if (!doc) return sendJSON(res, 404, { error: 'Doctor not found' });

  const ref = 'SS-' + Date.now().toString(36).toUpperCase();
  db.prepare(`INSERT INTO appointments (ref, doctor_id, patient_name, phone, appt_date, slot, reason)
              VALUES (?,?,?,?,?,?,?)`)
    .run(ref, Number(doctor_id), patient_name, phone, date || null, slot || null, reason || null);

  sendJSON(res, 201, { ref, status: 'requested' });
});

route('GET', /^\/api\/appointments$/, async (req, res, url) => {
  // simple lookup by phone, e.g. for "my appointments"
  const phone = url.searchParams.get('phone');
  if (!phone) return sendJSON(res, 400, { error: 'phone query param required' });
  const rows = db.prepare(`SELECT a.*, d.name AS doctor_name, d.hospital, d.city
                            FROM appointments a JOIN doctors d ON d.id = a.doctor_id
                            WHERE a.phone = ? ORDER BY a.id DESC`).all(phone);
  sendJSON(res, 200, rows);
});

route('POST', /^\/api\/contact$/, async (req, res) => {
  const { name, contact, message } = req._body;
  if (!message) return sendJSON(res, 400, { error: 'message is required' });
  db.prepare('INSERT INTO contact_messages (name, contact, message) VALUES (?,?,?)')
    .run(name || null, contact || null, message);
  sendJSON(res, 201, { ok: true });
});

route('POST', /^\/api\/auth\/signup$/, async (req, res) => {
  const { role, name, phone, password } = req._body;
  if (!role || !phone || !password) return sendJSON(res, 400, { error: 'role, phone, and password are required' });
  if (role !== 'patient' && role !== 'doctor') return sendJSON(res, 400, { error: 'role must be patient or doctor' });
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) return sendJSON(res, 409, { error: 'An account with this phone number already exists' });
  const { hash, salt } = hashPassword(password);
  const info = db.prepare('INSERT INTO users (role, name, phone, password_hash, salt) VALUES (?,?,?,?,?)')
    .run(role, name || null, phone, hash, salt);
  const userId = Number(info.lastInsertRowid);

  if (role === 'doctor') {
    // Create a blank, editable doctor profile linked to this account so it appears in search immediately.
    db.prepare(`INSERT INTO doctors
      (user_id, name, specialty, city, hospital, qualification, experience, fee, languages, photo, lat, lng, bio, phone)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(userId, name || 'New Doctor', 'General Physician', 'Lahore', 'Add your clinic name',
           'Add your qualification', 0, 0, 'English', 'https://i.pravatar.cc/160?img=68', 31.5204, 74.3587,
           'Tell patients about yourself — edit this from your Doctor Portal.', phone);
  }

  const token = makeToken();
  const user = { id: userId, role, name, phone };
  sessions.set(token, user);
  sendJSON(res, 201, { token, user });
});

route('POST', /^\/api\/auth\/login$/, async (req, res) => {
  const { phone, password } = req._body;
  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!row || !verifyPassword(password || '', row.salt, row.password_hash)) {
    return sendJSON(res, 401, { error: 'Invalid phone number or password' });
  }
  const token = makeToken();
  const user = { id: row.id, role: row.role, name: row.name, phone: row.phone };
  sessions.set(token, user);
  sendJSON(res, 200, { token, user });
});

route('GET', /^\/api\/auth\/me$/, async (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return sendJSON(res, 401, { error: 'Not logged in' });
  sendJSON(res, 200, user);
});

// ---- Doctor portal: manage own profile, details, and timings ----
route('GET', /^\/api\/doctor\/me$/, async (req, res) => {
  const user = getUserFromReq(req);
  if (!user || user.role !== 'doctor') return sendJSON(res, 403, { error: 'Doctor login required' });
  const doc = getDoctorProfileForUser(user.id);
  if (!doc) return sendJSON(res, 404, { error: 'No doctor profile found for this account' });
  sendJSON(res, 200, rowFull(doc));
});

route('PUT', /^\/api\/doctor\/me$/, async (req, res) => {
  const user = getUserFromReq(req);
  if (!user || user.role !== 'doctor') return sendJSON(res, 403, { error: 'Doctor login required' });
  const doc = getDoctorProfileForUser(user.id);
  if (!doc) return sendJSON(res, 404, { error: 'No doctor profile found for this account' });

  const b = req._body;
  const fields = {
    name: b.name ?? doc.name,
    specialty: b.specialty ?? doc.specialty,
    city: b.city ?? doc.city,
    hospital: b.hospital ?? doc.hospital,
    qualification: b.qualification ?? doc.qualification,
    experience: b.experience !== undefined ? Number(b.experience) : doc.experience,
    fee: b.fee !== undefined ? Number(b.fee) : doc.fee,
    languages: Array.isArray(b.languages) ? b.languages.join(',') : (b.languages ?? doc.languages),
    photo: b.photo ?? doc.photo,
    bio: b.bio ?? doc.bio,
    phone: b.phone ?? doc.phone,
    slots: Array.isArray(b.slots) ? b.slots.join(',') : (b.slots ?? doc.slots),
  };

  if (!fields.name || !fields.specialty || !fields.city || !fields.hospital) {
    return sendJSON(res, 400, { error: 'Name, specialty, city, and hospital are required' });
  }

  db.prepare(`UPDATE doctors SET name=?, specialty=?, city=?, hospital=?, qualification=?, experience=?, fee=?,
              languages=?, photo=?, bio=?, phone=?, slots=? WHERE id=?`)
    .run(fields.name, fields.specialty, fields.city, fields.hospital, fields.qualification, fields.experience,
         fields.fee, fields.languages, fields.photo, fields.bio, fields.phone, fields.slots, doc.id);

  const updated = db.prepare('SELECT * FROM doctors WHERE id = ?').get(doc.id);
  sendJSON(res, 200, rowFull(updated));
});

route('GET', /^\/api\/doctor\/me\/appointments$/, async (req, res) => {
  const user = getUserFromReq(req);
  if (!user || user.role !== 'doctor') return sendJSON(res, 403, { error: 'Doctor login required' });
  const doc = getDoctorProfileForUser(user.id);
  if (!doc) return sendJSON(res, 404, { error: 'No doctor profile found for this account' });
  const rows = db.prepare('SELECT * FROM appointments WHERE doctor_id = ? ORDER BY id DESC').all(doc.id);
  sendJSON(res, 200, rows);
});

// ---------------- static file serving ----------------
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA-style fallback to index.html for unknown non-API paths
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    if (req.method === 'POST' || req.method === 'PUT') {
      try { req._body = await readBody(req); }
      catch { return sendJSON(res, 413, { error: 'Body too large' }); }
    }
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = pathname.match(r.pattern);
      if (m) {
        try { return await r.handler(req, res, url, m); }
        catch (e) {
          console.error(e);
          return sendJSON(res, 500, { error: 'Internal server error' });
        }
      }
    }
    return sendJSON(res, 404, { error: 'Not found' });
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Sehat Sathi server running at http://localhost:${PORT}`);
});
