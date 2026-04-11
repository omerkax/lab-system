(function () {
  // ── State ───────────────────────────────────────────────────────────
  var _numuneler = [];
  var _aktifFiltre = 'tumu';
  var _tarihBas = '';
  var _tarihBit = '';
  var _expandedGroups = {};
  var _bannerDismissed = false;
  var KUR_GIZLENEN_LS = 'kurleme_gizlenen_numuneler_v1';
  var _gizlenenKeys = (function () {
    try {
      var j = localStorage.getItem(KUR_GIZLENEN_LS);
      return j ? new Set(JSON.parse(j)) : new Set();
    } catch (e) {
      return new Set();
    }
  })();

  function saveGizlenenSet(set) {
    try {
      localStorage.setItem(KUR_GIZLENEN_LS, JSON.stringify(Array.from(set)));
    } catch (e) {}
  }

  /** Gizle / filtre ile aynı anahtar mantığı */
  function kurNumuneKey(n) {
    return [
      String(n.brnNo || '').trim(),
      String(n.labReportNo || n.labNo || '').trim(),
      String(n.takeDate || '').trim(),
      String(n.irsaliye || '').trim(),
      String(n.yibf || '').trim(),
      String(n.curingGun ?? ''),
    ].join('\x1e');
  }

  function keyToB64(k) {
    try {
      return btoa(unescape(encodeURIComponent(k)));
    } catch (e) {
      return '';
    }
  }

  function keyFromB64(b64) {
    try {
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) {
      return '';
    }
  }

  function formatKalanSaat(hoursElapsed) {
    var kalan = 72 - hoursElapsed;
    if (kalan <= 0) {
      var gecen = Math.ceil(Math.abs(kalan));
      return '⏰ ' + gecen + 's geçti';
    }
    var hs = Math.ceil(kalan);
    if (hs < 24) return '⏳ ' + hs + 's kaldı';
    var g = Math.floor(hs / 24);
    var s = hs % 24;
    return '⏳ ' + g + 'g ' + s + 's kaldı';
  }

  function stateStr(n) {
    var s = n.state;
    if (s == null || s === '') return '';
    if (typeof s === 'string') return String(s).trim();
    if (typeof s === 'object') return String(s.name || s.code || s.title || s.value || '').trim();
    return String(s);
  }

  /** Geçmişte kırım tarihi varsa havuz/kür süreci tamamlanmış kabul edilir (EBİSTR çoğu kayıtta cureDate göndermez). */
  function hasPastBreak(n) {
    if (!n.breakDate) return false;
    var ms = new Date(n.breakDate).getTime();
    return !isNaN(ms) && ms > 0 && ms <= Date.now();
  }

  function tamamStateLabel(st) {
    if (!st) return false;
    var u = String(st).toLowerCase().trim();
    if (u === 'curing' || u === 'cure') return false;
    if (/^(cured|curecompleted|curecomplete|completed)$/.test(u)) return true;
    if (/tamamlandı|tamamlandi/.test(u)) return true;
    if (/kür(ü)?\s*tamam|kur\s*tamam|havuzdan\s*(çık|çıktı)/i.test(String(st))) return true;
    return false;
  }

  // ── Durum belirleme ─────────────────────────────────────────────────
  // Priority: 1=kritik, 2=uyari, 3=bekleyen, 4=yolda, 5=kurlemede, 6=tamamlandi
  function getDurum(n) {
    var now = Date.now();
    var tDate = new Date(n.takeDate || '').getTime();
    var hoursElapsed = (!isNaN(tDate) && tDate > 0) ? (now - tDate) / 3600000 : 0;
    var st = stateStr(n);

    if (hasPastBreak(n)) {
      return { dk: 'tamamlandi', label: '✓ Kırım yapıldı', priority: 6 };
    }

    if (tamamStateLabel(st) || st === 'Cured' || st === 'CureCompleted' || st === 'CureComplete' || (n.cureDate && hoursElapsed > 72)) {
      return { dk: 'tamamlandi', label: '✓ Kür Tamam', priority: 6 };
    }

    if (n.cureDate || st === 'Cure' || st === 'Curing' || /^curing$/i.test(st)) {
      return { dk: 'kurlemede', label: '🌊 Havuzda', priority: 5 };
    }

    if (n.worksiteOutDate) {
      return { dk: 'yolda', label: '🚚 Yolda', priority: 4 };
    }

    // YİBF yok: karşılaştırma numunesi — süre uyarısı / kritik gösterme
    if (!String(n.yibf || '').trim()) {
      return { dk: 'bekleyen', label: 'Karşılaştırma', priority: 3 };
    }

    if (hoursElapsed > 72) {
      return { dk: 'kritik', label: formatKalanSaat(hoursElapsed), priority: 1 };
    }
    if (hoursElapsed > 48) {
      return { dk: 'uyari', label: formatKalanSaat(hoursElapsed), priority: 2 };
    }
    return { dk: 'bekleyen', label: formatKalanSaat(hoursElapsed), priority: 3 };
  }

  // ── Tarih formatlama ────────────────────────────────────────────────
  function formatTarih(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { return iso; }
  }

  function formatSure(iso) {
    if (!iso) return '-';
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms) || ms < 0) return '-';
    var h = Math.floor(ms / 3600000);
    if (h < 24) return h + 's';
    return Math.floor(h / 24) + 'g ' + (h % 24) + 's';
  }

  // ── Stats güncellemesi ──────────────────────────────────────────────
  function guncelleStats(liste) {
    var counts = { toplam: liste.length, kritik: 0, uyari: 0, bekleyen: 0, yolda: 0, kurlemede: 0, tamamlandi: 0 };
    liste.forEach(function (n) {
      var d = getDurum(n);
      if (counts[d.dk] !== undefined) counts[d.dk]++;
      if (d.dk === 'uyari') counts.bekleyen++; // uyarı da bekleyen sayılır
    });
    var map = {
      'kur-stat-toplam': counts.toplam,
      'kur-stat-kritik': counts.kritik,
      'kur-stat-bekleyen': counts.bekleyen,
      'kur-stat-yolda': counts.yolda,
      'kur-stat-kurlemede': counts.kurlemede,
      'kur-stat-tamamlandi': counts.tamamlandi,
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = String(map[id]);
    });
  }

  // ── Filtreleme ──────────────────────────────────────────────────────
  function filtrele(liste) {
    return liste.filter(function (n) {
      // Tarih aralığı filtresi
      if (_tarihBas || _tarihBit) {
        var t = (n.takeDate || '').slice(0, 10);
        if (_tarihBas && t < _tarihBas) return false;
        if (_tarihBit && t > _tarihBit) return false;
      }
      // Durum filtresi
      if (_aktifFiltre === 'tumu') return true;
      var d = getDurum(n);
      if (_aktifFiltre === 'kritik')     return d.dk === 'kritik';
      if (_aktifFiltre === 'bekleyen')   return d.dk === 'kritik' || d.dk === 'uyari' || d.dk === 'bekleyen';
      if (_aktifFiltre === 'yolda')      return d.dk === 'yolda';
      if (_aktifFiltre === 'kurlemede')  return d.dk === 'kurlemede';
      if (_aktifFiltre === 'tamamlandi') return d.dk === 'tamamlandi';
      return true;
    });
  }

  // ── Badge HTML ──────────────────────────────────────────────────────
  function badgeHtml(durum) {
    var dk = durum.dk, label = durum.label;
    if (dk === 'kritik')     return '<span class="kur-badge" style="background:rgba(239,68,68,.15);color:var(--red);border-color:rgba(239,68,68,.4);animation:kur-blink 1s infinite">' + label + '</span>';
    if (dk === 'uyari')      return '<span class="kur-badge" style="background:rgba(251,191,36,.15);color:var(--amb);border-color:rgba(251,191,36,.4)">' + label + '</span>';
    if (dk === 'bekleyen')   return '<span class="kur-badge" style="background:rgba(255,255,255,.05);color:var(--tx3);border-color:var(--bdr)">' + label + '</span>';
    if (dk === 'yolda')      return '<span class="kur-badge" style="background:rgba(20,184,166,.1);color:var(--acc2);border-color:rgba(45,212,191,.32)">' + label + '</span>';
    if (dk === 'kurlemede')  return '<span class="kur-badge" style="background:rgba(20,184,166,.14);color:var(--acc2);border-color:rgba(20,184,166,.35)">' + label + '</span>';
    if (dk === 'tamamlandi') return '<span class="kur-badge" style="background:rgba(34,197,94,.10);color:var(--grn);border-color:rgba(34,197,94,.3)">' + label + '</span>';
    return '<span class="kur-badge" style="background:var(--sur2);color:var(--tx3);border-color:var(--bdr)">' + label + '</span>';
  }

  // ── Tablo render ────────────────────────────────────────────────────
  function renderTablo() {
    var liste = filtrele(_numuneler);
    var tbody = document.getElementById('kur-tbody');
    var bos = document.getElementById('kur-bos');
    var cnt = document.getElementById('kur-cnt');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (cnt) cnt.textContent = liste.length + ' numune';
    if (!liste.length) {
      if (bos) bos.style.display = 'block';
      return;
    }
    if (bos) bos.style.display = 'none';

    // Gruplama: YİBF bazlı
    var groups = {};
    liste.forEach(function (n) {
      var yibf = n.yibf || 'YİBF Belirtilmemiş';
      var date = (n.takeDate || '').split(' ')[0] || 'Tarih Belirtilmemiş';
      if (!groups[yibf]) groups[yibf] = { firma: n.yapiDenetim || n.contractor || '-', dates: {}, minPriority: 99 };
      if (!groups[yibf].dates[date]) groups[yibf].dates[date] = [];
      groups[yibf].dates[date].push(n);
      var p = getDurum(n).priority;
      if (p < groups[yibf].minPriority) groups[yibf].minPriority = p;
    });

    // Grupları önceliğe göre sırala (düşük priority = daha önce)
    var sortedYibf = Object.keys(groups).sort(function (a, b) {
      return groups[a].minPriority - groups[b].minPriority;
    });

    function nestedSatirHtml(n) {
      var durum = getDurum(n);
      var brn = n.brnNo || n.labNo || '-';
      var yd = (n.yapiDenetim || n.contractor || '-').replace(/"/g, '&quot;');
      var elem = (n.yapiElem || '-').replace(/"/g, '&quot;');
      var tarih = formatTarih(n.takeDate);
      var beton = n.betonSinifi || '-';
      var sure = formatSure(n.takeDate);
      var rowBg = '';
      if (durum.dk === 'kritik') rowBg = 'background:rgba(239,68,68,.04)';
      else if (durum.dk === 'uyari') rowBg = 'background:rgba(251,191,36,.03)';
      var leftBorder = '';
      if (durum.dk === 'kritik')     leftBorder = 'border-left:3px solid var(--red)';
      else if (durum.dk === 'uyari') leftBorder = 'border-left:3px solid var(--amb)';
      else if (durum.dk === 'yolda') leftBorder = 'border-left:3px solid var(--acc2)';
      else if (durum.dk === 'kurlemede') leftBorder = 'border-left:3px solid var(--acc)';
      else if (durum.dk === 'tamamlandi') leftBorder = 'border-left:3px solid var(--grn)';
      else leftBorder = 'border-left:3px solid transparent';
      var gizBtn = '';
      if (!String(n.yibf || '').trim()) {
        var kb = keyToB64(kurNumuneKey(n));
        if (kb) {
          gizBtn =
            '<td style="padding:8px 10px;vertical-align:middle">' +
            '<button type="button" class="btn btn-g" style="font-size:10px;padding:4px 10px;white-space:nowrap" data-kur-k="' +
            kb +
            '" onclick="event.stopPropagation();kurNumuneGizleAttr(this)">Listeden kaldır</button></td>';
        } else {
          gizBtn = '<td style="padding:8px 10px">—</td>';
        }
      } else {
        gizBtn = '<td style="padding:8px 10px;color:var(--tx3)">—</td>';
      }
      return (
        '<tr style="border-bottom:1px solid rgba(255,255,255,.05);' + rowBg + ';' + leftBorder + '">' +
        '<td style="padding:8px 10px;font-weight:700;font-family:var(--fm);font-size:11px;white-space:nowrap">' + brn + '</td>' +
        '<td style="padding:8px 10px;color:var(--acc2);font-family:var(--fm);font-size:10.5px;white-space:nowrap">' + (n.yibf || '') + '</td>' +
        '<td style="padding:8px 10px;color:var(--tx2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="' + yd + '">' + (n.yapiDenetim || n.contractor || '-') + '</td>' +
        '<td style="padding:8px 10px;color:var(--tx3);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="' + elem + '">' + (n.yapiElem || '-') + '</td>' +
        '<td style="padding:8px 10px;color:var(--tx3);white-space:nowrap;font-family:var(--fm);font-size:10.5px">' + tarih + '</td>' +
        '<td style="padding:8px 10px;color:var(--tx2);white-space:nowrap">' + beton + '</td>' +
        '<td style="padding:8px 10px;color:var(--tx3);white-space:nowrap;font-family:var(--fm);font-size:10.5px">' + sure + '</td>' +
        '<td style="padding:8px 10px">' + badgeHtml(durum) + '</td>' +
        gizBtn +
        '</tr>'
      );
    }

    function buildGroupNestedHtml(group) {
      var sortedDates = Object.keys(group.dates).sort(function (a, b) {
        return new Date(b).getTime() - new Date(a).getTime();
      });
      var rows = [];
      sortedDates.forEach(function (date) {
        var items = group.dates[date];
        var sortedItems = items.slice().sort(function (a, b) {
          var pa = getDurum(a).priority, pb = getDurum(b).priority;
          if (pa !== pb) return pa - pb;
          var ta = new Date(a.takeDate || '').getTime() || 0;
          var tb = new Date(b.takeDate || '').getTime() || 0;
          return ta - tb;
        });
        rows.push('<tr><td colspan="9" class="kur-date-cap">' + formatTarih(date) + ' · ' + items.length + ' numune</td></tr>');
        sortedItems.forEach(function (n) { rows.push(nestedSatirHtml(n)); });
      });
      return (
        '<table class="kur-nested">' +
        '<thead><tr>' +
        '<th>BRN No</th><th>YİBF</th><th>Firma / YD</th><th>Yapı Elemanı</th><th>Alınış</th><th>Beton</th><th>Süre</th><th>Durum</th><th>İşlem</th>' +
        '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      );
    }

    sortedYibf.forEach(function (yibf) {
      var group = groups[yibf];
      var allItems = [];
      Object.keys(group.dates).forEach(function (d) { allItems = allItems.concat(group.dates[d]); });
      var isExp = _expandedGroups[yibf] === true;

      var gCounts = { kritik: 0, uyari: 0, bekleyen: 0, yolda: 0, kurlemede: 0, tamamlandi: 0 };
      allItems.forEach(function (n) { var d = getDurum(n); if (gCounts[d.dk] !== undefined) gCounts[d.dk]++; });

      var badges = '';
      if (gCounts.kritik)     badges += '<span class="kur-badge" style="background:rgba(239,68,68,.12);color:var(--red);border-color:rgba(239,68,68,.3)">🔴 ' + gCounts.kritik + ' Kritik</span>';
      if (gCounts.uyari)      badges += '<span class="kur-badge" style="background:rgba(251,191,36,.1);color:var(--amb);border-color:rgba(251,191,36,.3)">⚠️ ' + gCounts.uyari + '</span>';
      if (gCounts.bekleyen)   badges += '<span class="kur-badge" style="background:rgba(148,163,184,.12);color:var(--tx3);border-color:rgba(148,163,184,.3)">⏳ ' + gCounts.bekleyen + ' Bekleyen</span>';
      if (gCounts.yolda)      badges += '<span class="kur-badge" style="background:rgba(20,184,166,.1);color:var(--acc2);border-color:rgba(45,212,191,.28)">🚚 ' + gCounts.yolda + ' Yolda</span>';
      if (gCounts.kurlemede)  badges += '<span class="kur-badge" style="background:rgba(20,184,166,.12);color:var(--acc2);border-color:rgba(20,184,166,.32)">🌊 ' + gCounts.kurlemede + ' Havuz</span>';
      if (gCounts.tamamlandi) badges += '<span class="kur-badge" style="background:rgba(34,197,94,.08);color:var(--grn);border-color:rgba(34,197,94,.25)">✓ ' + gCounts.tamamlandi + '</span>';

      var yibfsizExtra = '';
      if (yibf === 'YİBF Belirtilmemiş') {
        yibfsizExtra =
          '<button type="button" class="btn btn-g" style="font-size:10px;padding:5px 12px;flex-shrink:0" onclick="event.stopPropagation();kurYibfsizTumunuGizle()">Karşılaştırma grubunu gizle</button>';
      }

      var headerTr = document.createElement('tr');
      headerTr.className = 'kur-grp-hd';
      headerTr.onclick = function () { _expandedGroups[yibf] = !isExp; renderTablo(); };
      headerTr.innerHTML =
        '<td colspan="9" style="padding:12px 16px;border-bottom:1px solid var(--bdr)">' +
          '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
            '<span style="font-size:11px;color:var(--tx3);flex-shrink:0;transition:transform .2s;transform:rotate(' + (isExp ? '90deg' : '0deg') + ')">▸</span>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:700;color:var(--acc);font-size:13px;letter-spacing:.02em">YİBF ' + yibf + '</div>' +
              '<div style="font-size:11px;color:var(--tx3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + group.firma + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + badges + yibfsizExtra + '</div>' +
          '</div>' +
        '</td>';
      tbody.appendChild(headerTr);

      if (!isExp) return;

      var panelTr = document.createElement('tr');
      panelTr.className = 'kur-grp-panel';
      panelTr.innerHTML =
        '<td colspan="9" style="padding:0;border-bottom:1px solid var(--bdr);vertical-align:top">' +
          '<div class="kur-grp-inner">' + buildGroupNestedHtml(group) + '</div>' +
        '</td>';
      tbody.appendChild(panelTr);
    });
  }

  // ── Global fonksiyonlar ─────────────────────────────────────────────
  window.kurFiltrele = function (filtre) {
    _aktifFiltre = filtre;
    document.querySelectorAll('.kur-filtre-btn').forEach(function (b) {
      b.classList.toggle('kur-filtre-active', b.dataset.filtre === filtre);
    });
    renderTablo();
  };

  window.kurFiltreleUygula = function () {
    var bas = document.getElementById('kur-tarih-bas');
    var bit = document.getElementById('kur-tarih-bit');
    _tarihBas = bas ? bas.value : '';
    _tarihBit = bit ? bit.value : '';
    renderTablo();
  };

  window.kurTarihSifirla = function () {
    var bas = document.getElementById('kur-tarih-bas');
    var bit = document.getElementById('kur-tarih-bit');
    if (bas) bas.value = '';
    if (bit) bit.value = '';
    _tarihBas = ''; _tarihBit = '';
    renderTablo();
  };

  window.kurlemeYenile = function () { kurlemeInit(); };

  window.kurNumuneGizleAttr = function (btn) {
    var b64 = btn.getAttribute('data-kur-k');
    if (!b64) return;
    var key = keyFromB64(b64);
    if (!key) return;
    _gizlenenKeys.add(key);
    saveGizlenenSet(_gizlenenKeys);
    _numuneler = _numuneler.filter(function (n) {
      return kurNumuneKey(n) !== key;
    });
    guncelleStats(_numuneler);
    gosterUyariBanner(_numuneler);
    renderTablo();
  };

  /** YİBF’siz gruptaki tüm numuneleri bu cihazda kalıcı gizle */
  window.kurYibfsizTumunuGizle = function () {
    _numuneler.forEach(function (n) {
      if (!String(n.yibf || '').trim()) _gizlenenKeys.add(kurNumuneKey(n));
    });
    saveGizlenenSet(_gizlenenKeys);
    _numuneler = _numuneler.filter(function (n) {
      return String(n.yibf || '').trim();
    });
    guncelleStats(_numuneler);
    gosterUyariBanner(_numuneler);
    renderTablo();
  };

  // ── Veri yükleme ────────────────────────────────────────────────────
  function loadNumuneler() {
    var w = window;
    var numuneler = w.ebistrNumuneler || w._betonEbistrNumuneler || null;
    if (numuneler && Array.isArray(numuneler) && numuneler.length > 0) {
      return Promise.resolve(numuneler);
    }
    return fetch('/api/ebistr/kurleme')
      .then(function (r) { return r.json(); })
      .then(function (json) {
        if (json.ok && json.numuneler) return json.numuneler;
        if (!json.ok && json.err) console.warn('[kurleme] API:', json.err);
        return [];
      })
      .catch(function (e) { console.warn('[kurleme] fetch error:', e); return []; });
  }

  function setLoading(v) {
    var el = document.getElementById('kur-loading');
    if (el) el.style.display = v ? 'flex' : 'none';
  }

  function setHata(msg) {
    var el = document.getElementById('kur-hata');
    if (!el) return;
    if (msg) { el.style.display = 'block'; el.textContent = msg; }
    else { el.style.display = 'none'; el.textContent = ''; }
  }

  function setTabloVisible(v) {
    var el = document.getElementById('kur-tablo-wrap');
    if (el) el.style.display = v ? 'block' : 'none';
  }

  // ── Eski tamamlanmış kayıtları filtrele ─────────────────────────────
  // Kürü tamam kayıtları 72 saatten eskiyse gösterme
  function filtreEskiTamamlandi(liste) {
    var sinir = Date.now() - 72 * 3600000;
    return liste.filter(function (n) {
      var d = getDurum(n);
      if (d.dk !== 'tamamlandi') return true; // tamamlanmamışları hep göster
      // cureDate varsa ona bak, yoksa takeDate'e
      var refDate = n.cureDate ? new Date(n.cureDate).getTime() : new Date(n.takeDate || '').getTime();
      return !isNaN(refDate) && refDate >= sinir;
    });
  }

  function gosterUyariBanner(liste) {
    var wrap = document.getElementById('kur-uyari-banner');
    if (!wrap) return;
    if (_bannerDismissed) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    var uyarilar = liste.filter(function (n) {
      if (!String(n.yibf || '').trim()) return false;
      var d = getDurum(n);
      return d.dk === 'uyari' || d.dk === 'kritik';
    });
    if (!uyarilar.length) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    var kritikSay = uyarilar.filter(function (n) { return getDurum(n).dk === 'kritik'; }).length;
    var uyariSay  = uyarilar.filter(function (n) { return getDurum(n).dk === 'uyari'; }).length;
    var detay = '';
    if (kritikSay) detay += '<div style="color:var(--red);font-weight:600;margin-top:4px">🔴 ' + kritikSay + ' numune kritik (&gt;72 saat, henüz havuza alınmamış veya süreç eksik)</div>';
    if (uyariSay)  detay += '<div style="color:var(--amb);margin-top:4px">⚠️ ' + uyariSay + ' numune 48–72 saat aralığında</div>';
    wrap.style.display = 'block';
    wrap.innerHTML =
      '<div class="kur-banner-soft">' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-weight:800;font-size:13px;color:var(--tx);margin-bottom:4px">Kürleme hatırlatması</div>' +
          '<div style="opacity:.95">' + detay + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-g" style="font-size:11px;padding:6px 14px;height:auto" onclick="kurUyariKapat()">Tamam</button>' +
      '</div>';
  }

  window.kurUyariKapat = function () {
    _bannerDismissed = true;
    var w = document.getElementById('kur-uyari-banner');
    if (w) { w.style.display = 'none'; w.innerHTML = ''; }
  };

  // ── Ana init ────────────────────────────────────────────────────────
  function kurlemeInit() {
    _bannerDismissed = false;
    setLoading(true);
    setHata(null);
    setTabloVisible(false);

    loadNumuneler()
      .then(function (tum) {
        _numuneler = filtreEskiTamamlandi(tum).filter(function (n) {
          return !_gizlenenKeys.has(kurNumuneKey(n));
        });
        guncelleStats(_numuneler);
        gosterUyariBanner(_numuneler);
        renderTablo();
        setTabloVisible(true);
      })
      .catch(function (e) { setHata('Yükleme hatası: ' + (e.message || String(e))); })
      .finally(function () { setLoading(false); });
  }

  window._kurlemeInit = kurlemeInit;
})();
