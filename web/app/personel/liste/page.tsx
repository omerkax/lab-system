'use client';
import ModulePage from '@/components/ModulePage';

const HTML = `
<div class="page-shell">
<div class="ph" style="margin-bottom:20px">
  <h1>👥 Personel Listesi</h1>
  <p>Çalışan bilgileri, TC ve IBAN kayıtları</p>
</div>
<div class="card" style="margin-bottom:20px">
  <div class="alrt i" style="margin-bottom:14px">
    <span class="alrt-ic">ℹ</span>
    <span>Saha personeli için kullanıcı adı + şifre verirseniz ilgili kişi yalnızca kendi ekranlarına şifreyle girer (düzenleme yetkisi olmaz). Mevcut personelde şifreyi değiştirmek için yeni şifre yazın.</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:15px;align-items:flex-end">
    <div class="fld"><label>Ad Soyad</label><input id="staffName" placeholder="Maaş bordrosunda görünür"></div>
    <div class="fld"><label>TC Kimlik</label><input id="staffTC" maxlength="11"></div>
    <div class="fld"><label>IBAN</label><input id="staffIBAN" placeholder="TR..."></div>
    <div class="fld"><label>Sabit Net Maaş</label><input id="staffNet" type="number" step="0.01"></div>
    <div class="fld"><label>İnşaat / Görev</label><input id="staffGorev" placeholder="örn: A-Blok Kalıp"></div>
    <div class="fld"><label>Ünvan / Meslek</label><input id="staffMeslek" placeholder="örn: Usta / İşçi"></div>
    <div class="fld"><label>Doğum tarihi</label><input id="staffDogum" type="date"></div>
    <div class="fld"><label>Kan grubu</label><input id="staffKan" placeholder="örn: A Rh+"></div>
    <div class="fld"><label>Cep telefonu</label><input id="staffCep" placeholder="05xx…"></div>
    <div class="fld"><label>Yakın (ad soyad)</label><input id="staffYakinAd" placeholder="Acil durum"></div>
    <div class="fld"><label>Yakın telefon</label><input id="staffYakinTel" placeholder="05xx…"></div>
    <div class="fld"><label>Saha giriş — kullanıcı adı</label><input id="staffPortalLogin" placeholder="Giriş için zorunlu, 3–32 karakter" autocomplete="off"></div>
    <div class="fld"><label>Saha giriş — şifre</label><input id="staffPortalPass" type="password" placeholder="yeni personelde zorunlu" autocomplete="new-password"></div>
    <div class="fld" style="display:flex;align-items:center;gap:8px;padding-bottom:12px">
      <input type="checkbox" id="staffIsKarot" style="width:20px;height:20px">
      <label style="margin:0;cursor:pointer;font-weight:700" for="staffIsKarot">Karotçu mu?</label>
    </div>
    <div id="staffBtnBox" style="display:flex;gap:10px">
      <button class="btn btn-p" id="saveStaffBtn" onclick="saveStaff()" style="height:42px;flex:1">👤 Personel Ekle</button>
      <button class="btn btn-g" id="cancelStaffBtn" onclick="cancelStaffEdit()" style="height:42px;display:none">Vazgeç</button>
    </div>
  </div>
</div>
<div class="card" style="padding:0">
  <div class="tw">
    <table>
      <thead>
        <tr>
          <th>Personel (Görev / Meslek)</th>
          <th style="text-align:center">TC</th>
          <th style="text-align:center">IBAN</th>
          <th style="text-align:right">Net Maaş</th>
          <th style="text-align:center">Karotçu</th>
          <th style="text-align:center">İşlem</th>
        </tr>
      </thead>
      <tbody id="staffList"></tbody>
    </table>
  </div>
</div>
</div>
`;

export default function PersonelListePage() {
  return (
    <ModulePage
      html={HTML}
      onInit={() => {
        const w = window as any;
        if (w.fbPullStaff) w.fbPullStaff();
      }}
    />
  );
}
