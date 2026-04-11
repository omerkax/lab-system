'use client';
import ModulePage from '@/components/ModulePage';

const HTML = `

                <!-- P1 -->
                <div class="panel on" id="p1">
                    <div class="ph">
                        <h1>Rapor Defteri</h1>
                        <p>Yüklenen dosya tarayıcıda kayıtlı kalır, tekrar yüklemeye gerek yok</p>
                    </div>
                    <div class="card">
                        <div class="uz" id="uploadZone" onclick="document.getElementById('fi').click()">
                            <span class="uz-ic">📊</span>
                            <div class="uz-ti">Rapor Defterini Sürükle veya Tıkla</div>
                            <div class="uz-su">TAKİP sayfası içeren .xlsx dosyası</div>
                            <button class="btn btn-o"
                                onclick="event.stopPropagation();document.getElementById('fi').click()">Dosya
                                Seç</button>
                        </div>
                        <input type="file" id="fi" accept=".xlsx,.xls">
                    </div>
                    <div id="savedRaporInfo" class="card" style="display:none;padding:12px">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="font-size:18px">💾</span>
                            <div style="flex:1">
                                <div style="font-size:12px;font-weight:700;color:var(--grn)">Kayıtlı Rapor Defteri
                                    Mevcut
                                </div>
                                <div id="savedRaporMeta" style="font-size:11px;color:var(--tx3)"></div>
                            </div>
                            <button class="btn btn-o" style="padding:4px 10px;font-size:10px"
                                onclick="clearSavedRapor()">🗑
                                Sil</button>
                        </div>
                    </div>
                </div>

                <!-- P2 -->
                <div class="panel" id="p2">
                    <div class="ph">
                        <h1>Grup Seç</h1>
                        <p>Yapı sahibi, beton firması veya yapı denetim bazlı gruplayın</p>
                    </div>
                    <div class="card">
                        <!-- Grup modu sekmeleri -->
                        <div
                            style="display:flex;gap:4px;margin-bottom:12px;border-bottom:2px solid var(--bdr);padding-bottom:8px">
                            <button class="btn btn-p" id="gmYS" style="flex:1;font-size:11px;padding:6px"
                                onclick="switchGroupMode('YAPI SAHİBİ')">🏠 Yapı Sahibi</button>
                            <button class="btn btn-g" id="gmBF" style="flex:1;font-size:11px;padding:6px"
                                onclick="switchGroupMode('BETON FİRMASI')">🏭 Beton Firması</button>
                            <button class="btn btn-g" id="gmYD" style="flex:1;font-size:11px;padding:6px"
                                onclick="switchGroupMode('YAPI DENETİM')">🔍 Yapı Denetim</button>
                        </div>
                        <div class="otb"><span id="ownerCnt">0 kayıt</span>
                            <div class="lbs"><button class="lb" onclick="selAll()">Tümünü Seç</button><button class="lb"
                                    onclick="clrAll()">Temizle</button></div>
                        </div>
                        <div class="sw2"><input class="si" id="ownerSearch" placeholder="Ara..."
                                oninput="filterOwners()">
                        </div>
                        <div class="ol" id="ownerList"></div>
                        <div class="tags" id="tags"></div>
                        <div class="acts">
                            <button class="btn btn-p" id="btn2" onclick="goNav(3)" disabled>Devam →</button>
                            <button class="btn btn-o" onclick="goNav(1)">← Geri</button>
                        </div>
                    </div>
                </div>

                <!-- P3 -->
                <div class="panel" id="p3">
                    <div class="ph">
                        <h1>Tarih & Tip</h1>
                        <p>Dönem ve deney tipini seç</p>
                    </div>
                    <div class="card">
                        <div class="ch">Hızlı Tarih</div>
                        <div class="pills">
                            <span class="pill" onclick="setPill('2026-03','2026-03',this)">Mar 2026</span>
                            <span class="pill" onclick="setPill('2026-02','2026-02',this)">Şub 2026</span>
                            <span class="pill" onclick="setPill('2026-01','2026-01',this)">Oca 2026</span>
                            <span class="pill" onclick="setPill('2025-12','2025-12',this)">Ara 2025</span>
                            <span class="pill" onclick="setPill('2025-11','2025-11',this)">Kas 2025</span>
                            <span class="pill" onclick="setPill('2025-01','2026-03',this)">Tümü</span>
                        </div>
                        <div class="r2">
                            <div class="fld"><label>Başlangıç</label><input type="date" id="dateFrom"></div>
                            <div class="fld"><label>Bitiş</label><input type="date" id="dateTo"></div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="ch">Deney Tipi</div>
                        <div class="tg">
                            <div class="tc on" data-tip="ALL" onclick="toggleTip(this)">
                                <div class="tc-ic">📋</div>
                                <div class="tc-nm">Tümü</div>
                                <div class="tc-ds">B+BÇ+K</div>
                            </div>
                            <div class="tc" data-tip="B" onclick="toggleTip(this)">
                                <div class="tc-ic">🧱</div>
                                <div class="tc-nm">Beton (B)</div>
                                <div class="tc-ds">Küp/silindir</div>
                            </div>
                            <div class="tc" data-tip="BÇ" onclick="toggleTip(this)">
                                <div class="tc-ic">🔩</div>
                                <div class="tc-nm">Çelik (BÇ)</div>
                                <div class="tc-ds">Nervür</div>
                            </div>
                            <div class="tc" data-tip="K" onclick="toggleTip(this)">
                                <div class="tc-ic">⚙️</div>
                                <div class="tc-nm">Karot (K)</div>
                                <div class="tc-ds">Takım</div>
                            </div>
                        </div>
                        <div class="acts">
                            <button class="btn btn-o" onclick="goNav(2)">← Geri</button>
                            <button class="btn btn-p" onclick="goNav(4)">Fiyatlandır →</button>
                        </div>
                    </div>
                </div>

                <!-- P4 -->
                <div class="panel" id="p4">
                    <div class="ph">
                        <h1>Fiyatlandırma</h1>
                        <p>Birim fiyatları gir</p>
                    </div>
                    <div class="card" id="priceCard"></div>
                    <div class="acts">
                        <button class="btn btn-o" onclick="goNav(3)">← Geri</button>
                        <button class="btn btn-p" onclick="buildPreview()">Önizle →</button>
                    </div>
                </div>

                <!-- P5 -->
                <div class="panel" id="p5">
                    <div class="ph">
                        <h1>Önizleme & İndir</h1>
                        <p id="prevSub"></p>
                    </div>
                    <div class="sg" id="statsRow"></div>
                    <!-- KDV Özeti -->
                    <div class="card" id="kdvBox" style="display:none;padding:14px 20px">
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0">
                            <div style="text-align:center;padding:10px 0">
                                <div style="font-size:10px;color:var(--tx3);margin-bottom:4px">TOPLAM TUTAR</div>
                                <div style="font-family:var(--fd);font-size:18px;font-weight:700;color:var(--tx)"
                                    id="kdvNet">—</div>
                            </div>
                            <div
                                style="text-align:center;padding:10px 0;border-left:1px solid var(--bdr);border-right:1px solid var(--bdr)">
                                <div style="font-size:10px;color:var(--tx3);margin-bottom:4px">KDV (%20)</div>
                                <div style="font-family:var(--fd);font-size:18px;font-weight:700;color:var(--amb)"
                                    id="kdvAmount">—
                                </div>
                            </div>
                            <div style="text-align:center;padding:10px 0">
                                <div style="font-size:10px;color:var(--tx3);margin-bottom:4px">GENEL TOPLAM</div>
                                <div style="font-family:var(--fd);font-size:20px;font-weight:700;color:var(--grn)"
                                    id="kdvTotal">—</div>
                            </div>
                        </div>
                    </div>
                    <div class="card" style="padding:0">
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Tip</th>
                                        <th>Kod</th>
                                        <th>Tarih</th>
                                        <th>Yapı Denetim</th>
                                        <th>Yapı Sahibi</th>
                                        <th>Bölüm</th>
                                        <th>Blok</th>
                                        <th>m³</th>
                                        <th>Adet</th>
                                        <th>Cins</th>
                                        <th>Sınıf</th>
                                        <th>Tutar</th>
                                    </tr>
                                </thead>
                                <tbody id="prevBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="acts">
                        <button class="btn btn-o" onclick="goNav(4)">← Geri</button>
                        <button class="btn btn-s" onclick="downloadAll()">⬇ Ayrı Dosyalar</button>
                        <button class="btn btn-p" id="mergedBtn" style="display:none" onclick="downloadMerged()">⬇ Tek
                            Dosya</button>
                    </div>
                </div>

                <!-- Sözleşmeli Firmalar -->
                <div class="panel on" id="pSF" style="margin-top:32px">
                    <div class="ph">
                        <h1>💼 Sözleşmeli Firmalar</h1>
                        <p>Aylık cari attığınız firmaları sabit fiyatlarla kaydedin</p>
                    </div>
                    <div class="card">
                        <div class="ch">➕ Firma Ekle / Düzenle</div>
                        <input type="hidden" id="sfIdx" value="-1">
                        <div class="fld"><label>Firma Adı</label><input type="text" id="sfAd"
                                placeholder="örn: SMS GEMİ">
                        </div>
                        <div class="fld"><label>Yapı Sahipleri (virgülle ayırın)</label><input type="text" id="sfYS"
                                placeholder="örn: AHM.YILMAZ, MEHMET ÖZ"></div>
                        <div class="r2">
                            <div class="fld"><label>Beton ₺/adet</label><input type="number" id="sfBeton"
                                    placeholder="0" min="0">
                            </div>
                            <div class="fld"><label>Çelik ₺/adet</label><input type="number" id="sfCelik"
                                    placeholder="0" min="0">
                            </div>
                        </div>
                        <div class="r2">
                            <div class="fld"><label>Karot ₺/takım</label><input type="number" id="sfKarot"
                                    placeholder="0" min="0">
                            </div>
                            <div class="fld"><label>Pazar Mesaisi ₺</label><input type="number" id="sfPazar"
                                    placeholder="0" min="0">
                            </div>
                        </div>
                        <div class="acts">
                            <button class="btn btn-p" id="sfBtn" onclick="saveSF()">➕ Firma Ekle</button>
                            <button class="btn btn-o" onclick="clearSF()">Temizle</button>
                        </div>
                    </div>
                    <!-- Toplu işlem toolbar -->
                    <div id="sfBulkBar"
                        style="display:none;align-items:center;gap:8px;padding:10px 12px;background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;margin-bottom:10px;flex-wrap:wrap">
                        <span id="sfSelCount" style="font-size:12px;color:var(--tx3);min-width:80px">0 seçili</span>
                        <button class="btn btn-p" style="padding:4px 10px;font-size:11px" onclick="bulkUseSF()">📋 Toplu
                            Cari</button>
                        <button class="btn btn-o" style="padding:4px 10px;font-size:11px" onclick="bulkSFPassive()">😴
                            Pasif
                            Yap</button>
                        <button class="btn btn-p" style="padding:4px 10px;font-size:11px" onclick="bulkSFActive()">✅
                            Aktif
                            Yap</button>
                        <button class="btn btn-g" style="padding:4px 10px;font-size:11px;color:var(--red)"
                            onclick="bulkSFDelete()">🗑 Toplu Sil</button>
                        <button class="btn btn-g" style="padding:4px 10px;font-size:11px;margin-left:auto"
                            onclick="sfClearSel()">✖ Seçimi Temizle</button>
                    </div>
                    <div class="card" style="padding:0">
                        <div class="tw">
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width:30px"><input type="checkbox" id="sfChkAll"
                                                onchange="sfToggleAll(this.checked)" title="Tümünü seç"></th>
                                        <th>Firma</th>
                                        <th>Yapı Sahipleri</th>
                                        <th>Beton</th>
                                        <th>Çelik</th>
                                        <th>Karot</th>
                                        <th>Pazar</th>
                                        <th>Durum</th>
                                        <th>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody id="sfList"></tbody>
                            </table>
                        </div>
                    </div>
                </div>


`;

export default function CariPage() {
  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        const w = window as any;
        if (w.goNav) w.goNav(1);
        if (w.renderSF) w.renderSF();
        if (w.fbPullSF) w.fbPullSF();
        if (w.loadRapor) w.loadRapor();
        if (w.initUploads) w.initUploads();
      }}
    />
  );
}
