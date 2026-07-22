const db = wx.cloud.database();

Page({
  data: {
    name: '', brand: '', barcode: '', prodDate: '',
    shelfMonth: '', shelfDays: 0, scanBanner: ''
  },

  onShow() {
    const app = getApp();
    const sr = app.globalData.scanResult;
    if (sr && (sr.name || sr.barcode)) {
      const shelfMonth = sr.shelfDays ? Math.round(sr.shelfDays / 30 * 10) / 10 : '';
      this.setData({
        name: sr.name, brand: sr.brand,
        barcode: sr.barcode || '', shelfMonth: String(shelfMonth),
        shelfDays: sr.shelfDays || 0,
        scanBanner: '名称：' + (sr.name || '') + ' | 品牌：' + (sr.brand || '') + ' | 条码：' + (sr.barcode || '')
      });
      app.globalData.scanResult = null;
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    const data = { [field]: val };
    if (field === 'shelfMonth') {
      data.shelfDays = Math.round(parseFloat(val || 0) * 30);
    }
    this.setData(data);
  },

  onDateChange(e) {
    this.setData({ prodDate: e.detail.value });
  },

  setMonth(e) {
    const m = e.currentTarget.dataset.m;
    this.setData({ shelfMonth: String(m), shelfDays: Math.round(m * 30) });
  },

  async submit() {
    const { name, brand, barcode, prodDate, shelfDays, shelfMonth } = this.data;
    if (!name) { wx.showToast({ title: '请填写零食名称', icon: 'none' }); return; }
    if (!prodDate) { wx.showToast({ title: '请选择生产日期', icon: 'none' }); return; }
    if (!shelfMonth || parseFloat(shelfMonth) <= 0) { wx.showToast({ title: '请填写保质期', icon: 'none' }); return; }

    const expire = new Date(new Date(prodDate).getTime() + shelfDays * 86400000);
    const today = new Date(); today.setHours(0,0,0,0);
    const remaining = Math.ceil((expire - today) / 86400000);
    const expireStr = expire.getFullYear() + '-' + String(expire.getMonth()+1).padStart(2,'0') + '-' + String(expire.getDate()).padStart(2,'0');

    await db.collection('snacks').add({
      data: {
        name, brand, barcode, prodDate, shelfDays,
        expireDate: expireStr, remaining,
        status: remaining > 30 ? 'safe' : remaining > 0 ? 'warn' : 'expired',
        createdAt: db.serverDate()
      }
    });

    this.setData({
      name: '', brand: '', barcode: '', prodDate: '',
      shelfMonth: '', shelfDays: 0, scanBanner: ''
    });
    wx.showToast({ title: '✅ 录入成功！' + name, icon: 'success' });
  }
});
