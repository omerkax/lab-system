'use client';
import ModulePage from '@/components/ModulePage';

const HTML = `
                <div class="page-shell">
                <div class="ph">
                    <h1>⚙️ Ayarlar & İşlem Logları</h1>
                    <p>Sistem API ayarları ve geçmiş işlem hareketleri dökümü</p>
                </div>

                <!-- YEDEK BÖLÜMÜ -->
                <div class="card" style="margin-bottom:16px">
                    <div class="ch">💾 Veri Yedekleme & Geri Yükleme</div>
                    <div class="alrt i" style="margin-bottom:14px">
                        <span class="alrt-ic">ℹ️</span>
                        <span>Tüm veriler (çip, telefon rehberi, siparişler, teklifler, sözleşmeli firmalar) tek JSON
                            dosyasına kaydedilir. Bilgisayar değiştirirken veya yedek almak için kullanın.</span>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                        <button class="btn btn-p" onclick="exportBackup()" style="gap:8px">💾 Yedek Al (JSON
                            İndir)</button>
                        <label class="btn btn-o" style="cursor:pointer;gap:8px">
                            📂 Yedek Yükle (JSON Seç)
                            <input type="file" accept=".json" style="display:none"
                                onchange="importBackup(this.files[0]);this.value=''">
                        </label>
                    </div>
                </div>

                <!-- FİRESTORE AKTARIM -->
                <div class="card" style="margin-bottom:16px">
                    <div class="ch">☁️ Firestore Veritabanı</div>
                    <div class="alrt i" style="margin-bottom:14px">
                        <span class="alrt-ic">ℹ️</span>
                        <span>Sözleşmeli firmalar, fiyat teklifleri ve siparişler Firestore koleksiyonlarında
                            görünmüyorsa
                            bu
                            butona basın. Tüm yerel veri Firestore'a gönderilir.</span>
                    </div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap">
                        <button class="btn btn-p" id="btnFsExportSettings" onclick="fbExportAllToFirestore()"
                            style="gap:8px">🔄 Tüm Veriyi Firestore'a Aktar</button>
                    </div>
                </div>

                <div class="card">
                    <div class="ch"
                        style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
                        <span>🔑 API Bağlantı Ayarları</span>
                        <span id="netSmsBal"
                            style="font-size:11px;padding:3px 10px;background:var(--bg2);border:1px solid var(--bdr);border-radius:12px;color:var(--tx3);display:none;cursor:pointer"
                            onclick="updateNetgsmBalance()" title="Tıkla ve Güncelle">
                            Mesaj Hakkı: <span id="netSmsVal"
                                style="color:var(--grn);font-family:var(--mono);font-weight:600">...</span>
                        </span>
                    </div>
                    <div class="alrt i">
                        <span class="alrt-ic">ℹ</span>
                        <div>Çip menüsündeki mesaj gönderme (SMS / WhatsApp) işlemleri buradaki ayarlara göre çalışır.
                            (Geliştirme
                            aşamasındadır)</div>
                    </div>
                    <div class="r2">
                        <div class="fld">
                            <label>SMS API Satıcısı (Örn: NetGSM)</label>
                            <select id="apiSmsVen" class="si">
                                <option value="netgsm">NetGSM</option>
                                <option value="iletisim">İletişim Makinesi</option>
                                <option value="custom">Özel API URL</option>
                            </select>
                        </div>
                        <div class="fld"><label>SMS API Kullanıcı Adı</label><input type="text" id="apiSmsUser"
                                placeholder="NetGSM kullanıcı adı"></div>
                        <div style="margin-bottom:15px"><button class="btn btn-g"
                                style="padding:6px 12px;font-size:12px;background:var(--amb-d);color:var(--amb)"
                                onclick="sendTestSms()">🧪 Test SMS Gönder (05074017765)</button></div>
                        <div class="fld"><label>SMS API Şifre</label><input type="password" id="apiSmsKey"
                                placeholder="***"></div>
                        <div class="fld"><label>Toplam Mesaj Paketi</label><input type="number" id="apiSmsTotal"
                                placeholder="Örn: 5000" oninput="saveApiSettings()"></div>
                        <div class="fld"><label>SMS Gönderici Başlık</label><input type="text" id="apiSmsBas"
                                placeholder="örn: ALIBEYLAB" maxlength="11"></div>
                    </div>
                    <div class="r2">
                        <div class="fld">
                            <label>WhatsApp API Türü</label>
                            <select id="apiWaVen" class="si">
                                <option value="web">Tarayıcı Üzerinden (WhatsApp Web/App)</option>
                                <option value="cloud">WhatsApp Business Cloud API (Otomatik)</option>
                            </select>
                        </div>
                        <div class="fld"><label>WhatsApp Business Token</label><input type="password" id="apiWaKey"
                                placeholder="Eğer varsa..."></div>
                    </div>
                    <div class="acts" style="display:flex;align-items:center;gap:15px">
                        <button class="btn btn-p" onclick="saveApiSettings()">💾 Ayarları Kaydet</button>
                        <div style="display:flex;align-items:center;gap:6px;cursor:pointer"
                            onclick="var c=document.getElementById('apiIgnoreRep'); c.checked=!c.checked; saveApiSettings()">
                            <input type="checkbox" id="apiIgnoreRep" style="transform:scale(1.1);cursor:pointer">
                            <span style="font-size:11px;font-weight:700;color:var(--tx2)">3 Gün Kuralını Her Zaman
                                Yoksay</span>
                        </div>
                    </div>
                </div>

                <div class="card" style="padding:0;margin-top:24px">
                    <div
                        class="soft-divider"
                        style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
                        <div class="ch" style="margin:0">📜 Sistem İşlem Logları</div>
                        <button class="btn btn-o" style="padding:4px 10px;font-size:10px" onclick="clearLogs()">🗑
                            Temizle</button>
                    </div>
                    <div class="tw">
                        <table>
                            <thead>
                                <tr>
                                    <th style="width:140px">Tarih & Saat</th>
                                    <th style="width:120px">Kullanıcı</th>
                                    <th>İşlem Detayı</th>
                                </tr>
                            </thead>
                            <tbody id="logList"></tbody>
                        </table>
                    </div>
                    <div id="logPager"
                        style="display:flex;justify-content:center;gap:4px;margin-top:8px;flex-wrap:wrap">
                    </div>
                </div>
                </div>

`;

export default function Page() {
  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        const w = window as any;
        if(w.renderLogs)w.renderLogs(); if(w.loadApiSettings)w.loadApiSettings(); if(w.fbPullLogs)w.fbPullLogs(); if(w.fbPullTemplates)w.fbPullTemplates();
      }}
    />
  );
}
