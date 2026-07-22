App({
  onLaunch() {
    wx.cloud.init({ env: '你的环境ID' });
  },
  globalData: {
    scanResult: null
  }
});
