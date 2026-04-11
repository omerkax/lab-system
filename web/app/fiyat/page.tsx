'use client';
import ModulePage from '@/components/ModulePage';

const HTML = `
                <div class="ph">
                    <h1>Fiyat Hesaplama</h1>
                    <p>Teklif hesapla, kaydet, iş durumunu takip et</p>
                </div>
                <div class="fh-grid">
                    <!-- SOL: hesaplayıcılar -->
                    <div>
                        <div class="card">
                            <div class="ch">📐 Peşin Fiyat Tablosu</div>
                            <div class="ref-tbl">
                                <div class="ref-row hd"><span>Alan Aralığı</span><span>Birim (KDV Hariç)</span></div>
                                <div class="ref-row"><span>0 – 500 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">40.000
                                        ₺</span></div>
                                <div class="ref-row"><span>501 – 1.000 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">45.000 ₺</span></div>
                                <div class="ref-row"><span>1.001 – 1.500 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">52.000 ₺</span></div>
                                <div class="ref-row"><span>1.501 – 2.000 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">60.000 ₺</span></div>
                                <div class="ref-row"><span>2.001 – 2.500 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">68.000 ₺</span></div>
                                <div class="ref-row"><span>2.501 – 3.000 m²</span><span
                                        style="font-family:var(--fm);color:var(--amb)">91.000 ₺</span></div>
                            </div>
                            <div class="fld"><label>İnşaat Alanı (m²)</label><input type="number" id="fhAlan"
                                    placeholder="örn: 850" min="1" oninput="calcFH()"></div>
                            <div id="fhResult"></div>
                        </div>
                        <div class="card">
                            <div class="ch">🔩 Kazık Hesaplayıcı</div>
                            <div class="r2">
                                <div class="fld"><label>Kazık Döküm Sayısı</label><input type="number" id="kDok"
                                        placeholder="0" min="0" oninput="calcKazik()"></div>
                                <div class="fld"><label>Çelik Adet</label><input type="number" id="kCelik"
                                        placeholder="0" min="0" oninput="calcKazik()"></div>
                            </div>
                            <div
                                style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:10px">
                                <div
                                    style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                                    💰 Birim Fiyatlar</div>
                                <div class="r2" style="margin:0">
                                    <div class="fld" style="margin:0"><label>Beton Birim (₺)</label><input type="number"
                                            id="kDokBF" placeholder="275" value="275" min="0" oninput="calcKazik()">
                                    </div>
                                    <div class="fld" style="margin:0"><label>Çelik Birim (₺)</label><input type="number"
                                            id="kCelBF" placeholder="4000" value="4000" min="0" oninput="calcKazik()">
                                    </div>
                                </div>
                            </div>
                            <div id="kResult"></div>
                        </div>
                        <div class="card">
                            <div class="ch">🧱 İstinat Hesaplayıcı</div>
                            <div class="r2">
                                <div class="fld"><label>İstinat Döküm Sayısı</label><input type="number" id="iDok"
                                        placeholder="0" min="0" oninput="calcIstinat()"></div>
                                <div class="fld"><label>İstinat Çelik Adet</label><input type="number" id="iCelik"
                                        placeholder="0" min="0" oninput="calcIstinat()"></div>
                            </div>
                            <div
                                style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:10px">
                                <div
                                    style="font-size:10px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                                    💰 Birim Fiyatlar</div>
                                <div class="r2" style="margin:0">
                                    <div class="fld" style="margin:0"><label>Beton Birim (₺)</label><input type="number"
                                            id="iDokBF" placeholder="275" value="275" min="0" oninput="calcIstinat()">
                                    </div>
                                    <div class="fld" style="margin:0"><label>Çelik Birim (₺)</label><input type="number"
                                            id="iCelBF" placeholder="4000" value="4000" min="0" oninput="calcIstinat()">
                                    </div>
                                </div>
                            </div>
                            <div id="iResult"></div>
                        </div>
                    </div>
                    <!-- SAĞ: kayıt formu -->
                    <div>
                        <div class="card">
                            <div class="ch">💾 Teklif Kaydet</div>
                            <div class="fld"><label>Müşteri / Firma Adı</label><input type="text" id="prMu"
                                    placeholder="Ad soyad veya firma..."></div>
                            <div class="r2">
                                <div class="fld"><label>Teklif Tipi</label>
                                    <select id="prTip">
                                        <option value="Peşin">Peşin (m² bazlı)</option>
                                        <option value="Kazık">Kazık</option>
                                        <option value="İstinat">İstinat</option>
                                        <option value="Karma">Karma</option>
                                        <option value="Adet">Adet Fiyatı</option>
                                        <option value="Diğer">Diğer</option>
                                    </select>
                                </div>
                                <div class="fld"><label>Alan (m²)</label><input type="number" id="prAlan"
                                        placeholder="0">
                                </div>
                            </div>
                            <div class="fld"><label>Tablo / Liste Fiyatı (₺)</label><input type="number" id="prTablo"
                                    placeholder="0" oninput="calcIskonto()" readonly style="background:var(--sur2)">
                            </div>
                            <div id="prKalemler"
                                style="display:none;background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:10px;margin-bottom:12px">
                                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                                    <div
                                        style="font-size:10px;font-weight:700;color:var(--acc2);text-transform:uppercase;letter-spacing:.08em;flex:1">
                                        📋 Kalem Detayı</div>
                                    <button class="btn btn-g" style="padding:2px 8px;font-size:9px;color:var(--red)"
                                        onclick="clearKalemler()">🗑 Temizle</button>
                                </div>
                                <div id="prKalemList"></div>
                            </div>
                            <!-- İskonto: % veya ₺ toggle -->
                            <div
                                style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-bottom:12px">
                                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                                    <div
                                        style="font-size:10px;font-weight:700;color:var(--acc2);text-transform:uppercase;letter-spacing:.08em;flex:1">
                                        🏷️ İskonto</div>
                                    <div id="iskTipToggle"
                                        style="display:flex;border-radius:6px;overflow:hidden;border:1px solid var(--bdr2);font-size:11px">
                                        <div id="iskBtn-pct" class="pill on"
                                            style="border-radius:6px 0 0 6px;margin:0;border:none;padding:4px 12px;cursor:pointer"
                                            onclick="toggleIskTip('pct')">%</div>
                                        <div id="iskBtn-tl" class="pill"
                                            style="border-radius:0 6px 6px 0;margin:0;border:none;border-left:1px solid var(--bdr2);padding:4px 12px;cursor:pointer"
                                            onclick="toggleIskTip('tl')">₺</div>
                                    </div>
                                </div>
                                <div class="r2" style="margin:0">
                                    <div class="fld" style="margin:0"><label id="iskLabel">İskonto (%)</label><input
                                            type="number" id="prIsk" placeholder="0" min="0" oninput="calcIskonto()">
                                    </div>
                                    <div class="fld" style="margin:0"><label>İskonto Tutarı (₺)</label><input
                                            type="number" id="prIskTL" placeholder="0" readonly style="opacity:.6">
                                    </div>
                                </div>
                            </div>
                            <div class="r2">
                                <div class="fld"><label>Net Fiyat (KDV Hariç ₺)</label><input type="number" id="prNet"
                                        placeholder="0" readonly style="background:var(--sur2)"></div>
                                <div class="fld"><label>KDV Dahil Toplam (₺)</label><input type="number" id="prKdv"
                                        placeholder="0" readonly
                                        style="background:var(--sur2);color:var(--grn);font-weight:700"></div>
                            </div>
                            <div style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:12px;margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
                                <div class="fld" style="margin:0"><label>Ödeme / Vade</label><input type="text" id="prVade" placeholder="örn: 7 Gün / Peşin"></div>
                                <div class="fld" style="margin:0"><label>Geçerlilik</label><input type="text" id="prGecerlilik" placeholder="örn: 15 Gün"></div>
                                <div class="fld" style="margin:0;grid-column:span 2"><label>Hazırlayan / Yetkili</label><input type="text" id="prYetkili" placeholder="Ad Soyad"></div>
                            </div>
                            <div
                                style="background:var(--sur2);border:1px solid var(--bdr);border-radius:8px;padding:12px">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                                    <div style="font-size:10px;font-weight:700;color:var(--acc2);text-transform:uppercase;letter-spacing:.08em">📋 Teklif Kalemleri</div>
                                    <div style="display:flex;gap:4px">
                                        <button class="btn btn-o" style="padding:2px 8px;font-size:9px" onclick="addOfferItem('Beton', 275, 1)">+ Beton</button>
                                        <button class="btn btn-o" style="padding:2px 8px;font-size:9px" onclick="addOfferItem('Çelik', 4000, 1)">+ Çelik</button>
                                        <button class="btn btn-p" style="padding:2px 8px;font-size:9px" onclick="addOfferItem('', 0, 1)">+ Diğer</button>
                                    </div>
                                </div>
                                <div id="offerItemsList" style="display:flex;flex-direction:column;gap:6px"></div>
                            </div>
                            <div class="fld"><label>Notlar / Şartname</label><textarea id="prNot" rows="2"
                                    placeholder="Ek bilgi, şartlar..."></textarea></div>
                            <div class="acts">
                                <button class="btn btn-p" onclick="savePR()">💾 Kaydet</button>
                                <button class="btn btn-o" onclick="clearPR()">Temizle</button>
                            </div>
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
        if(w.calcFH)w.calcFH(); if(w.calcKazik)w.calcKazik(); if(w.calcIstinat)w.calcIstinat(); if(w.fbPullPR)w.fbPullPR();
        if(w.loadPendingPREdit)w.loadPendingPREdit();
      }}
    />
  );
}
