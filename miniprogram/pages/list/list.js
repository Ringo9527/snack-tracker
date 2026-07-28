const db = wx.cloud.database();

Page({
  data: { items: [], searchText: '', safeCount: 0, warnCount: 0, expiredCount: 0 },

  onShow() { this.loadSnacks(); },

  async loadSnacks() {
    wx.showLoading({ title: '加载中' });
    const today = new Date(); today.setHours(0,0,0,0);
    try {
      const res = await db.collection('snacks').orderBy('remaining', 'asc').get();
      const items = res.data.map(i => {
        const expire = new Date(i.expireDate);
        const remaining = Math.ceil((expire - today) / 86400000);
        return {
          ...i, remaining,
          status: remaining > 30 ? 'safe' : remaining > 0 ? 'warn' : 'expired',
          statusText: remaining > 30 ? '安全' : remaining > 0 ? '即将过期' : '已过期'
        };
      });
      const s = this.data.searchText.toLowerCase();
      const filtered = s ? items.filter(i => i.name.toLowerCase().includes(s) || (i.brand||'').toLowerCase().includes(s)) : items;
      this.setData({
        items: filtered,
        safeCount: items.filter(i => i.status === 'safe').length,
        warnCount: items.filter(i => i.status === 'warn').length,
        expiredCount: items.filter(i => i.status === 'expired').length
      });
    } catch(e) { console.error(e); }
    wx.hideLoading();
  },

  onSearch(e) { this.setData({ searchText: e.detail.value }); this.loadSnacks(); },

  async deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    const res = await wx.showModal({ title: '确认删除？', content: '删除后不可恢复' });
    if (res.confirm) {
      await db.collection('snacks').doc(id).remove();
      wx.showToast({ title: '已删除', icon: 'success' });
      this.loadSnacks();
    }
  },

  async subscribeMsg() {
    try {
      const res = await wx.requestSubscribeMessage({
        tmplIds: ['sjnjX9K4gY53GXrJe9OzLJUjmmtTqp3ckZcFBZZTZ-g']
      });
      if (res.errMsg === 'requestSubscribeMessage:ok') {
        // 存储订阅标记
        wx.setStorageSync('subscribed', true);
        wx.showToast({ title: '提醒已开启！', icon: 'success' });
      }
    } catch(e) {
      wx.showToast({ title: '订阅取消', icon: 'none' });
    }
  }
});
