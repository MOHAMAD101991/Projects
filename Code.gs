/**
 * Waste Register Database — Apps Script Web App
 *
 * Access is managed centrally by the Central Master List (request screen, approvals,
 * laptops, audit log). See the CENTRAL ACCESS CONNECTOR section at the end of this file.
 * - Owner: Script Properties > SYNC_KEY (Owner login, full access, works even if Central is down)
 * - Everyone else: an approved laptop session from Central (View or Edit)
 * - All data reads, writes and AI relay calls are authenticated server-side
 *   GET ?api=status|verify|redeem|data  (plain JSON, or JSONP with &callback=)
 *
 * Setup (once): add Script Properties CENTRAL_BOOK_ID (Central Master List spreadsheet id) and
 * CENTRAL_URL (Central deployment /exec URL), then run setupSecurity() (owner sync key) and
 * authorizeCentral() (lets this app read Central).
 */

var SHEET_NAMES = ['Waste Register', 'Manpower', 'Options', 'Logs', 'Sustainability', 'Rate'];
var MAX_FAILS = 5;
var LOCK_MS = 60 * 60 * 1000;

/* Run once from the editor to create the Sustainability tab. */
function setupSustainabilitySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Sustainability') || ss.insertSheet('Sustainability');
  if (!sh.getRange(1, 1).getValue()) {
    sh.getRange(1, 1, 1, 3).setValues([['Initiative / Campaign', 'Remarks', 'Status']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/* Optional: run once to create the Rate tab with its header. */
function setupRateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Rate') || ss.insertSheet('Rate');
  if (!sh.getRange(1, 1).getValue()) {
    sh.getRange(1, 1, 1, 7).setValues([['Waste Category', 'Kinds', 'Collection Cost AED', 'Recycling / Treatment Cost (AED)', 'Unit', 'Rebate (AED)', 'Date']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/* =========================================================
   OWNER KEY + LOCK-OUT (everything else is in the Central connector below)
   ========================================================= */

function s_(v) { return v === null || v === undefined ? '' : String(v); }
function nk_(v) { return s_(v).trim().toLowerCase(); }

function syncKey_() {
  try { return s_(PropertiesService.getScriptProperties().getProperty('SYNC_KEY')).trim(); }
  catch (err) { return ''; }
}

function keyOk_(given) {
  var want = syncKey_();
  given = s_(given).trim();
  if (!want || given.length !== want.length) return false;
  var diff = 0;
  for (var i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function ownerEmail_() {
  var configured = '';
  try {
    configured = s_(PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL')).trim();
  } catch (err) {
    Logger.log('Could not read OWNER_EMAIL: ' + err);
  }
  if (configured) return configured;
  try {
    return s_(Session.getEffectiveUser().getEmail()).trim();
  } catch (err) {
    Logger.log('Could not determine effective-user email: ' + err);
    return '';
  }
}
function sendOwnerNotification_(subject, body, html) {
  var to = ownerEmail_();
  if (!to) {
    var missing = 'No owner email is configured. Add OWNER_EMAIL in Apps Script > Project Settings > Script Properties.';
    Logger.log('EMAIL FAILED: ' + missing);
    return { sent: false, error: missing };
  }
  try {
    var quota = MailApp.getRemainingDailyQuota();
    if (quota < 1) {
      var noQuota = 'The Apps Script email quota has been reached. Try again later.';
      Logger.log('EMAIL FAILED to ' + to + ': ' + noQuota);
      return { sent: false, error: noQuota };
    }
    var opts = {
      to: to,
      subject: 'Waste Management Database: ' + subject,
      body: body + '\n\nWaste Register Database access management.'
    };
    if (html) opts.htmlBody = html;
    MailApp.sendEmail(opts);
    Logger.log('EMAIL ACCEPTED by MailApp: ' + subject + ' -> ' + to);
    return { sent: true, error: '', recipient: to };
  } catch (err) {
    var message = (err && err.message) ? err.message : String(err);
    Logger.log('EMAIL FAILED to ' + to + ': ' + message);
    return { sent: false, error: message, recipient: to };
  }
}

/** Run manually from the Apps Script editor to test the configured owner email. */
function testOwnerNotification() {
  var to = ownerEmail_();
  Logger.log('Configured notification recipient: ' + (to || '[NONE]'));
  var result = sendOwnerNotification_(
    'Email notification test',
    'This is a test notification from the Waste Management Database. If you received this email, the notification service is working.',
    '<div style="font-family:Arial,sans-serif;padding:20px"><h2>Waste Management Database</h2><p>Email notification test successful.</p><p>Your Apps Script MailApp accepted this test message.</p></div>'
  );
  Logger.log('Notification test result: ' + (result.sent ? 'SUCCESS' : 'FAILED - ' + result.error));
  return result;
}

function lockedUntil_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty('LOCK_UNTIL') || 0);
  return v > Date.now() ? v : 0;
}
function recordFail_(action) {
  var props = PropertiesService.getScriptProperties(), now = Date.now(), list = [];
  try { list = JSON.parse(props.getProperty('FAILS') || '[]'); } catch (err) { list = []; }
  list = list.filter(function (t) { return now - t < LOCK_MS; });
  list.push(now);
  props.setProperty('FAILS', JSON.stringify(list));
  if (list.length >= MAX_FAILS) {
    props.setProperty('LOCK_UNTIL', String(now + LOCK_MS));
    props.setProperty('FAILS', '[]');
    log_('?', '', action, 'LOCKED for 1 hour after ' + MAX_FAILS + ' wrong keys');
    sendOwnerNotification_('Access locked after repeated incorrect keys',
      MAX_FAILS + ' incorrect sync keys were entered within one hour. All access is locked for one hour. Review the deployment and change SYNC_KEY if needed.');
  }
}
function denied_() {
  return { ok: false, code: 'BAD_KEY',
    error: syncKey_() ? 'No access yet. Request access through the Central Master List.'
      : 'Access is not configured. The owner must run setupSecurity() in Apps Script.' };
}
function verifyAccess(p) {
  p = p || {};
  var who = auth_({ syncKey: p.syncKey }, 'owner verification');
  if (!who.ok) return who.res;
  return { ok: true, status: 'approved', role: 'owner', name: 'Owner' };
}
function setupSecurity() {
  var props = PropertiesService.getScriptProperties();
  var existing = s_(props.getProperty('SYNC_KEY')).trim();
  if (!existing) {
    var key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
    props.setProperty('SYNC_KEY', key);
    Logger.log('New owner sync key: ' + key);
  } else Logger.log('An owner sync key already exists. It has not been replaced.');
  var notificationEmail = ownerEmail_();
  Logger.log('Owner notification recipient: ' + (notificationEmail || '[NOT CONFIGURED]'));
  if (!notificationEmail) Logger.log('Optional: add OWNER_EMAIL in Project Settings > Script Properties to receive lock-out alerts.');
  return 'Owner sync key ready.';
}

/* =========================================================
   OPEN HTML OR RETURN AUTHENTICATED SHEET DATA
   ========================================================= */

function getData(payload) {
  var who = auth_(payload, 'read');
  if (!who.ok) return { __error: who.res.error, __code: who.res.code || 'NO_ACCESS' };
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = {};
  SHEET_NAMES.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var values = sh.getDataRange().getValues();
    out[name] = values.map(function(row) {
      return row.map(function(cell) {
        if (cell instanceof Date) return Utilities.formatDate(cell, Session.getScriptTimeZone() || 'Asia/Dubai', 'dd-MM-yyyy');
        return cell === null || cell === undefined ? '' : String(cell);
      });
    });
  });
  /* manpower is kept in the Central Master List (one source of truth, shared with Clinic and Training) */
  try { var mpc = centralManpowerRows_(); if (mpc) out['Manpower'] = mpc; } catch (e) { Logger.log('Central manpower read failed: ' + e); }
  return out;
}

/** Rows of one section of the Central 'Safety Matrix' tab: the month table (title '') or a titled block
 *  such as 'MANPOWER' / 'LTI REGISTER' (header row + rows, up to the next blank row). Trailing empty columns are trimmed. */
function safetySection_(data, title) {
  var out = [], on = !title;
  for (var i = 0; i < data.length; i++) {
    var r = data[i], a = String(r[0]).trim(), blank = !r.some(function (c) { return String(c).trim(); });
    if (!on) { if (a.toUpperCase() === title && !String(r[1] || '').trim()) on = true; continue; }
    if (blank) { if (out.length) break; continue; }
    out.push(r);
  }
  if (!out.length) return out;
  var w = 0; out[0].forEach(function (c, j) { if (String(c).trim()) w = j + 1; });
  return out.map(function (r) { return r.slice(0, w); });
}

/** Manpower lives in the MANPOWER section of the Central Master List tab "Safety Matrix" (edited from the Clinic Safety matrix page).
 *  Returned here in this app's old Manpower layout: Month | Manpower | Category | Number. */
function centralManpowerRows_() {
  var sh = SpreadsheetApp.openById(cc_bookId_()).getSheetByName('Safety Matrix');
  if (!sh || sh.getLastRow() < 2) return null;
  var data = safetySection_(sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues(), 'MANPOWER');
  if (data.length < 2) return null;
  var head = data[0];
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var out = [['Month', 'Manpower', 'Category', 'Number']], cols = [];
  for (var c = 2; c < head.length; c++) {
    var mm = String(head[c]).trim().toLowerCase().match(/^([a-z]+)[\s-]+(\d{4})$/);
    if (!mm || MONTHS.indexOf(mm[1]) < 0) continue;
    cols.push({ c: c, d: '01-' + ('0' + (MONTHS.indexOf(mm[1]) + 1)).slice(-2) + '-' + mm[2] });
  }
  cols.forEach(function (col) {
    var jdn = { 'JDN Local': 0, 'JDN Expat': 0 }, has = {};
    data.slice(1).forEach(function (r) {
      var g = String(r[0]).trim().toLowerCase(), cat = String(r[1]).trim(), v = String(r[col.c]).trim();
      if (!cat || /^total$/i.test(cat) || v === '') return;
      var n = Number(v.replace(/[^0-9.\-]/g, '')); if (isNaN(n)) return;
      if (g === 'jdn') { var k = /expat/i.test(cat) ? 'JDN Expat' : 'JDN Local'; jdn[k] += n; has[k] = true; }
      else if (/^sub/.test(g) && n) out.push([col.d, cat, 'SubCon', String(n)]);
    });
    ['JDN Local', 'JDN Expat'].forEach(function (k) { if (has[k]) out.push([col.d, 'JDN', k, String(jdn[k])]); });
  });
  return out;
}

/* Apps Script HTMLService bridge used by the Waste Register HTML. */
function saveData(body) {
  try {
    var payload = typeof body === 'string' ? JSON.parse(body) : (body || {});
    return savePayload_(payload);
  } catch (err) { return { ok: false, status: 'error', message: String(err) }; }
}
function savePayload_(data) {
  var who = auth_(data, 'save');
  if (!who.ok) return { ok: false, status: 'error', message: who.res.error, code: who.res.code };
  if (who.role === 'view') {
    log_(who.name, who.role, 'save', 'refused: view only');
    return { ok: false, status: 'error', message: 'View-only access: changes cannot be saved.' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet(), names = SHEET_NAMES.slice(), skipped = [];
  Object.keys(data).forEach(function(k) { if (names.indexOf(k) < 0 && Array.isArray(data[k])) names.push(k); });
  /* one save at a time: two people saving together could otherwise clear and overwrite each other's tabs */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, status: 'error', message: 'Another save is in progress. Please try again in a moment.' };
  try {
  names.forEach(function(name) {
    if (name === 'Manpower') return; /* manpower is kept in the Central Master List, not in this sheet */
    var rows = data[name];
    if (!Array.isArray(rows) || rows.length === 0) return;
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var existing = Math.max(0, sh.getLastRow() - 1);
    var incoming = rows.slice(1).filter(function(r) {
      return Array.isArray(r) && r.some(function(c) { return String(c == null ? '' : c).trim() !== ''; });
    }).length;
    if (!data.__force && existing > 0 && (incoming === 0 || (existing > 5 && incoming < existing * 0.5))) {
      skipped.push(name + ' (' + incoming + ' vs ' + existing + ' rows)'); return;
    }
    var width = 1;
    rows.forEach(function(row) { if (Array.isArray(row) && row.length > width) width = row.length; });
    var normalizedRows = rows.map(function(row) {
      var copy = Array.isArray(row) ? row.slice() : [''];
      while (copy.length < width) copy.push('');
      return copy.map(function(cell) { cell = cell === null || cell === undefined ? '' : cell; return typeof cell === 'string' && /^(=|\+|@|-(?=[A-Za-z(]))/.test(cell) ? "'" + cell : cell; });   /* typed text never turns into a sheet formula */
    });
    sh.clearContents();
    sh.getRange(1, 1, normalizedRows.length, width).setValues(normalizedRows);
  });
  } finally { try { lock.releaseLock(); } catch (e) {} }
  return { ok: true, status: 'ok', message: skipped.length
    ? 'Updated. Skipped to protect data: ' + skipped.join(', ')
    : 'Google Sheets successfully updated.', skipped: skipped, role: who.role };
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('No data received.');
    var data = JSON.parse(e.postData.contents);
    if (data.type === 'ai') {
      var aiWho = auth_(data, 'ai');
      if (!aiWho.ok) return json_({ ok: false, error: aiWho.res.error });
      if (aiWho.role === 'view') return json_({ ok: false, error: 'AI actions are disabled for View-only access.' });
      return json_(handleAiRequest_(data));
    }
    return json_(savePayload_(data));
  } catch (err) {
    return json_({ ok: false, status: 'error', message: String(err) });
  }
}

function json_(obj, callback) {
  var body = JSON.stringify(obj);
  if (callback) {
    callback = String(callback).trim();
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) return ContentService.createTextOutput(JSON.stringify({ ok:false, error:'Invalid JSONP callback.' })).setMimeType(ContentService.MimeType.JSON);
    return ContentService.createTextOutput(callback + '(' + body + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   AI RELAY (report narrative + Ask AI)
   Script properties: GEMINI_API_KEY or ANTHROPIC_API_KEY.
   ========================================================= */

function handleAiRequest_(body) {
  var props = PropertiesService.getScriptProperties();
  var gKey = props.getProperty('GEMINI_API_KEY');
  var max = Math.min(Number(body.max_tokens) || 1600, 4000);
  var msgs = body.messages || [];
  if (gKey) {
    var base = 'https://generativelanguage.googleapis.com/v1beta/';
    var gen = { temperature: 0.2, maxOutputTokens: Math.max(8192, max * 3) };
    if (/Return ONLY a JSON/.test(body.system || '')) gen.responseMimeType = 'application/json';
    var payload = JSON.stringify({
      systemInstruction: { parts: [{ text: body.system || '' }] },
      contents: msgs.map(function(m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] }; }),
      generationConfig: gen
    });
    var call = function(model) {
      return JSON.parse(UrlFetchApp.fetch(base + model + ':generateContent?key=' + encodeURIComponent(gKey), {
        method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true
      }).getContentText());
    };
    var model = props.getProperty('GEMINI_MODEL') || 'models/gemini-flash-latest';
    var gj = call(model);
    if (gj.error && /no longer available|not found|not supported|deprecated/i.test(gj.error.message || '')) {
      var hint = (gj.error.message.match(/models\/[\w.-]+/g) || []).filter(function(n) { return n !== model; }).pop();
      model = hint || 'models/gemini-flash-latest'; gj = call(model);
    }
    if (gj.error) return { error: gj.error.message || 'Gemini API error' };
    var parts = (((gj.candidates || [])[0] || {}).content || {}).parts || [];
    return { text: parts.filter(function(p) { return !p.thought; }).map(function(p) { return p.text || ''; }).join('').trim() };
  }
  var aKey = props.getProperty('ANTHROPIC_API_KEY');
  if (!aKey) return { error: 'Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in Script properties' };
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': aKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: max, system: body.system || '', messages: msgs }),
    muteHttpExceptions: true
  });
  var json = JSON.parse(resp.getContentText());
  if (json.error) return { error: json.error.message || 'API error' };
  return { text: (json.content || []).map(function(c) { return c.text || ''; }).join('\n').trim() };
}

/* =========================================================
   CENTRAL ACCESS CONNECTOR (Nov 2026)
   Access to this app is now decided by the Central Master List:
     - the Request Access screen, approvals and laptop registration live in Central
     - Central hands an approved laptop a one-time pass (?pass=...) that this app swaps
       for an app session; every protected call re-checks laptop + permission in Central
   The owner sync key still works here (break-glass if Central is unreachable).
   ========================================================= */
var CC_APP_KEY = 'waste';
var CC_APP_NAME = 'Waste Register Database';
var CC_CENTRAL_URL = '';   /* set Script Property CENTRAL_URL to the Central deployment /exec URL */
var CC_SESSION_DAYS = 30;

/** The Central Master List spreadsheet id. Set Script Property CENTRAL_BOOK_ID (Project Settings > Script Properties). */
function cc_bookId_() {
  var id = '';
  try { id = cc_s_(PropertiesService.getScriptProperties().getProperty('CENTRAL_BOOK_ID')).trim(); } catch (e) {}
  if (!id) throw new Error('CENTRAL_BOOK_ID is not set. Add it in Project Settings > Script Properties.');
  return id;
}

function cc_s_(v) { return v === null || v === undefined ? '' : String(v); }
function cc_hash_(v) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, cc_s_(v), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function cc_now_() { return Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyy-MM-dd HH:mm:ss'); }
function cc_gateUrl_() {
  var u = '';
  try { u = cc_s_(PropertiesService.getScriptProperties().getProperty('CENTRAL_URL')).trim(); } catch (e) {}
  u = u || CC_CENTRAL_URL;
  return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'app=' + CC_APP_KEY;
}
function cc_tab_(ss, name) { var sh = ss.getSheetByName(name); if (!sh) throw new Error('Central tab "' + name + '" is missing'); return sh; }
function cc_vals_(sh, w) { var n = sh.getLastRow(); return n < 2 ? [] : sh.getRange(2, 1, n - 1, w).getValues(); }
function cc_audit_(level, action, actor, target, detail) {
  try { SpreadsheetApp.openById(cc_bookId_()).getSheetByName('Audit Log').appendRow([cc_now_(), CC_APP_NAME, level, action, cc_s_(actor).slice(0, 80), cc_s_(target).slice(0, 80), cc_s_(detail).slice(0, 400)]); } catch (e) {}
}

/** Swap a one-time pass for an app session token (32 hex). Returns '' when the pass is not valid. */
function cc_redeem_(pass) {
  pass = cc_s_(pass).trim();
  if (!/^[a-f0-9]{32}$/.test(pass)) return '';
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return '';
  try {
    var sh = cc_tab_(SpreadsheetApp.openById(cc_bookId_()), '_System'), rows = cc_vals_(sh, 5), h = cc_hash_(pass), now = Date.now();
    for (var i = rows.length - 1; i >= 0; i--) {
      var x = rows[i]; if (x[0] !== 'pass' || x[1] !== h) continue;
      if (cc_s_(x[4]) || Number(x[3]) < now) return '';
      var d = {}; try { d = JSON.parse(x[2]); } catch (e) {}
      if (d.app !== CC_APP_KEY) return '';
      sh.getRange(i + 2, 5).setValue(cc_now_());
      var token = Utilities.getUuid().replace(/-/g, '');
      sh.appendRow(['session', cc_hash_(token), JSON.stringify({ dev: d.dev, app: CC_APP_KEY }), now + CC_SESSION_DAYS * 86400000, '']);
      cc_audit_('ACCESS', 'signed in', d.dev, '', 'pass redeemed, app session started');
      return token;
    }
    return '';
  } catch (e) { Logger.log('redeem failed: ' + e); return ''; }
  finally { try { lock.releaseLock(); } catch (x) {} }
}

/**
 * Checks an app session against Central: session -> laptop (must be Active) -> this app's permission (Approved, not expired).
 * Cached for 15 seconds, so a revocation is picked up almost at once.
 */
function cc_check_(token) {
  token = cc_s_(token).trim();
  if (!/^[a-f0-9]{32}$/.test(token)) return { ok: false, status: 'central' };
  var cache = CacheService.getScriptCache(), ck = 'cc_' + cc_hash_(token).slice(0, 40), hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var res;
  try {
    var ss = SpreadsheetApp.openById(cc_bookId_()), h = cc_hash_(token), now = Date.now(), sess = null;
    var sys = cc_vals_(cc_tab_(ss, '_System'), 5);
    for (var i = sys.length - 1; i >= 0; i--) if (sys[i][0] === 'session' && sys[i][1] === h) { sess = sys[i]; break; }
    try { if (sess && JSON.parse(sess[2] || '{}').app !== CC_APP_KEY) sess = null; } catch (eApp) { sess = null; }
    if (!sess) res = { ok: false, status: 'central' };
    else if (Number(sess[3]) < now) res = { ok: false, status: 'central', message: 'Your session ended. Please sign in again through the Central Master List.' };
    else {
      var d = JSON.parse(sess[2] || '{}'), dev = null, devs = cc_vals_(cc_tab_(ss, 'Devices'), 9);
      for (var j = 0; j < devs.length; j++) if (cc_s_(devs[j][0]) === d.dev) { dev = devs[j]; break; }
      if (!dev || cc_s_(dev[3]).toLowerCase() !== 'active') res = { ok: false, status: 'declined', message: 'This laptop is no longer authorised. Sign in again through the Central Master List.' };
      else {
        var email = cc_s_(dev[2]).trim().toLowerCase(), acc = cc_vals_(cc_tab_(ss, 'Access'), 14), perm = null, today = Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyy-MM-dd');
        for (var k = 0; k < acc.length; k++) {
          var a = acc[k];
          if (cc_s_(a[2]).trim().toLowerCase() !== email || cc_s_(a[3]).trim().toLowerCase() !== CC_APP_NAME.toLowerCase()) continue;
          if (/^(approved|rejected|revoked)$/i.test(cc_s_(a[4]))) perm = a;
        }
        var exp = perm ? (perm[6] instanceof Date ? Utilities.formatDate(perm[6], 'Asia/Dubai', 'yyyy-MM-dd') : cc_s_(perm[6]).slice(0, 10)) : '';
        if (!perm || cc_s_(perm[4]).toLowerCase() !== 'approved') res = { ok: false, status: 'declined', message: 'You do not have access to ' + CC_APP_NAME + '. Request it through the Central Master List.' };
        else if (exp && exp < today) res = { ok: false, status: 'expired', message: 'Your access expired on ' + exp + '. Request it again through the Central Master List.' };
        else res = { ok: true, role: cc_s_(perm[5]).toLowerCase() === 'edit' ? 'edit' : 'view', name: cc_s_(perm[1]) || cc_s_(dev[1]), email: email };
      }
    }
  } catch (e) {
    /* fail closed: Central unreachable => no access (owner sync key still works) */
    return { ok: false, status: 'unavailable', message: 'The Central access service is not reachable right now. Try again in a minute.' };
  }
  try { cache.put(ck, JSON.stringify(res), 15); } catch (e) {}
  return res;
}

/* ---------- replacements for the old access functions ---------- */

function accessStatus(p) {
  p = p || {};
  var c = cc_check_(p.deviceToken);
  if (c.ok) return { ok: true, status: 'approved', role: c.role, name: c.name };
  return { ok: true, status: c.status === 'central' ? 'central' : c.status, message: c.message || '', gateUrl: cc_gateUrl_() };
}

function auth_(p, action) {
  p = p || {};
  var key = s_(p.syncKey).trim();
  if (key) {
    if (lockedUntil_()) return { ok: false, res: { ok: false, code: 'LOCKED', status: 'locked', error: 'Owner login is temporarily locked. Try again in an hour.' } };
    if (keyOk_(key)) return { ok: true, role: 'owner', name: 'Owner' };
    log_('?', '', action, 'refused: wrong sync key');
    recordFail_(action);
    var bad = denied_(); bad.status = 'badkey';
    return { ok: false, res: bad };
  }
  var c = cc_check_(p.deviceToken);
  if (c.ok) return { ok: true, role: c.role, name: c.name };
  return { ok: false, res: { ok: false, code: 'NO_ACCESS', status: c.status, error: c.message || 'Sign in through the Central Master List.', gateUrl: cc_gateUrl_() } };
}

/** Logs go to the Central Audit Log; routine loads are not logged. */
function log_(who, role, action, result) {
  try { Logger.log([who, role, action, result].join(' | ')); } catch (e) {}
  if (result === 'ok' && /^(load|sync|refresh|read)$/.test(String(action))) return;
  cc_audit_('ACCESS', action, who + (role ? ' (' + role + ')' : ''), '', result);
}

/** The Central request screen hands a one-time pass to this page; swap it for this browser's app session. */
function ccRedeem(p) {
  var tok = cc_redeem_(p && p.pass);
  return tok ? { ok: true, token: tok } : { ok: false, error: 'The sign-in pass is not valid or has expired. Please try again.' };
}

/** doGet with the Central sign-in hand-over: ?pass=... is swapped for an app session stored in this browser. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = p.callback || null;
  var api = nk_(p.api);
  var credentials = { syncKey: p.key || '', deviceToken: p.dt || '' };

  if (api === 'status') return json_(accessStatus({ deviceToken: p.dt }), callback);
  if (api === 'verify') return json_(verifyAccess({ syncKey: p.key }), callback);
  if (api === 'data') return json_(getData(credentials), callback);
  if (api === 'redeem') return json_(ccRedeem({ pass: p.pass }), callback);
  if (api === 'health' || api === 'ping') return json_({ ok: true, secured: true }, callback);

  var out = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Waste Register Database')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  if (p.pass) {
    var tok = cc_redeem_(p.pass);
    var js = '<script>try{' + (tok ? "localStorage.setItem('wasteDeviceToken.v1','" + tok + "');" : '') + "sessionStorage.setItem('cc.pass','" + (tok ? 'ok' : 'bad') + "');}catch(e){}</script>";
    var html = out.getContent(), at = html.indexOf('<head>');
    out.setContent(at >= 0 ? html.slice(0, at + 6) + js + html.slice(at + 6) : js + html);
  }
  return out;
}

/**
 * Run ONCE from the editor: lets Waste read the Central Master List sheet (access checks, sign-in passes).
 * Google shows a permission window - tick "See, edit, create and delete all your Google Sheets spreadsheets" and Allow.
 */
function authorizeCentral() {
  try { ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); } catch (e) {}
  var ss = SpreadsheetApp.openById(cc_bookId_());
  Logger.log('OK - Waste can read "' + ss.getName() + '". Access checks will now work.');
}
