App({
  onLaunch() {
    wx.cloud.init({ env: 'cloud1-d9g2wftkp73ad810f' });
  },
  globalData: {
    scanResult: null
  }
});
