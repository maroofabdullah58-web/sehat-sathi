// db.js — schema + seed data, using Node's built-in node:sqlite (zero npm dependencies)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const crypto = require('node:crypto');

const DB_PATH = path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS specialties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS doctors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  city TEXT NOT NULL,
  hospital TEXT NOT NULL,
  qualification TEXT,
  experience INTEGER,
  fee INTEGER,
  languages TEXT,
  rating REAL DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  photo TEXT,
  lat REAL,
  lng REAL,
  bio TEXT,
  phone TEXT,
  slots TEXT DEFAULT '10:00 AM,11:30 AM,2:00 PM,3:30 PM,5:00 PM,6:30 PM',
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id INTEGER NOT NULL,
  who TEXT,
  rating INTEGER,
  text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(doctor_id) REFERENCES doctors(id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT UNIQUE,
  doctor_id INTEGER NOT NULL,
  patient_name TEXT,
  phone TEXT,
  appt_date TEXT,
  slot TEXT,
  reason TEXT,
  status TEXT DEFAULT 'requested',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(doctor_id) REFERENCES doctors(id)
);

CREATE TABLE IF NOT EXISTS emergency_hospitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  city TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  contact TEXT,
  message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('patient','doctor')),
  name TEXT,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// Safe migration: add new columns to a pre-existing database created by an earlier version of this app.
function migrate() {
  const cols = db.prepare("PRAGMA table_info(doctors)").all().map(c => c.name);
  if (!cols.includes('user_id')) {
    db.exec('ALTER TABLE doctors ADD COLUMN user_id INTEGER');
  }
  if (!cols.includes('slots')) {
    db.exec("ALTER TABLE doctors ADD COLUMN slots TEXT DEFAULT '10:00 AM,11:30 AM,2:00 PM,3:30 PM,5:00 PM,6:30 PM'");
  }
}
migrate();

function seedIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM doctors').get();
  if (countRow.c > 0) return; // already seeded

  const specialties = [
    ['Cardiologist', '❤️'], ['Dentist', '🦷'], ['Dermatologist', '✨'],
    ['Pediatrician', '🧸'], ['Orthopedic', '🦴'], ['Gynecologist', '🩺'],
    ['ENT Specialist', '👂'], ['General Physician', '⚕️'],
  ];
  const insSpec = db.prepare('INSERT INTO specialties (name, icon) VALUES (?, ?)');
  for (const [name, icon] of specialties) insSpec.run(name, icon);

  const doctors = [
    ['Dr. Ayesha Raza','Cardiologist','Lahore','Shifa International','MBBS, FCPS (Cardiology)',12,2500,'Urdu,English,Punjabi',4.8,214,'https://i.pravatar.cc/160?img=47',31.5204,74.3587,'Dr. Ayesha specializes in interventional cardiology and preventive heart care, with over a decade of experience treating patients across Punjab.','+923010000001'],
    ['Dr. Bilal Ahmed','Dentist','Karachi','Aga Khan Dental Clinic','BDS, RDS',8,1500,'Urdu,English,Sindhi',4.6,132,'https://i.pravatar.cc/160?img=12',24.8607,67.0011,'Dr. Bilal focuses on cosmetic and restorative dentistry, helping patients with everything from cleanings to full smile makeovers.','+923010000002'],
    ['Dr. Sana Khan','Dermatologist','Islamabad','PIMS Skin Clinic','MBBS, DDD',9,2000,'Urdu,English',4.7,98,'https://i.pravatar.cc/160?img=32',33.6844,73.0479,'Dr. Sana treats acne, eczema, and pigmentation disorders, and is known for a patient-first, no-rush approach to consultations.','+923010000003'],
    ['Dr. Usman Tariq','Pediatrician','Lahore',"Children's Hospital Lahore",'MBBS, FCPS (Paeds)',15,1800,'Urdu,English,Punjabi',4.9,301,'https://i.pravatar.cc/160?img=15',31.5497,74.3436,'Dr. Usman has spent 15 years caring for newborns and children, with a special interest in childhood immunization and nutrition.','+923010000004'],
    ['Dr. Hina Malik','Gynecologist','Karachi','South City Hospital','MBBS, FCPS (Gynae)',11,2200,'Urdu,English',4.7,176,'https://i.pravatar.cc/160?img=44',24.8138,67.0300,"Dr. Hina provides comprehensive women's health care, from prenatal checkups to gynecological surgery.",'+923010000005'],
    ['Dr. Faisal Qureshi','Orthopedic','Rawalpindi','Benazir Bhutto Hospital','MBBS, MS (Ortho)',14,2300,'Urdu,English,Punjabi',4.5,87,'https://i.pravatar.cc/160?img=53',33.5651,73.0169,'Dr. Faisal treats fractures, joint pain, and sports injuries, with a focus on non-surgical recovery where possible.','+923010000006'],
    ['Dr. Mahnoor Siddiqui','ENT Specialist','Faisalabad','Al-Noor Clinic','MBBS, FCPS (ENT)',7,1700,'Urdu,English',4.4,65,'https://i.pravatar.cc/160?img=25',31.4504,73.1350,'Dr. Mahnoor treats ear, nose, and throat conditions for patients of all ages, including chronic sinus issues.','+923010000007'],
    ['Dr. Zubair Khan','General Physician','Peshawar','Lady Reading Hospital','MBBS',6,1200,'Urdu,Pashto,English',4.3,54,'https://i.pravatar.cc/160?img=60',34.0151,71.5249,'Dr. Zubair provides general checkups, fever and infection management, and referrals to specialists when needed.','+923010000008'],
    ['Dr. Rabia Farooq','Cardiologist','Karachi','Tabba Heart Institute','MBBS, FCPS (Cardiology)',10,2600,'Urdu,English,Sindhi',4.8,189,'https://i.pravatar.cc/160?img=48',24.8955,67.0822,'Dr. Rabia specializes in heart failure management and cardiac rehabilitation programs.','+923010000009'],
    ['Dr. Omar Sheikh','Dentist','Islamabad','Smile Care Dental','BDS, MSc (Orthodontics)',5,1600,'Urdu,English',4.5,41,'https://i.pravatar.cc/160?img=68',33.7077,73.0498,'Dr. Omar specializes in braces, aligners, and orthodontic correction for teens and adults.','+923010000010'],
  ];
  const insDoc = db.prepare(`INSERT INTO doctors
    (name,specialty,city,hospital,qualification,experience,fee,languages,rating,reviews_count,photo,lat,lng,bio,phone)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const docIds = [];
  for (const d of doctors) {
    const info = insDoc.run(...d);
    docIds.push(Number(info.lastInsertRowid));
  }

  const reviewPool = [
    ['Ahmed R.', 5, 'Very attentive and explained everything clearly.'],
    ['Fatima S.', 4, 'Short wait time and the clinic was clean and organized.'],
    ['Kamran M.', 5, 'Helped a lot with my condition, would recommend.'],
    ['Zara N.', 4, 'Professional and easy to talk to, felt heard.'],
    ['Bilal H.', 5, 'Good experience overall, will visit again.'],
  ];
  const insRev = db.prepare('INSERT INTO reviews (doctor_id, who, rating, text) VALUES (?,?,?,?)');
  docIds.forEach((id, i) => {
    for (let k = 0; k < 3; k++) {
      const r = reviewPool[(i + k) % reviewPool.length];
      insRev.run(id, r[0], r[1], r[2]);
    }
  });

  const emergency = [
    ['Jinnah Postgraduate Medical Centre', 'Karachi', '+922199201300'],
    ['Services Hospital', 'Lahore', '+924299203300'],
    ['Pakistan Institute of Medical Sciences (PIMS)', 'Islamabad', '+925191038000'],
    ['Lady Reading Hospital', 'Peshawar', '+92919218364'],
  ];
  const insEr = db.prepare('INSERT INTO emergency_hospitals (name, city, phone) VALUES (?,?,?)');
  for (const e of emergency) insEr.run(...e);
}

seedIfEmpty();

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

module.exports = { db, hashPassword, verifyPassword };
