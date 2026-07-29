const db = wx.cloud.database();

function formatDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

const QUICK_OPTIONS = [
  '1个月（30天）', '2个月（60天）', '3个月（90天）', '4个月（120天）',
  '5个月（150天）', '6个月（180天）', '7个月（210天）', '8个月（240天）',
  '9个月（270天）', '10个月（300天）', '11个月（330天）', '12个月（365天）',
  '18个月（547天）', '24个月（730天）', '48个月（1460天）'
];
const QUICK_VALUES = [30,60,90,120,150,180,210,240,270,300,330,365,547,730,1460];

Page({
  data: {
    name: '', brand: '', barcode: '', prodDate: '',
    expireDate: '', shelfDays: '', daysHint: '',
    scanBanner: '', quickOptions: QUICK_OPTIONS, quickIndex: -1
  },

  onShow() {
    const app = getApp();
    const sr = app.globalData.scanResult;
    if (sr && (sr.name || sr.barcode)) {
      const data = {
        name: sr.name, brand: sr.brand,
        barcode: sr.barcode || '',
        shelfDays: sr.shelfDays ? String(sr.shelfDays) : '',
        scanBanner: '名称：' + (sr.name || '') + ' | 品牌：' + (sr.brand || '') + ' | 条码：' + (sr.barcode || '')
      };
      this.setData(data);
      app.globalData.scanResult = null;
    }
  },

  // 生产日期变更 → 如有保质期则自动计算到期日
  onProdDateChange(e) {
    const prodDate = e.detail.value;
    this.setData({ prodDate }, () => this.calcExpireFromShelf());
  },

  // 到期日期变更 → 如有生产日期则自动计算保质期
  onExpireDateChange(e) {
    const expireDate = e.detail.value;
    this.setData({ expireDate }, () => this.calcShelfFromExpire());
  },

  // 保质期输入
  onShelfInput(e) {
    const shelfDays = e.detail.value;
    this.setData({ shelfDays, quickIndex: -1 }, () => this.calcExpireFromShelf());
  },

  // 从生产日期+保质期计算到期日
  calcExpireFromShelf() {
    const { prodDate, shelfDays } = this.data;
    const days = parseInt(shelfDays, 10);
    if (prodDate && days > 0) {
      const expire = new Date(new Date(prodDate).getTime() + days * 86400000);
      this.setData({ expireDate: formatDate(expire) });
    }
    this.updateDaysHint();
  },

  // 从生产日期+到期日计算保质期
  calcShelfFromExpire() {
    const { prodDate, expireDate } = this.data;
    if (prodDate && expireDate) {
      const diff = Math.round((new Date(expireDate) - new Date(prodDate)) / 86400000);
      if (diff > 0) {
        this.setData({ shelfDays: String(diff), quickIndex: -1 }, () => this.updateDaysHint());
      }
    }
  },

  // 保质期小字提示
  updateDaysHint() {
    const days = parseInt(this.data.shelfDays, 10);
    if (days > 0) {
      const months = Math.round(days / 30.5 * 10) / 10;
      this.setData({ daysHint: days + '天（约' + months + '个月）' });
    } else {
      this.setData({ daysHint: '' });
    }
  },

  // 快捷下拉选择
  onQuickSelect(e) {
    const idx = e.detail.value;
    const days = String(QUICK_VALUES[idx]);
    this.setData({ shelfDays: days, quickIndex: idx }, () => this.calcExpireFromShelf());
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
    const expireStr = formatDate(expire);

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
      expireDate: '', shelfDays: '', daysHint: '',
      scanBanner: '', quickIndex: -1
    });
    wx.showToast({ title: '✅ 录入成功！' + name, icon: 'success' });
  }
});
