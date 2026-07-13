// app.js — talks to the real backend at /api/*
const API = ''; // same-origin

let SPECIALTIES = [];
let CITIES = [];
let currentBookingDoctor = null;
let selectedSlot = null;
let heroSearchMode = 'specialty';
let authToken = null;   // kept in memory only for this session
let currentUser = null;
let authMode = 'login';

/* ---------------- helpers ---------------- */
function fillSelect(el, items, placeholder) {
  el.innerHTML = '';
  if (placeholder) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = placeholder;
    el.appendChild(o);
  }
  items.forEach(i => {
    const o = document.createElement('option');
    o.value = i; o.textContent = i;
    el.appendChild(o);
  });
}

function starString(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

async function api(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(API + path, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}

/* ---------------- init ---------------- */
async function init() {
  try {
    const [specialties, cities, doctors] = await Promise.all([
      api('/api/specialties'),
      api('/api/cities'),
      api('/api/doctors'),
    ]);
    SPECIALTIES = specialties;
    CITIES = cities;

    fillSelect(document.getElementById('heroCity'), CITIES, 'Any city');
    fillSelect(document.getElementById('heroPrimary'), SPECIALTIES.map(s => s.name), null);
    fillSelect(document.getElementById('fSpecialty'), SPECIALTIES.map(s => s.name), 'Any specialty');
    fillSelect(document.getElementById('fCity'), CITIES, 'Any city');

    document.getElementById('specGrid').innerHTML = SPECIALTIES.map(s => `
      <a class="spec-chip" href="#" onclick="quickSpecialty('${s.name}');return false;">
        <span class="ic">${s.icon || '⚕️'}</span>${s.name}
      </a>`).join('');

    document.getElementById('statDoctors').textContent = doctors.length + '+';
    document.getElementById('statCities').textContent = CITIES.length;

    renderDoctorGrid(doctors);
  } catch (e) {
    showToast('Could not reach the server. Is it running?');
    console.error(e);
  }

  try {
    const hospitals = await api('/api/emergency-hospitals');
    document.getElementById('emergencyList').innerHTML = hospitals.map(h => `
      <div class="er-item">
        <div><div class="name">${h.name}</div><div class="city">${h.city}</div></div>
        <a href="tel:${h.phone}" class="btn btn-urgent btn-sm">Call</a>
      </div>`).join('');
  } catch (e) { /* non-critical */ }
}

/* ---------------- routing ---------------- */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('visible'));
  document.getElementById('page-' + id).classList.add('visible');
  document.querySelectorAll('nav.links a').forEach(a => a.classList.toggle('active', a.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('navLinks').classList.remove('mobile-open');
}

/* ---------------- hero search ---------------- */
function setSearchMode(mode) {
  heroSearchMode = mode;
  document.querySelectorAll('.search-tabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const label = document.getElementById('heroPrimaryLabel');
  const select = document.getElementById('heroPrimary');
  if (mode === 'specialty') {
    label.textContent = 'Specialty';
    fillSelect(select, SPECIALTIES.map(s => s.name), null);
  } else if (mode === 'city') {
    label.textContent = 'City';
    fillSelect(select, CITIES, null);
  } else {
    label.textContent = 'Hospital / Clinic';
    select.innerHTML = '<option value="">Type a hospital name in results</option>';
  }
}

function runHeroSearch() {
  resetFiltersUIOnly();
  const primaryVal = document.getElementById('heroPrimary').value;
  const cityVal = document.getElementById('heroCity').value;
  if (heroSearchMode === 'specialty') document.getElementById('fSpecialty').value = primaryVal;
  if (heroSearchMode === 'city') document.getElementById('fCity').value = primaryVal;
  if (cityVal) document.getElementById('fCity').value = cityVal;
  showPage('results');
  applyFilters();
}

function quickSpecialty(name) {
  resetFiltersUIOnly();
  document.getElementById('fSpecialty').value = name;
  showPage('results');
  applyFilters();
}

/* ---------------- filters / results ---------------- */
function resetFiltersUIOnly() {
  document.getElementById('fSpecialty').value = '';
  document.getElementById('fCity').value = '';
  document.getElementById('fHospital').value = '';
  document.getElementById('fLang').value = '';
}
function resetFilters() { resetFiltersUIOnly(); applyFilters(); }

async function applyFilters() {
  const spec = document.getElementById('fSpecialty').value;
  const city = document.getElementById('fCity').value;
  const hosp = document.getElementById('fHospital').value.trim();
  const lang = document.getElementById('fLang').value;
  const params = new URLSearchParams();
  if (spec) params.set('specialty', spec);
  if (city) params.set('city', city);
  if (hosp) params.set('hospital', hosp);
  if (lang) params.set('lang', lang);

  document.getElementById('resultCount').textContent = 'Searching…';
  try {
    const list = await api('/api/doctors?' + params.toString());
    renderDoctorGrid(list);
  } catch (e) {
    showToast('Search failed. Please try again.');
  }
}

function renderDoctorGrid(list) {
  const grid = document.getElementById('doctorGrid');
  document.getElementById('resultCount').textContent = list.length + ' doctor' + (list.length === 1 ? '' : 's') + ' found';
  if (list.length === 0) {
    grid.innerHTML = `<div class="no-results">No doctors match these filters yet. Try a different city or specialty.</div>`;
    return;
  }
  grid.innerHTML = list.map(d => `
    <div class="doc-card">
      <div class="avatar-wrap">
        <img class="avatar" src="${d.photo}" alt="Photo of ${d.name}">
        <span class="verified-badge" title="Verified">✓</span>
      </div>
      <div>
        <h3><a href="#" onclick="openProfile(${d.id});return false;" style="text-decoration:none;color:inherit;">${d.name}</a></h3>
        <div class="doc-meta">${d.qualification || ''} · ${d.experience} yrs experience · ${d.hospital}, ${d.city}</div>
        <div class="doc-tags">
          <span class="tag">${d.specialty}</span>
          ${d.languages.map(l => `<span class="tag">${l}</span>`).join('')}
        </div>
        <span class="stars">${starString(d.rating)}<span class="count">${d.rating} (${d.reviews_count} reviews)</span></span>
      </div>
      <div class="doc-side">
        <div class="fee">Rs. ${d.fee}<small>Consultation fee</small></div>
        <button class="btn btn-primary btn-sm" onclick="openProfile(${d.id});return false;">View &amp; Book</button>
        <a href="tel:${d.phone}" class="btn btn-ghost btn-sm">📞 Call</a>
      </div>
    </div>`).join('');
}

/* ---------------- doctor profile ---------------- */
async function openProfile(id) {
  let d;
  try { d = await api('/api/doctors/' + id); }
  catch (e) { showToast('Could not load this doctor.'); return; }

  currentBookingDoctor = d;
  selectedSlot = null;
  const slots = ['10:00 AM', '11:30 AM', '2:00 PM', '3:30 PM', '5:00 PM', '6:30 PM'];
  const mapSrc = 'https://maps.google.com/maps?q=' + d.lat + ',' + d.lng + '&z=14&output=embed';

  document.getElementById('profileWrap').innerHTML = `
    <div class="profile-main">
      <div class="profile-header">
        <img src="${d.photo}" alt="Photo of ${d.name}">
        <div>
          <h2 style="margin-bottom:2px;">${d.name}</h2>
          <div class="doc-meta">${d.qualification || ''} · ${d.experience} yrs experience</div>
          <span class="stars">${starString(d.rating)}<span class="count">${d.rating} (${d.reviews_count} reviews)</span></span>
        </div>
        <span class="stamp">Verified</span>
      </div>

      <div class="block-title">About</div>
      <p style="color:var(--ink-soft);font-size:.92rem;">${d.bio || ''}</p>

      <div class="block-title">Languages spoken</div>
      <div class="doc-tags">${d.languages.map(l => `<span class="tag">${l}</span>`).join('')}</div>

      <div class="block-title">Available slots — today</div>
      <div class="slots" id="slotWrap">
        ${slots.map(s => `<button type="button" class="slot" onclick="pickSlot(this,'${s}')">${s}</button>`).join('')}
      </div>

      <div class="block-title">Patient reviews</div>
      <div id="reviewsList">
        ${d.reviews.map(r => `
          <div class="review">
            <span class="stars">${starString(r.rating)}</span>
            <div class="who">${r.who}</div>
            <p>${r.text}</p>
          </div>`).join('') || '<p class="empty-note">No reviews yet — be the first to share your experience.</p>'}
      </div>

      <div class="review-form">
        <div class="block-title" style="margin-top:0;">Leave a review</div>
        ${currentUser ? '' : `
        <div class="rx-field">
          <label>Your name</label>
          <input type="text" id="revName" placeholder="Your name">
        </div>`}
        <div class="rx-field">
          <label>Your rating</label>
          <div class="star-picker" id="revStars">
            ${[1,2,3,4,5].map(n => `<span data-n="${n}" onclick="setReviewStars(${n})">☆</span>`).join('')}
          </div>
        </div>
        <div class="rx-field">
          <label>Your review</label>
          <input type="text" id="revText" placeholder="Share how your visit went">
        </div>
        <button class="btn btn-primary btn-sm" id="revSubmitBtn" onclick="submitReview(${d.id})">Post review</button>
      </div>
    </div>

    <div class="profile-side">
      <div class="side-card">
        <div class="fee-box">
          <div><div style="font-size:.75rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;">Consultation fee</div>
          <div class="fee">Rs. ${d.fee}</div></div>
        </div>
        <button class="btn btn-primary" onclick="goToBooking()">Book Appointment</button>
        <a href="tel:${d.phone}" class="btn btn-urgent">📞 Call Clinic</a>
        <a href="https://wa.me/${d.phone.replace('+','')}" class="btn btn-accent">💬 WhatsApp</a>
      </div>
      <div class="side-card">
        <h4>Clinic location</h4>
        <iframe src="${mapSrc}" loading="lazy" style="width:100%;height:170px;border:0;border-radius:8px;margin-bottom:10px;"></iframe>
        <div class="addr">${d.hospital}, ${d.city}, Pakistan</div>
      </div>
    </div>
  `;
  showPage('profile');
}

function pickSlot(btn, slot) {
  document.querySelectorAll('#slotWrap .slot').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedSlot = slot;
}

function goToBooking() {
  if (!currentBookingDoctor) return;
  document.getElementById('bookingSub').textContent =
    'Booking with ' + currentBookingDoctor.name + ' — ' + currentBookingDoctor.hospital + ', ' + currentBookingDoctor.city;
  document.getElementById('bkSlot').value = selectedSlot || '';
  document.getElementById('bookingFormWrap').style.display = 'block';
  document.getElementById('bookingConfirmed').style.display = 'none';
  showPage('booking');
}

/* ---------------- booking (persisted to the database) ---------------- */
async function confirmBooking() {
  const name = document.getElementById('bkName').value.trim();
  const phone = document.getElementById('bkPhone').value.trim();
  const date = document.getElementById('bkDate').value;
  const slot = document.getElementById('bkSlot').value;
  const reason = document.getElementById('bkReason').value.trim();

  if (!name || !phone) { showToast('Please fill in your name and phone number.'); return; }
  if (!currentBookingDoctor) { showToast('Please choose a doctor first.'); return; }

  const btn = document.getElementById('bkSubmitBtn');
  btn.disabled = true; btn.textContent = 'Booking…';
  try {
    const result = await api('/api/appointments', {
      method: 'POST',
      body: JSON.stringify({ doctor_id: currentBookingDoctor.id, patient_name: name, phone, date, slot, reason }),
    });
    document.getElementById('bookingFormWrap').style.display = 'none';
    const box = document.getElementById('bookingConfirmed');
    box.style.display = 'block';
    box.innerHTML = `
      <div class="confirmation">
        <div class="ic">✅</div>
        <h3>Appointment requested</h3>
        <p style="color:var(--ink-soft);">${name}, your appointment with <strong>${currentBookingDoctor.name}</strong> at ${currentBookingDoctor.hospital} has been saved${date ? ' for ' + date : ''}${slot ? ' at ' + slot : ''}.</p>
        <div class="ref">Reference: ${result.ref}</div>
        <p style="font-size:.85rem;color:var(--ink-soft);">This booking is now stored in the database. A confirmation SMS will be sent to ${phone} once the clinic confirms your slot.</p>
        <button class="btn btn-primary" style="margin-top:10px;" onclick="showPage('results')">Find another doctor</button>
      </div>`;
    showToast('Appointment saved — reference ' + result.ref);
  } catch (e) {
    showToast('Could not save this booking. Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirm Appointment';
  }
}

/* ---------------- contact (persisted) ---------------- */
async function sendContactMessage() {
  const name = document.getElementById('cName').value.trim();
  const contact = document.getElementById('cContact').value.trim();
  const message = document.getElementById('cMessage').value.trim();
  if (!message) { showToast('Please write a message first.'); return; }
  try {
    await api('/api/contact', { method: 'POST', body: JSON.stringify({ name, contact, message }) });
    showToast('Message sent. Our team will reach out shortly.');
    document.getElementById('cName').value = '';
    document.getElementById('cContact').value = '';
    document.getElementById('cMessage').value = '';
  } catch (e) {
    showToast('Could not send message. Please try again.');
  }
}

/* ---------------- auth (real, persisted, password-hashed) ---------------- */
function openLogin() { document.getElementById('loginModal').classList.add('visible'); }
function closeLogin() { document.getElementById('loginModal').classList.remove('visible'); }

function setRole(role) {
  document.querySelectorAll('.role-tabs button').forEach(b => b.classList.toggle('active', b.dataset.role === role));
  updateAuthTitle();
}
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  document.getElementById('nameField').style.display = authMode === 'signup' ? 'block' : 'none';
  updateAuthTitle();
}
function updateAuthTitle() {
  const role = document.querySelector('.role-tabs button.active').dataset.role;
  const roleLabel = role === 'patient' ? 'Patient' : 'Doctor';
  document.getElementById('authTitle').textContent = roleLabel + (authMode === 'login' ? ' Login' : ' Sign up');
  document.getElementById('authSwitchText').textContent = authMode === 'login' ? 'New here?' : 'Already have an account?';
  document.getElementById('authSwitchBtn').textContent = authMode === 'login' ? 'Create an account' : 'Log in instead';
}

async function submitAuth() {
  const role = document.querySelector('.role-tabs button.active').dataset.role;
  const phone = document.getElementById('authPhone').value.trim();
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value.trim();

  if (!phone || !password) { showToast('Please enter phone and password.'); return; }

  try {
    let result;
    if (authMode === 'signup') {
      result = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ role, name, phone, password }) });
    } else {
      result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
    }
    authToken = result.token;
    currentUser = result.user;
    document.getElementById('authAreaBtn').textContent = (currentUser.name || currentUser.phone) + ' ▾';
    if (currentUser.role === 'doctor') {
      document.getElementById('portalBtn').style.display = 'inline-flex';
    }
    closeLogin();
    showToast(authMode === 'signup' ? 'Account created. Welcome!' : 'Logged in successfully.');
    if (currentUser.role === 'doctor' && authMode === 'signup') {
      showPage('doctor-portal');
      loadDoctorPortal();
    }
  } catch (e) {
    showToast(e.message || 'Something went wrong.');
  }
}

