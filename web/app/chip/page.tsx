'use client';
import dynamic from 'next/dynamic';

const ModulePage = dynamic(() => import('@/components/ModulePage'), { ssr: false });

const HTML = `
                <div class="ph">
                    <h1>Çip Takip</h1>
                    <p>EBİS bakiyeleri, kritik firmalara WhatsApp uyarısı</p>
                </div>
                <div class="sg">
                    <div class="st">
                        <div class="st-ic">🏢</div>
                        <div class="st-v" id="cs1">0</div>
                        <div class="st-l">Toplam Firma</div>
                    </div>
                    <div class="st">
                        <div class="st-ic">⚠️</div>
                        <div class="st-v" id="cs2">0</div>
                        <div class="st-l">Kritik (&lt;50)</div>
                    </div>
                    <div class="st">
                        <div class="st-ic">📦</div>
                        <div class="st-v" id="cs3">0</div>
                        <div class="st-l">Kalan Çip</div>
                    </div>
                    <div class="st" id="netSmsBal" style="background:var(--amb-d);border-color:var(--amb)">
                        <div class="st-ic">💬</div>
                        <div class="st-v" id="netSmsVal" style="color:var(--amb)">...</div>
                        <div class="st-l">SMS Bakiyesi</div>
                    </div>
                </div>
                <div class="tabs">
                    <button class="tab on" id="ct-izle" onclick="chipTab('izle')">📊 İzleme</button>
                    <button class="tab" id="ct-yukle" onclick="chipTab('yukle')">📤 CSV</button>
                    <button class="tab" id="ct-kayit" onclick="chipTab('kayit')">➕ Kayıt</button>
                    <button class="tab" id="ct-sablon" onclick="chipTab('sablon')">💬 Şablon</button>
                    <button class="tab" id="ct-siparis" onclick="chipTab('siparis')">📦 Siparişler</button>
                    <button class="tab" id="ct-mesaj" onclick="chipTab('mesaj')">📨 Mesaj Geçmişi</button>
                </div>
                <div id="ctp-izle">
                    <div class="cfb">
                        <div class="sw2"><input class="si" id="chipSearch" placeholder="Firma ara..."
                                oninput="renderChip()"></div>
                        <select class="fsel" id="chipFilter" onchange="renderChip()">
                            <option value="all">Tümü</option>
                            <option value="c">Kritik (&lt;50)</option>
                            <option value="w">Uyarı (50–100)</option>
                            <option value="ok">İyi (&gt;100)</option>
                            <option value="pasif">Pasif Firmalar</option>
                            <option value="notel">Telefonu Yok</option>
                        </select>
                        <button class="btn btn-g" style="padding:4px 12px;font-size:11px" onclick="exportChipCsv()">⬇
                            CSV
                            İndir</button>
                        <button class="btn btn-a" id="btnWaAll" style="display:none" onclick="openWaModal('all','')">📲
                            Toplu WA</button>
                        <button class="btn btn-a" id="btnSmsAll"
                            style="display:none;background:var(--grn-d);color:var(--grn);border-color:var(--grn)"
                            onclick="openSmsModal()">💬 Toplu SMS</button>
                        <button class="btn btn-o" id="btnFsExport" onclick="fbExportAllToFirestore()"
                            title="Lokaldeki tüm çip verisini Firestore'a gönder">🔄 Firestore'a Aktar</button>
                    </div>
                    <!-- Toplu işlem toolbar -->
                    <div id="chipBulkBar"
                        style="display:none;align-items:center;gap:8px;padding:10px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;margin-bottom:10px;flex-wrap:wrap">
                        <span id="chipSelCount" style="font-size:12px;color:var(--tx3);min-width:80px">0 seçili</span>
                        <button class="btn btn-o" style="padding:4px 10px;font-size:11px" onclick="bulkChipPassive()">🛌
                            Pasif Yap</button>
                        <button class="btn btn-p" style="padding:4px 10px;font-size:11px" onclick="bulkChipActive()">▶
                            Aktif
                            Yap</button>
                        <button class="btn btn-g" style="padding:4px 10px;font-size:11px;color:var(--red)"
                            onclick="bulkChipDelete()">🗑 Toplu Sil</button>
                        <button class="btn btn-g" style="padding:4px 10px;font-size:11px;margin-left:auto"
                            onclick="chipClearSel()">✖ Seçimi Temizle</button>
                    </div>
                    <div class="card" style="padding:0">
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:30px"><input type="checkbox" id="chipChkAll"
                                                onchange="chipToggleAll(this.checked)" title="Tümünü seç"></th>
                                        <th>Firma</th>
                                        <th>Belge No</th>
                                        <th>Toplam</th>
                                        <th>Kullanılan</th>
                                        <th>Kalan</th>
                                        <th>Durum</th>
                                        <th>Tel</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody id="chipBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="empty" id="chipEmpty" style="display:none">
                        <div class="empty-ic">🔖</div>
                        <div>Henüz veri yüklenmedi</div>
                    </div>
                </div>
                <div id="ctp-yukle" style="display:none">
                    <div class="alrt i"><span class="alrt-ic">ℹ️</span><span>Proxy bağlıysa EBİSTR'den otomatik çek. Telefon numaraları korunur.</span></div>
                    <div class="card" style="margin-bottom:12px">
                        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                            <button class="btn btn-p" id="btnChipProxy" onclick="chipProxyYukle()" style="padding:8px 18px;font-size:13px">🔄 EBİSTR'den Otomatik Çek</button>
                            <span id="chipProxyDurum" style="font-size:12px;color:var(--tx3)"></span>
                        </div>
                    </div>
                    <div class="card">
                        <div class="uz" id="chipUZ" onclick="document.getElementById('chipFI').click()">
                            <span class="uz-ic">📋</span>
                            <div class="uz-ti">Manuel CSV Yükle (yedek)</div>
                            <div class="uz-su">Müteahhit Firma; Belge No; Toplam; Kullanılan; Kalan</div>
                            <button class="btn btn-o"
                                onclick="event.stopPropagation();document.getElementById('chipFI').click()">Seç</button>
                        </div>
                        <input type="file" id="chipFI" accept=".csv,.txt">
                    </div>
                    <div class="alrt w" style="margin-top:12px"><span class="alrt-ic">⚠️</span><span>Firma adları
                            karışıksa
                            veya eksik görünüyorsa aşağıdaki butona bas.</span></div>
                    <div style="margin-top:8px">
                        <button class="btn btn-o" style="color:var(--red);border-color:var(--red)"
                            onclick="resetPhoneBook()">🔄 Telefon Rehberini Sıfırla</button>
                    </div>
                </div>
                <div id="ctp-kayit" style="display:none">
                    <div class="card">
                        <div class="ch">Yeni Çip Kaydı</div>
                        <div class="r2">
                            <div class="fld"><label>Firma Adı</label><input type="text" id="regFirma"></div>
                            <div class="fld"><label>Belge No</label><input type="text" id="regBelge" maxlength="16">
                            </div>
                            <div class="fld"><label>WhatsApp No</label><input type="tel" id="regTel"></div>
                            <div class="fld"><label>Sipariş Adedi</label><input type="number" id="regAdet" min="1">
                            </div>
                        </div>
                        <div class="acts">
                            <button class="btn btn-p" onclick="saveChipReg()">💾 Kaydet</button>
                            <button id="regCancelBtn" class="btn btn-o" style="display:none;color:var(--red)"
                                onclick="cancelPBEdit()">X İptal</button>
                            <button class="btn btn-o" onclick="clearChipReg()">Temizle</button>
                        </div>
                    </div>
                    <div class="card">
                        <div
                            style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">
                            <div class="ch" style="margin:0">Kayıtlı Telefonlar <span id="regSmsBalSummary"
                                    style="font-size:10px;color:var(--tx3);font-weight:400;margin-left:8px"></span>
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                                <input class="si" id="pbSearch" placeholder="Firma / tel ara..."
                                    style="width:160px;font-size:11px;padding:4px 10px"
                                    oninput="telPage=1;renderTelsEnhanced()">
                                <select id="pbFilter" class="fsel" style="font-size:11px;padding:3px 8px"
                                    onchange="telPage=1;renderTelsEnhanced()">
                                    <option value="all">Tümü</option>
                                    <option value="tel">Telefonlu</option>
                                    <option value="notel">Telefonsuz</option>
                                    <option value="dup">⚠ Duplicate Tel</option>
                                </select>
                                <button id="pbBulkDelBtn" class="btn btn-o"
                                    style="display:none;padding:3px 10px;font-size:10px;color:var(--red)"
                                    onclick="bulkDeletePB()">🗑 Seçilenleri Sil</button>
                                <button class="btn btn-o" style="padding:3px 10px;font-size:10px"
                                    onclick="deduplicatePB()">⚙️ Sistemi Temizle</button>
                            </div>
                        </div>
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:28px"><input type="checkbox" id="pbChkAll"
                                                onchange="pbSelectAll(this)"></th>
                                        <th>Firma</th>
                                        <th>Belge No</th>
                                        <th>Tel</th>
                                        <th>Tarih</th>
                                        <th>İşlem</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="telBody"></tbody>
                            </table>
                        </div>
                        <div id="telPager"
                            style="display:flex;justify-content:center;gap:4px;margin-top:8px;flex-wrap:wrap"></div>
                    </div>
                </div>
                <div id="ctp-sablon" style="display:none">
                    <div class="card">
                        <div class="ch">💬 Kalan Çip — WhatsApp Şablonu</div>
                        <div class="alrt w"><span class="alrt-ic">⚠️</span><span>Değişkenler: {FIRMA_ADI} {BELGE_NO}
                                {TOPLAM} {KULLANILAN} {KALAN}</span></div>
                        <div class="fld"><label>Şablon</label><textarea id="waSablon" rows="10"
                                style="resize:vertical;line-height:1.7"></textarea></div>
                        <div class="acts">
                            <button class="btn btn-p" onclick="saveSablon()">💾 Kaydet</button>
                            <button class="btn btn-o" onclick="resetSablon()">↺ Sıfırla</button>
                            <button class="btn btn-g" onclick="prevSablon()">👁 Önizle</button>
                        </div>
                    </div>
                    <div class="card" style="margin-top:12px">
                        <div class="ch">📦 Kargo Geldi — WhatsApp Şablonu</div>
                        <div class="alrt w"><span class="alrt-ic">⚠️</span><span>Değişkenler: {FIRMA_ADI} {BELGE_NO}
                                {ADET}</span></div>
                        <div class="fld"><label>WA Şablonu</label><textarea id="waKargoSablon" rows="8"
                                style="resize:vertical;line-height:1.7"></textarea></div>
                        <div class="fld" style="margin-top:8px"><label>SMS Şablonu (kısa)</label><textarea
                                id="smsKargoSablon" rows="3" style="resize:vertical;line-height:1.7"></textarea></div>
                        <div class="acts">
                            <button class="btn btn-p" onclick="saveKargoSablon()">💾 Kaydet</button>
                            <button class="btn btn-o" onclick="resetKargoSablon()">↺ Sıfırla</button>
                        </div>
                    </div>
                </div>

                <!-- SİPARİŞ TAKİP -->
                <div id="ctp-siparis" style="display:none">
                    <div class="card">
                        <div class="ch">📦 Yeni Çip Siparişi Kaydet</div>
                        <div class="r2">
                            <div class="fld" style="flex:2"><label>Firma Adı</label>
                                <input type="text" id="coFirma" placeholder="Firma adı..." list="coFirmaList">
                                <datalist id="coFirmaList"></datalist>
                            </div>
                            <div class="fld"><label>Sipariş Adedi</label><input type="number" id="coAdet"
                                    placeholder="100" min="1"></div>
                            <div class="fld"><label>İlgili Belge / MÜT No</label><input type="text" id="coBelge"
                                    placeholder="00xxxxxxxx"></div>
                            <div class="fld"><label>Sipariş No</label><input type="text" id="coSiparisNo"
                                    placeholder="Sipariş numarası..."></div>
                            <div class="fld"><label>Müşteri Telefonu</label><input type="text" id="coTel"
                                    placeholder="Ek bilgi..."></div>
                            <div class="fld"><label>Sipariş Tarihi</label><input type="date" id="coTarih"></div>
                            <div class="fld" style="flex:2"><label>Not / Açıklama</label><input type="text" id="coNot"
                                    placeholder="Detay/Not..."></div>
                        </div>
                        <div class="acts">
                            <button class="btn btn-p" onclick="saveChipOrder()">💾 Kaydet</button>
                            <button class="btn btn-o" onclick="clearChipOrderForm()">Temizle</button>
                        </div>
                    </div>
                    <div class="rec-filter" style="margin-bottom:12px">
                        <div class="sw2" style="flex:1;min-width:160px;margin:0"><input class="si" id="coSearch"
                                placeholder="Firma ara..." oninput="renderChipOrders()"></div>
                        <select class="fsel" id="coFilt" onchange="renderChipOrders()">
                            <option value="all">Tümü</option>
                            <option value="verildi">Verildi</option>
                            <option value="teslim">Teslim Edildi</option>
                        </select>
                    </div>
                    <div id="coBulkBar"
                        style="display:none;align-items:center;gap:8px;padding:10px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;margin-bottom:10px;flex-wrap:wrap">
                        <span id="coSelCount" style="font-size:12px;color:var(--tx3);min-width:80px">0 seçili</span>
                        <button class="btn btn-o" style="padding:4px 10px;font-size:11px;color:var(--red)"
                            onclick="coBulkDelete()">🗑 Toplu Sil</button>
                        <button class="btn btn-p" style="padding:4px 10px;font-size:11px" onclick="coBulkPassive()">🛌
                            Teslim Edildi Yap</button>
                        <button class="btn btn-g" style="padding:4px 10px;font-size:11px;margin-left:auto"
                            onclick="coClearSel()">✖ Seçimi Temizle</button>
                    </div>
                    <div class="card" style="padding:0">
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:28px"><input type="checkbox" id="coChkAll"
                                                onchange="coToggleAll(this.checked)" title="Tümünü seç"></th>
                                        <th>Firma</th>
                                        <th>MÜT No</th>
                                        <th>Sipariş No</th>
                                        <th>Adet</th>
                                        <th>Tarih</th>
                                        <th>Tel</th>
                                        <th>Not</th>
                                        <th>Durum</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody id="chipOrderList"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <div id="ctp-mesaj" style="display:none">
                    <div class="card" style="padding:0">
                        <div
                            style="padding:12px 16px;border-bottom:1px solid var(--bdr2);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                            <div class="ch" style="margin:0;display:flex;align-items:center;gap:12px">
                                📨 Mesaj Gönderim Geçmişi
                            </div>
                            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                                <input class="si" id="msgLogSearch" placeholder="Firma / numara ara..."
                                    style="width:140px;font-size:11px;padding:4px 10px"
                                    oninput="msgLogPage=1;renderMsgLog()">
                                <select id="msgLogTurFil" class="fsel" style="font-size:11px;padding:3px 8px"
                                    onchange="msgLogPage=1;renderMsgLog()">
                                    <option value="all">Kanal: Tümü</option>
                                    <option value="kargo">📦 Kargo</option>
                                    <option value="bakiye">📊 Kalan Çip</option>
                                </select>
                                <select id="msgLogStatFil" class="fsel" style="font-size:11px;padding:3px 8px"
                                    onchange="msgLogPage=1;renderMsgLog()">
                                    <option value="all">Durum: Tümü</option>
                                    <option value="İletildi">✅ İletildi</option>
                                    <option value="Gönderildi">⏳ Gönderildi</option>
                                    <option value="Beklemede">⏳ Beklemede</option>
                                    <option value="Hatalı">❌ Hatalı</option>
                                </select>
                                <button class="btn btn-o"
                                    style="padding:3px 10px;font-size:10px;background:var(--acc-d);color:var(--acc2);border-color:var(--acc)"
                                    onclick="syncAllSmsStatuses()">🔄 Raporları Yenile</button>
                                <button class="btn btn-g"
                                    style="padding:3px 10px;font-size:10px;color:var(--red);margin-left:5px"
                                    onclick="clearMsgLog()">🗑 Temizle</button>
                                <div style="display:flex;align-items:center;gap:5px;margin-left:10px;cursor:pointer"
                                    onclick="toggleMsgBypass()">
                                    <input type="checkbox" id="msgBypassCheck"
                                        style="transform:scale(0.9);cursor:pointer">
                                    <span
                                        style="font-size:10px;color:var(--tx3);font-weight:700;white-space:nowrap">Kısıtlamaları
                                        Kaldır (Test Modu)</span>
                                </div>
                                <button class="btn btn-o"
                                    style="padding:3px 10px;font-size:10px;background:var(--grn-d);color:var(--grn);border-color:var(--grn)"
                                    onclick="exportMsgLogCsv()">⬇ CSV İndir</button>
                                <button class="btn btn-o" style="padding:3px 10px;font-size:10px;color:var(--red)"
                                    onclick="clearMsgLog()">🗑 Temizle</button>
                            </div>
                        </div>
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Firma</th>
                                        <th style="white-space:nowrap">Numara</th>
                                        <th style="white-space:nowrap">Tür</th>
                                        <th style="white-space:nowrap">Durum</th>
                                        <th style="white-space:nowrap">Tarih</th>
                                        <th>Mesaj İçeriği</th>
                                    </tr>
                                </thead>
                                <tbody id="msgLogBody"></tbody>
                            </table>
                        </div>
                        <div id="msgLogPager"
                            style="display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-top:1px solid var(--bdr);flex-wrap:wrap">
                        </div>
                        <div class="empty" id="msgLogEmpty" style="display:none">
                            <div class="empty-ic">📭</div>
                            <div>Henüz mesaj gönderilmedi</div>
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
        // Next.js: bootstrap bazen fbPullChip’ten sonra; önce LS’deki son EBİSTR/CSV listesini yükle, sonra Firestore ile birleştir.
        if (typeof w.loadChipFromLocalStorage === 'function') w.loadChipFromLocalStorage();
        if (w.chipTab) w.chipTab('izle');
        if (typeof w.updateNetgsmBalance === 'function') w.updateNetgsmBalance();
        if (w.fbPullChip) w.fbPullChip();
        if (w.fbPullOrders) w.fbPullOrders();
        if (w.fbPullSF) w.fbPullSF();
        if (w.updateChipStats) w.updateChipStats();
        if (w.renderChip) w.renderChip();
        if (w.loadSablon) w.loadSablon();
      }}
    />
  );
}
