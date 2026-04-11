'use client';
import ModulePage from '@/components/ModulePage';
import OzlukTools from './OzlukTools';

const HTML = `
<div class="page-shell">
<div class="ph" style="margin-bottom:20px">
  <h1>Özlük & İK</h1>
  <p>Doğum, kan grubu, iletişim ve yakın bilgileri — maaş / TC için personel listesi</p>
</div>
<div class="alrt i" style="margin-bottom:14px">
  <span class="alrt-ic">ℹ</span>
  <span>Tabloda maaş yok. Özlük alanlarını hızlı düzenlemek için yönetici panelini kullanın veya <a href="/personel/liste" style="color:var(--acc2);font-weight:700">Personel Listesi</a>.</span>
</div>
<div class="card" style="padding:0">
  <div class="tw">
    <table>
      <thead>
        <tr>
          <th>Personel</th>
          <th>Doğum</th>
          <th style="text-align:center">Kan</th>
          <th>Telefon</th>
          <th>Yakın</th>
          <th>Yakın tel</th>
          <th style="text-align:center">Karot</th>
          <th style="text-align:center">İşlem</th>
        </tr>
      </thead>
      <tbody id="ozlukStaffList"><tr><td colspan="8" style="text-align:center;padding:24px;color:var(--tx3)">Yükleniyor…</td></tr></tbody>
    </table>
  </div>
</div>
</div>
`;

export default function PersonelOzlukPage() {
  return (
    <>
      <OzlukTools />
      <ModulePage
        html={HTML}
        onInit={() => {
          const w = window as any;
          if (typeof w.fbPullStaff === 'function') void w.fbPullStaff();
        }}
      />
    </>
  );
}
