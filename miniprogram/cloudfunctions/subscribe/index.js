// 云函数：处理订阅消息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // 解析微信传入的触发消息，发送订阅通知
  const { OPENID } = cloud.getWXContext();
  return { openid: OPENID, subscribed: true };
};
