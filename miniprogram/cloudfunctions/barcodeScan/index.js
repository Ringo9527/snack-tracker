// 云函数：从图片中识别条形码
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const jimp = require('jimp');
const FormData = require('form-data');
const axios = require('axios');
const cheerio = require('cheerio');

exports.main = async (event) => {
  const { fileID } = event;
  if (!fileID) return { decoded: null, error: '缺少fileID' };

  try {
    // 1. 从云存储下载图片
    const res = await cloud.downloadFile({ fileList: [fileID] });
    const buffer = res.fileList[0].content;

    // 2. 用 jimp 预处理：转灰度 + 增强对比度
    const image = await jimp.read(buffer);
    image.grayscale().contrast(0.6).resize(1024, jimp.AUTO);
    const processed = await image.getBufferAsync(jimp.MIME_JPEG);

    // 3. 调用 ZXing 在线解码器
    const form = new FormData();
    form.append('file', processed, {
      filename: 'scan.jpg',
      contentType: 'image/jpeg',
    });
    form.append('full', 'true');

    const response = await axios.post('https://zxing.org/w/decode', form, {
      headers: form.getHeaders(),
      timeout: 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    // 4. 解析 HTML 结果
    const $ = cheerio.load(response.data);
    let decoded = null;

    // ZXing 结果在 <pre> 标签里
    $('pre').each((i, el) => {
      const text = $(el).text().trim();
      // 格式: "Raw text: 6921168509256"
      const match = text.match(/Raw text:\s*(\d+)/);
      if (match) decoded = match[1];
    });

    if (decoded) {
      return { decoded, source: 'zxing' };
    }

    // 5. ZXing 没识别到，尝试 UPCitemdb 图片API
    // (留作备用)

    return { decoded: null, error: '未识别到条码' };
  } catch (e) {
    console.error('[barcodeScan] 错误:', e);
    return { decoded: null, error: e.message || '未知错误' };
  }
};