/* ---------------- reviews ---------------- */
let reviewStars = 0;
function setReviewStars(n) {
  reviewStars = n;
  document.querySelectorAll('#revStars span').forEach(s => {
    const val = Number(s.dataset.n);
    s.textContent = val <= n ? '★' : '☆';
    s.classList.toggle('filled', val <= n);
  });
}

async function submitReview(doctorId) {
  const nameField = document.getElementById('revName');
  const name = currentUser ? (currentUser.name || currentUser.phone) : (nameField ? nameField.value.trim() : '');
  const text = document.getElementById('revText').value.trim();

  if (!name) { showToast('Please enter your name.'); return; }
  if (!reviewStars) { showToast('Please pick a star rating.'); return; }
  if (!text) { showToast('Please write a short review.'); return; }

  const btn = document.getElementById('revSubmitBtn');
  btn.disabled = true; btn.textContent = 'Posting…';
  try {
    const result = await api(`/api/doctors/${doctorId}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ who: name, rating: reviewStars, text }),
    });
    document.getElementById('reviewsList').innerHTML = result.reviews.map(r => `
      <div class="review">
        <span class="stars">${starString(r.rating)}</span>
        <div class="who">${r.who}</div>
        <p>${r.text}</p>
      </div>`).join('');
    document.getElementById('revText').value = '';
    if (nameField) nameField.value = '';
    setReviewStars(0);
    showToast('Thanks — your review was posted.');
  } catch (e) {
    showToast(e.message || 'Could not post your review.');
  } finally {
    btn.disabled = false; btn.textContent = 'Post review';
  }
}

/* ---------------- doctor portal ---------------- */
async function loadDoctorPortal() {
  const wrap = document.getElementById('portalWrap');
  if (!authToken || !currentUser || currentUser.role !== 'doctor') {
    wrap.innerHTML = '<p style="padding:0 24px;color:var(--ink-soft);">Log in with a doctor account to access your portal.</p>';
    return;
  }
  wrap.innerHTML = '<p style="padding:0 24px;color:var(--ink-soft);">Loading your portal…</p>';

  let doc, appts;
  try {
    [doc, appts] = await Promise.all([
      api('/api/doctor/me'),
      api('/api/doctor/me/appointments'),
    ]);
  } catch (e) {
    wrap.innerHTML = `<p style="padding:0 24px;color:var(--ink-soft);">${e.message || 'Could not load your portal.'}</p>`;
    return;
  }

  const specOptions = SPECIALTIES.map(s => `<option value="${s.name}" ${s.name === doc.specialty ? 'selected' : ''}>${s.name}</option>`).join('');
  const cityOptions = CITIES.map(c => `<option value="${c}" ${c === doc.city ? 'selected' : ''}>${c}</option>`).join('');
  const allLangs = ['Urdu', 'English', 'Punjabi', 'Pashto', 'Sindhi'];

  wrap.innerHTML = `
    <div class="portal-card">
      <h4>Your profile</h4>
      <div class="rx-field"><label>Full name</label><input type="text" id="pName" value="${doc.name || ''}"></div>
      <div class="form-row">
        <div class="rx-field"><label>Specialty</label><select id="pSpecialty">${specOptions}</select></div>
        <div class="rx-field"><label>City</label><select id="pCity">${cityOptions}</select></div>
      </div>
      <div class="rx-field"><label>Hospital / Clinic</label><input type="text" id="pHospital" value="${doc.hospital || ''}"></div>
      <div class="rx-field"><label>Qualification</label><input type="text" id="pQualification" value="${doc.qualification || ''}"></div>
      <div class="form-row">
        <div class="rx-field"><label>Years of experience</label><input type="number" min="0" id="pExperience" value="${doc.experience || 0}"></div>
        <div class="rx-field"><label>Consultation fee (Rs.)</label><input type="number" min="0" id="pFee" value="${doc.fee || 0}"></div>
      </div>
      <div class="rx-field"><label>Clinic phone</label><input type="text" id="pPhone" value="${doc.phone || ''}"></div>
      <div class="rx-field"><label>Photo URL</label><input type="text" id="pPhoto" value="${doc.photo || ''}"></div>
      <div class="rx-field"><label>Languages spoken</label>
        <select id="pLanguages" multiple size="5">
          ${allLangs.map(l => `<option value="${l}" ${doc.languages.includes(l) ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="rx-field"><label>About / bio</label><input type="text" id="pBio" value="${(doc.bio || '').replace(/"/g,'&quot;')}"></div>
      <button class="btn btn-primary" id="pSaveBtn" onclick="saveDoctorProfile()">Save changes</button>
    </div>

    <div style="display:flex;flex-direction:column;gap:20px;">
      <div class="portal-card">
        <h4>Available timings</h4>
        <div class="slots-editor" id="pSlots">
          ${doc.slots.map(s => `
            <span class="slot-tag">${s} <button type="button" onclick="removeSlot(this,'${s}')">✕</button></span>`).join('')}
        </div>
        <div class="add-slot-row">
          <input type="text" id="newSlotInput" placeholder="e.g. 4:00 PM">
          <button class="btn btn-ghost btn-sm" onclick="addSlot()">Add slot</button>
        </div>
        <p style="font-size:.78rem;color:var(--ink-soft);margin-top:10px;">These are the times patients can pick when booking you. Click "Save changes" above after editing.</p>
      </div>

      <div class="portal-card">
        <h4>Your appointments (${appts.length})</h4>
        ${appts.length === 0 ? '<p class="empty-note">No appointments booked yet.</p>' : appts.map(a => `
          <div class="appt-item">
            <div class="top"><span>${a.patient_name}</span><span class="status">${a.status}</span></div>
            <div class="meta">${a.appt_date || 'Date not specified'} · ${a.slot || 'No slot chosen'} · ${a.phone}</div>
            ${a.reason ? `<div class="meta">Reason: ${a.reason}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>
  `;
}

let pendingSlots = null;
function currentSlotsFromDom() {
  return Array.from(document.querySelectorAll('#pSlots .slot-tag')).map(el => el.firstChild.textContent.trim());
}
function removeSlot(btn, slot) {
  btn.parentElement.remove();
}
function addSlot() {
  const input = document.getElementById('newSlotInput');
  const val = input.value.trim();
  if (!val) return;
  const wrap = document.getElementById('pSlots');
  const span = document.createElement('span');
  span.className = 'slot-tag';
  span.innerHTML = `${val} <button type="button" onclick="this.parentElement.remove()">✕</button>`;
  wrap.appendChild(span);
  input.value = '';
}

async function saveDoctorProfile() {
  const btn = document.getElementById('pSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const languages = Array.from(document.getElementById('pLanguages').selectedOptions).map(o => o.value);
  const slots = currentSlotsFromDom();
  try {
    await api('/api/doctor/me', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('pName').value.trim(),
        specialty: document.getElementById('pSpecialty').value,
        city: document.getElementById('pCity').value,
        hospital: document.getElementById('pHospital').value.trim(),
        qualification: document.getElementById('pQualification').value.trim(),
        experience: document.getElementById('pExperience').value,
        fee: document.getElementById('pFee').value,
        phone: document.getElementById('pPhone').value.trim(),
        photo: document.getElementById('pPhoto').value.trim(),
        bio: document.getElementById('pBio').value.trim(),
        languages,
        slots,
      }),
    });
    showToast('Profile updated — patients will see these changes right away.');
  } catch (e) {
    showToast(e.message || 'Could not save changes.');
  } finally {
    btn.disabled = false; btn.textContent = 'Save changes';
  }
}

/* ---------------- toast ---------------- */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3200);
}

init();
