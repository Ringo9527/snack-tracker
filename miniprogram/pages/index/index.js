const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    barcode: '',
    showResult: false,
    resultMsg: '',
    historyList: [],
    newProduct: null
  },

  onLoad() {
    // 接收从 add 页传回的扫码结果
    const pages = getCurrentPages();
    if (pages.length > 1) {
      const prev = pages[pages.length - 2];
      if (prev.data && prev.data.scanBarcode) {
        this.setData({ barcode: prev.data.scanBarcode });
        this.lookupBarcode();
      }
    }
  },

  onBarcodeInput(e) {
    this.setData({ barcode: e.detail.value });
  },

  scanBarcode() {
    wx.scanCode({ scanType: ['barCode', 'ean13', 'ean8', 'upc'] }).then(res => {
      this.setData({ barcode: res.result });
      this.lookupBarcode();
    }).catch(() => {
      wx.showToast({ title: '已取消扫描', icon: 'none' });
    });
  },

  async lookupBarcode() {
    const barcode = this.data.barcode.trim();
    if (!barcode) { wx.showToast({ title: '请输入条码', icon: 'none' }); return; }
    if (!/^\d{8,13}$/.test(barcode)) { wx.showToast({ title: '条码格式不对', icon: 'none' }); return; }

    this.setData({ showResult: true, historyList: [], newProduct: null, resultMsg: '正在查询...' });

    // 策略0：查本地录入数据
    const localRes = await db.collection('snacks').where({ barcode }).get();
    if (localRes.data.length > 0) {
      const latest = localRes.data[localRes.data.length - 1];
      // 保存扫码结果到全局，供 add 页调用
      const app = getApp();
      app.globalData.scanResult = {
        name: latest.name, brand: latest.brand,
        shelfDays: latest.shelfDays, barcode
      };
      this.setData({
        resultMsg: '🔄 这是你之前录入过的零食！（共' + localRes.data.length + '条）',
        historyList: localRes.data.map(i => ({
          ...i, statusText: i.remaining > 30 ? '安全' : i.remaining > 0 ? '即将过期' : '已过期',
          status: i.remaining > 30 ? 'safe' : i.remaining > 0 ? 'warn' : 'expired'
        }))
      });
      return;
    }

    // 策略1：中国商品数据库
    this.setData({ resultMsg: '正在查询国内商品数据库...' });
    try {
      const apiRes = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://v1.apizero.cn/api/barcode-lookup?barcode=' + barcode,
          success: resolve, fail: reject
        });
      });
      const data = apiRes.data;
      if (data.code === 0 && data.data && data.data.found) {
        const p = data.data;
        let shelfDays = '';
        const localMatch = await db.collection('snacks').where({ name: p.name }).limit(1).get();
        if (localMatch.data.length > 0 && localMatch.data[0].shelfDays) {
          shelfDays = localMatch.data[0].shelfDays;
        }
        const app = getApp();
        app.globalData.scanResult = {
          name: p.name || '', brand: p.brand || '', shelfDays, barcode
        };
        this.setData({
          resultMsg: '✅ 识别成功！切换到「录入零食」标签页填写生产日期即可保存',
          newProduct: { name: p.name, brand: p.brand, shelfDays: shelfDays || null, spec: p.spec }
        });
        return;
      }
    } catch (e) {}

    // 策略2：国际数据库
    this.setData({ resultMsg: '国内未找到，查询国际数据库...' });
    try {
      const intlRes = await new Promise((resolve, reject) => {
        wx.request({
          url: 'https://world.openfoodfacts.org/api/v0/product/' + barcode + '.json',
          success: resolve, fail: reject
        });
      });
      if (intlRes.data.status === 1 && intlRes.data.product) {
        const p = intlRes.data.product;
        const name = p.product_name_zh || p.product_name || '';
        const brand = (p.brands || '').split(',')[0].trim();
        const app = getApp();
        app.globalData.scanResult = { name, brand, shelfDays: '', barcode };
        this.setData({
          resultMsg: '✅ 国际数据库识别成功',
          newProduct: { name, brand, shelfDays: null }
        });
        return;
      }
    } catch (e) {}

    this.setData({ resultMsg: '⚠️ 未找到该条码的商品信息' });
  }
});
