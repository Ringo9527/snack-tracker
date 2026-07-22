// 云函数：每日检查过期零食并推送订阅消息
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const today = new Date();
  today.setHours(0,0,0,0);
  
  // 查出所有即将过期和已过期的零食
  const warnSnacks = await db.collection('snacks')
    .where(_.or([{ status: 'warn' }, { status: 'expired' }]))
    .orderBy('remaining', 'asc')
    .get();

  if (warnSnacks.data.length === 0) return { notified: false, reason: '无过期零食' };

  const expired = warnSnacks.data.filter(s => s.status === 'expired');
  const warn = warnSnacks.data.filter(s => s.status === 'warn');

  // 构建推送消息
  let title = '🍿 零食保质期提醒';
  let content = '';
  if (expired.length > 0) content += '有' + expired.length + '款零食已过期 ';
  if (warn.length > 0) content += '有' + warn.length + '款零食即将过期';
  
  // 发送订阅消息（需要配置模板）
  try {
    // 这里需要用户主动订阅过的才能推送
    // const result = await cloud.openapi.subscribeMessage.send({ ... });
    console.log('推送内容：', title, content);
    console.log('过期：', expired.map(s => s.name).join('、'));
    console.log('即将过期：', warn.map(s => s.name).join('、'));
    
    return {
      notified: true,
      expiredCount: expired.length,
      warnCount: warn.length,
      message: content
    };
  } catch (e) {
    console.error('推送失败:', e);
    return { notified: false, error: e.message };
  }
};
