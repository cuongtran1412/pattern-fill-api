import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) {
    return res.status(400).send('Missing pattern_url or rap_url');
  }

  try {
    // Tải ảnh
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // Resize ảnh rập trước để tránh tràn RAM
    const MAX_WIDTH = 2000;
    const rapBuffer = await sharp(rapRes.data)
      .ensureAlpha()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .toBuffer();

    const metadata = await sharp(rapBuffer).metadata();

    // Resize pattern tile
    const tileSize = 400;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // Tạo nền pattern bằng cách lặp tile
    const base = sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    });

    const compositeArray = [];
    for (let y = 0; y < metadata.height; y += tileSize) {
      for (let x = 0; x < metadata.width; x += tileSize) {
        compositeArray.push({ input: patternTile, top: y, left: x });
      }
    }

    const patternFilled = await base
      .composite(compositeArray)
      .png()
      .toBuffer();

    // ⚠️ Convert ảnh rập thành mask alpha (trắng → trong suốt, đen → giữ lại)
    const rapMask = await sharp(rapBuffer)
      .ensureAlpha()
      .removeAlpha()
      .threshold(200) // biến nền trắng thành trắng tuyệt đối
      .toColourspace('b-w')
      .toBuffer();

    // Áp mask để chỉ giữ phần pattern nằm trong vùng rập
    const masked = await sharp(patternFilled)
      .ensureAlpha()
      .composite([
        {
          input: rapMask,
          blend: 'dest-in' // chỉ giữ vùng giao với mask
        }
      ])
      .png()
      .toBuffer();

    // Trả về ảnh kết quả
    res.status(200).json({
      image_base64: masked.toString('base64')
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send('Processing error');
  }
}
