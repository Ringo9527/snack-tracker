// 云函数：从图片中识别条形码（备用方案）
// 主方案由小程序端直接调用在线API（zxing.org / qrserver.com）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const jimp = require('jimp');
const { scanImageData } = require('@undecaf/zbar-wasm');

exports.main = async (event) => {
  const { imageBase64 } = event;
  if (!imageBase64) return { decoded: null, error: '缺少图片数据' };

  try {
    // 将 base64 转为图片，预处理后交给 ZBar WASM 解码
    const buffer = Buffer.from(imageBase64, 'base64');
    const image = await jimp.read(buffer);
    image.grayscale().contrast(0.5);
    const { bitmap } = image;

    const results = await scanImageData({
      data: new Uint8ClampedArray(bitmap.data),
      width: bitmap.width,
      height: bitmap.height,
    });

    if (results && results.length > 0) {
      return { decoded: results[0].decode(), source: 'zbar-wasm' };
    }
  } catch (e) {
    console.error('[barcodeScan] 失败:', e.message);
  }

  return { decoded: null, error: '未识别到条码' };
};
