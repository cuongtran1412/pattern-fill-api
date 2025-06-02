import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) return res.status(400).send('Missing URLs');

  try {
    // 1. Tải ảnh pattern + rập
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // 2. Đọc ảnh rập GỐC (không resize)
    const rapBuffer = await sharp(rapRes.data).ensureAlpha().toBuffer();
    const rapMeta = await sharp(rapBuffer).metadata();
    const { width, height, density } = rapMeta;

    // 3. Resize pattern thành tile nhỏ hơn
    const tileSize = 1024;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // 4. Tính offset để fill từ center (giữa mảnh)
    const offsetX = Math.floor(width / 2 - tileSize / 2);
    const offsetY = Math.floor(height / 2 - tileSize / 2);

    const compositeArray = [];
    for (let y = -tileSize * 2; y < height + tileSize * 2; y += tileSize) {
      for (let x = -tileSize * 2; x < width + tileSize * 2; x += tileSize) {
        compositeArray.push({
          input: patternTile,
          top: y + offsetY,
          left: x + offsetX
        });
      }
    }

    // 5. Tạo nền trắng rồi fill pattern
    const patternFilled = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite(compositeArray)
      .png()
      .toBuffer();

    // 6. Tạo MASK từ rập
    const rapGray = await sharp(rapBuffer).removeAlpha().greyscale().toBuffer();

    const masked = await sharp(patternFilled)
      .composite([{ input: rapGray, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // 7. Overlay đường viền rập (blend multiply)
    const final = await sharp(masked)
      .composite([{ input: rapBuffer, blend: 'multiply' }])
      .withMetadata({ density: density || 300 }) // giữ DPI gốc nếu có
      .png()
      .toBuffer();

    // 8. Trả về base64
    res.status(200).json({
      image_base64: final.toString('base64')
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).send('Processing error');
  }
}
