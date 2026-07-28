const db = wx.cloud.database();

Page({
  data: {
    name: '', brand: '', barcode: '', prodDate: '',
    shelfDays: '', scanBanner: ''
  },

  onShow() {
    const app = getApp();
    const sr = app.globalData.scanResult;
    if (sr && (sr.name || sr.barcode)) {
      this.setData({
        name: sr.name, brand: sr.brand,
        barcode: sr.barcode || '',
        shelfDays: sr.shelfDays ? String(sr.shelfDays) : '',
        scanBanner: '名称：' + (sr.name || '') + ' | 品牌：' + (sr.brand || '') + ' | 条码：' + (sr.barcode || '')
      });
      app.globalData.scanResult = null;
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ prodDate: e.detail.value });
  },

  setMonth(e) {
    const m = parseFloat(e.currentTarget.dataset.m);
    this.setData({ shelfDays: String(Math.round(m * 30)) });
  },

  async submit() {
    const { name, brand, barcode, prodDate, shelfDays } = this.data;
    if (!name) { wx.showToast({ title: '请填写零食名称', icon: 'none' }); return; }
    if (!prodDate) { wx.showToast({ title: '请选择生产日期', icon: 'none' }); return; }
    const daysNum = parseInt(shelfDays, 10);
    if (!daysNum || daysNum <= 0) { wx.showToast({ title: '请填写保质期（日）', icon: 'none' }); return; }

    const expire = new Date(new Date(prodDate).getTime() + daysNum * 86400000);
    const today = new Date(); today.setHours(0,0,0,0);
    const remaining = Math.ceil((expire - today) / 86400000);
    const expireStr = expire.getFullYear() + '-' + String(expire.getMonth()+1).padStart(2,'0') + '-' + String(expire.getDate()).padStart(2,'0');

    await db.collection('snacks').add({
      data: {
        name, brand, barcode, prodDate, shelfDays: daysNum,
        expireDate: expireStr, remaining,
        status: remaining > 30 ? 'safe' : remaining > 0 ? 'warn' : 'expired',
        createdAt: db.serverDate()
      }
    });

    this.setData({
      name: '', brand: '', barcode: '', prodDate: '',
      shelfDays: '', scanBanner: ''
    });
    wx.showToast({ title: '✅ 录入成功！' + name, icon: 'success' });
  }
});
