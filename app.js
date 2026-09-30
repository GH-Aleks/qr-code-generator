/* QR-Code-Generator – läuft komplett im Browser.
 * Es gibt keine Netzwerkzugriffe (kein fetch/XHR) und keine Speicherung
 * (kein localStorage, keine Cookies). Die QR-Berechnung übernimmt die lokal
 * eingebundene Bibliothek vendor/qrcode.js (qrcode-generator, MIT). */
(function () {
  'use strict';

  // Text als UTF-8 kodieren (Umlaute, Emoji), nicht als ISO-8859-1.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  var QUIET_ZONE = 4; // Modul-Breite des weißen Rands laut QR-Spezifikation
  var HEX = /^#[0-9a-f]{6}$/i;

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    form: $('qr-form'),
    box: $('qr-box'),
    empty: $('qr-empty'),
    info: $('qr-info'),
    notes: $('notes'),
    status: $('status'),
    payload: $('payload'),
    size: $('size'),
    sizeOut: $('size-out'),
    sizeHint: $('size-hint'),
    fg: $('fg'),
    bg: $('bg'),
    fgHex: $('fg-hex'),
    bgHex: $('bg-hex'),
    dlPng: $('dl-png'),
    dlSvg: $('dl-svg'),
    copy: $('copy'),
    copyHint: $('copy-hint')
  };

  var current = null; // { qr, n, fg, bg, cell, type }

  // ---------- Hilfsfunktionen ----------

  function radioValue(name) {
    var r = els.form.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }

  function val(id) { return $(id).value; }

  function hexToRgb(hex) {
    return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
  }

  function luminance(hex) {
    var c = hexToRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function fmtRatio(r) {
    return (Math.round(r * 10) / 10).toString().replace('.', ',') + ':1';
  }

  // ---------- Inhalte bauen ----------

  // WIFI:-Schema: \ ; , : " müssen mit Backslash maskiert werden.
  function escapeWifi(s) {
    return s.replace(/([\\;,:"])/g, '\\$1');
  }

  function buildWifi() {
    var ssid = val('wifi-ssid');
    if (!ssid) return { payload: '', notes: [] };
    var sec = val('wifi-security');
    var pw = val('wifi-password');
    var notes = [];
    var p = 'WIFI:T:' + sec + ';S:' + escapeWifi(ssid) + ';';
    if (sec !== 'nopass') {
      if (pw) p += 'P:' + escapeWifi(pw) + ';';
      else notes.push('Kein Passwort eingetragen – das Netzwerk wird als geschützt markiert, die Verbindung klappt so nur, wenn es tatsächlich kein Passwort gibt.');
    }
    if ($('wifi-hidden').checked) p += 'H:true;';
    return { payload: p + ';', notes: notes };
  }

  // vCard 3.0: \ ; , und Zeilenumbrüche maskieren.
  function escapeVcard(s) {
    return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  function buildVcard() {
    var first = val('vc-first').trim();
    var last = val('vc-last').trim();
    var org = val('vc-org').trim();
    var tel = val('vc-tel').trim();
    var mail = val('vc-mail').trim();
    if (!first && !last && !org && !tel && !mail) return { payload: '', notes: [] };
    var fn = (first + ' ' + last).trim() || org || tel || mail;
    var lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:' + escapeVcard(last) + ';' + escapeVcard(first) + ';;;',
      'FN:' + escapeVcard(fn)
    ];
    if (org) lines.push('ORG:' + escapeVcard(org));
    if (tel) lines.push('TEL:' + escapeVcard(tel));
    if (mail) lines.push('EMAIL:' + escapeVcard(mail));
    lines.push('END:VCARD');
    return { payload: lines.join('\r\n'), notes: [] };
  }

  function buildEmail() {
    var to = val('em-to').trim().replace(/\s+/g, '');
    if (!to) return { payload: '', notes: [] };
    var notes = [];
    if (!$('em-to').checkValidity()) notes.push('Die E-Mail-Adresse sieht ungültig aus.');
    var q = [];
    var subject = val('em-subject');
    var body = val('em-body').replace(/\r?\n/g, '\r\n');
    if (subject) q.push('subject=' + encodeURIComponent(subject));
    if (body) q.push('body=' + encodeURIComponent(body));
    return { payload: 'mailto:' + to + (q.length ? '?' + q.join('&') : ''), notes: notes };
  }

  function buildText() {
    var t = val('text-value');
    if (!t.trim()) return { payload: '', notes: [] };
    var notes = [];
    // "beispiel.de/pfad" ohne Schema: viele Scanner-Apps zeigen das nur als Text an.
    if (/^[^\s/:@]+\.[a-z]{2,}(\/\S*)?$/i.test(t.trim())) {
      notes.push('Tipp: Schreibe „https://“ davor, damit Scanner-Apps den Inhalt sicher als Link erkennen.');
    }
    return { payload: t, notes: notes };
  }

  var builders = { text: buildText, wifi: buildWifi, vcard: buildVcard, email: buildEmail };

  // ---------- Rendern ----------

  function buildSvg(qr, n, fg, bg, pixelSize) {
    var total = n + 2 * QUIET_ZONE;
    var d = '';
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          var start = c;
          while (c < n && qr.isDark(r, c)) c++;
          var len = c - start;
          d += 'M' + (start + QUIET_ZONE) + ' ' + (r + QUIET_ZONE) + 'h' + len + 'v1h-' + len + 'z';
        } else {
          c++;
        }
      }
    }
    var dim = pixelSize ? ' width="' + pixelSize + '" height="' + pixelSize + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '"' + dim +
      ' shape-rendering="crispEdges" aria-hidden="true" focusable="false">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + bg + '"/>' +
      '<path d="' + d + '" fill="' + fg + '"/></svg>';
  }

  function buildCanvas(qr, n, fg, bg, cell) {
    var total = n + 2 * QUIET_ZONE;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = total * cell;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + QUIET_ZONE) * cell, (r + QUIET_ZONE) * cell, cell, cell);
      }
    }
    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob lieferte nichts')); }, 'image/png');
    });
  }

  function setNotes(list) {
    els.notes.textContent = '';
    list.forEach(function (n) {
      var li = document.createElement('li');
      li.textContent = n.text;
      if (n.error) li.className = 'error';
      els.notes.appendChild(li);
    });
  }

  function setStatus(msg) {
    els.status.textContent = '';
    // kurz leeren, damit gleiche Meldungen erneut vorgelesen werden
    setTimeout(function () { els.status.textContent = msg; }, 30);
  }

  function setExportEnabled(on) {
    els.dlPng.disabled = !on;
    els.dlSvg.disabled = !on;
    els.copy.disabled = !on || !canCopy();
  }

  function showEmpty() {
    current = null;
    els.box.hidden = true;
    els.box.textContent = '';
    els.empty.hidden = false;
    els.info.textContent = '';
    els.payload.textContent = '';
    setExportEnabled(false);
  }

  var TYPE_LABEL = { text: 'Text oder URL', wifi: 'WLAN', vcard: 'Kontakt', email: 'E-Mail' };

  function update() {
    var type = radioValue('type');
    var ecc = radioValue('ecc');
    var fg = els.fg.value;
    var bg = els.bg.value;
    els.fgHex.textContent = fg;
    els.bgHex.textContent = bg;
    els.sizeOut.textContent = els.size.value + ' px';

    if (!HEX.test(fg) || !HEX.test(bg)) { showEmpty(); return; }

    var built = builders[type]();
    var notes = built.notes.map(function (t) { return { text: t }; });

    // Kontrast prüfen (auch ohne Inhalt sichtbar, damit man es beim Einstellen sieht)
    var ratio = contrastRatio(fg, bg);
    if (ratio < 3) {
      notes.push({ text: 'Kontrast nur ' + fmtRatio(ratio) + ' – Scanner werden den Code vermutlich nicht erkennen. Wähle deutlich hellere und dunklere Farben.' });
    } else if (ratio < 4.5) {
      notes.push({ text: 'Kontrast nur ' + fmtRatio(ratio) + ' – das kann die Lesbarkeit verschlechtern. Teste den Code unbedingt mit einem Handy.' });
    }
    if (luminance(fg) > luminance(bg)) {
      notes.push({ text: 'Der Vordergrund ist heller als der Hintergrund (invertierter Code). Nicht alle Scanner-Apps lesen das.' });
    }

    if (!built.payload) {
      setNotes(notes);
      showEmpty();
      return;
    }

    var qr, n;
    try {
      qr = qrcode(0, ecc); // 0 = kleinste passende Version automatisch wählen
      qr.addData(built.payload);
      qr.make();
      n = qr.getModuleCount();
    } catch (e) {
      notes.unshift({ error: true, text: 'Der Inhalt ist zu lang für einen QR-Code mit Fehlerkorrektur ' + ecc + '. Kürze den Inhalt oder wähle eine niedrigere Fehlerkorrektur.' });
      setNotes(notes);
      showEmpty();
      return;
    }

    var total = n + 2 * QUIET_ZONE;
    var target = parseInt(els.size.value, 10);
    var cell = Math.max(1, Math.floor(target / total));
    var px = cell * total;
    var version = (n - 17) / 4;
    var bytes = qrcode.stringToBytes(built.payload).length;

    els.sizeHint.textContent = 'Der PNG-Export wird ' + px + ' × ' + px + ' px groß (ganzzahlige Modulgröße von ' + cell + ' px, damit der Code scharf bleibt).';

    current = { qr: qr, n: n, fg: fg, bg: bg, cell: cell, px: px, type: type };
    els.box.innerHTML = buildSvg(qr, n, fg, bg, 0);
    els.box.setAttribute('aria-label', 'QR-Code-Vorschau (' + TYPE_LABEL[type] + ')');
    els.box.hidden = false;
    els.empty.hidden = true;
    els.info.textContent = 'Version ' + version + ' · ' + n + ' × ' + n + ' Module · ' + bytes + ' Byte Nutzdaten';
    els.payload.textContent = built.payload;
    setNotes(notes);
    setExportEnabled(true);
  }

  // ---------- Export ----------

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function fileBase() { return 'qr-' + (current ? current.type : 'code'); }

  function pngBlob() {
    var c = current;
    return canvasToBlob(buildCanvas(c.qr, c.n, c.fg, c.bg, c.cell));
  }

  function canCopy() {
    return !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem && window.isSecureContext);
  }

  els.dlPng.addEventListener('click', function () {
    if (!current) return;
    pngBlob().then(function (blob) {
      download(blob, fileBase() + '.png');
      setStatus('PNG wurde heruntergeladen (' + current.px + ' × ' + current.px + ' px).');
    }).catch(function () { setStatus('PNG konnte nicht erzeugt werden.'); });
  });

  els.dlSvg.addEventListener('click', function () {
    if (!current) return;
    var svg = buildSvg(current.qr, current.n, current.fg, current.bg, current.px)
      .replace(' aria-hidden="true" focusable="false"', '');
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg + '\n';
    download(new Blob([xml], { type: 'image/svg+xml' }), fileBase() + '.svg');
    setStatus('SVG wurde heruntergeladen.');
  });

  els.copy.addEventListener('click', function () {
    if (!current || !canCopy()) return;
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })]).then(function () {
      setStatus('QR-Code als Bild in die Zwischenablage kopiert.');
    }).catch(function () {
      setStatus('Kopieren wurde vom Browser abgelehnt – bitte das PNG herunterladen.');
    });
  });

  // ---------- Bedienung ----------

  function showPanel() {
    var type = radioValue('type');
    Array.prototype.forEach.call(document.querySelectorAll('[data-panel]'), function (p) {
      p.hidden = p.getAttribute('data-panel') !== type;
    });
  }

  function syncWifi() {
    var open = val('wifi-security') === 'nopass';
    $('wifi-password-field').hidden = open;
  }

  $('wifi-show').addEventListener('change', function () {
    $('wifi-password').type = this.checked ? 'text' : 'password';
  });

  $('colors-reset').addEventListener('click', function () {
    els.fg.value = '#000000';
    els.bg.value = '#ffffff';
    update();
  });

  els.form.addEventListener('submit', function (e) { e.preventDefault(); });

  els.form.addEventListener('input', function () { syncWifi(); update(); });
  els.form.addEventListener('change', function (e) {
    if (e.target.name === 'type') showPanel();
    syncWifi();
    update();
  });

  if (!canCopy()) {
    els.copyHint.hidden = false;
    els.copy.hidden = true;
  }

  showPanel();
  syncWifi();
  update();
})();
