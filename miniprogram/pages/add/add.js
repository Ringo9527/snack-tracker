const db = wx.cloud.database();

Page({
  data: {
    name: '', brand: '', barcode: '', prodDate: '',
    shelfDays: '', daysHint: '', scanBanner: ''
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
    const val = e.detail.value;
    this.setData({ [field]: val }, () => {
      if (field === 'shelfDays') this.updateDaysHint();
    });
  },

  onDateChange(e) {
    this.setData({ prodDate: e.detail.value });
  },

  // 保质期小字提示
  updateDaysHint() {
    const days = parseInt(this.data.shelfDays, 10);
    if (days > 0) {
      if ((days % 30 === 0) || (days % 31 === 0)) {
        const months = Math.round(days / 30.5);
        this.setData({ daysHint: days + '天（约' + months + '个月）' });
      } else {
        this.setData({ daysHint: days + '天' });
      }
    } else {
      this.setData({ daysHint: '' });
    }
  },

  setMonth(e) {
    const m = parseFloat(e.currentTarget.dataset.m);
    const days = String(Math.round(m * 30));
    this.setData({ shelfDays: days }, () => this.updateDaysHint());
  },

  // 上传条形码图片识别（直接调用在线解码服务，无需云函数）
  async uploadBarcode() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFilePaths[0];
        wx.showLoading({ title: '识别条形码中...' });
        try {
          let barcode = null;

          // 策略1：zxing.org 在线解码
          try {
            barcode = await new Promise((resolve, reject) => {
              const task = wx.uploadFile({
                url: 'https://zxing.org/w/decode',
                filePath: tempPath,
                name: 'file',
                formData: { full: 'true' },
                timeout: 10000,
                success: (resp) => {
                  // 从 HTML 中提取条码
                  const html = resp.data;
                  const match = html.match(/Raw text[^>]*>([^<]+)</);
                  if (match) resolve(match[1].trim());
                  else resolve(null);
                },
                fail: () => resolve(null)
              });
            });
          } catch(e) { barcode = null; }

          // 策略2：api.qrserver.com（同时支持二维码和条形码）
          if (!barcode) {
            try {
              barcode = await new Promise((resolve, reject) => {
                wx.uploadFile({
                  url: 'https://api.qrserver.com/v1/read-qr-code/',
                  filePath: tempPath,
                  name: 'file',
                  timeout: 10000,
                  success: (resp) => {
                    try {
                      const data = JSON.parse(resp.data);
                      if (data && data[0] && data[0].symbol && data[0].symbol[0]) {
                        const val = data[0].symbol[0].data;
                        if (val && val !== 'null') resolve(val.trim());
                        else resolve(null);
                      } else resolve(null);
                    } catch(e) { resolve(null); }
                  },
                  fail: () => resolve(null)
                });
              });
            } catch(e) { barcode = null; }
          }

          wx.hideLoading();

          if (barcode && /^\d{8,13}$/.test(barcode)) {
            that.setData({ barcode });
            wx.showToast({ title: '✅ 识别成功: ' + barcode, icon: 'success' });
            that.lookupBarcode(barcode);
          } else {
            wx.showToast({ title: '❌ 未识别到条码，请确保图片清晰', icon: 'none' });
          }
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: '识别失败，请重试', icon: 'none' });
        }
      }
    });
  },

  // 条码查询（查在线数据库）
  async lookupBarcode(barcode) {
    if (!barcode || !/^\d{8,13}$/.test(barcode)) return;
    wx.showLoading({ title: '查询商品信息...' });
    try {
      // 查本地
      const localRes = await db.collection('snacks').where({ barcode }).limit(1).get();
      if (localRes.data.length > 0) {
        const item = localRes.data[0];
        this.setData({
          name: item.name,
          brand: item.brand || '',
          shelfDays: item.shelfDays ? String(item.shelfDays) : '',
        }, () => this.updateDaysHint());
        wx.hideLoading();
        wx.showToast({ title: '已从历史记录填充', icon: 'success' });
        return;
      }

      // 查中国数据库
      const apiRes = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://v1.apizero.cn/api/barcode-lookup?barcode=' + barcode,
          success: resolve, fail: reject,
          timeout: 5000
        });
      });
      const data = apiRes.data;
      if (data.code === 0 && data.data && data.data.found) {
        this.setData({
          name: data.data.name || '',
          brand: data.data.brand || '',
        });
        wx.hideLoading();
        wx.showToast({ title: '已填充: ' + (data.data.name || ''), icon: 'success' });
        return;
      }

      // 查 UPCitemdb
      const upcRes = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://api.upcitemdb.com/prod/trial/lookup?upc=' + barcode,
          success: resolve, fail: reject,
          timeout: 5000
        });
      });
      if (upcRes.data.code === 'OK' && upcRes.data.items && upcRes.data.items.length > 0) {
        this.setData({
          name: upcRes.data.items[0].title || '',
          brand: upcRes.data.items[0].brand || '',
        });
      }
    } catch (e) { /* 静默 */ }
    wx.hideLoading();
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
