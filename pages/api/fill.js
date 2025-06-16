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

    // 2. Đọc ảnh rập gốc
    const rapBuffer = await sharp(rapRes.data).ensureAlpha().toBuffer();
    const rapMeta = await sharp(rapBuffer).metadata();
    const { width, height, density } = rapMeta;

    // 3. Tính tileSize theo mockup gốc 1024x1536
    const mockupWidth = 1024;
    const mockupHeight = 1536;
    const tileSizeW = Math.round(width / (mockupWidth / 1024));
    const tileSizeH = Math.round(height / (mockupHeight / 1536));
    const tileSize = Math.round((tileSizeW + tileSizeH) / 2);

    // 4. Resize pattern thành tile
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // 5. Fill pattern từ center
    const offsetX = Math.floor(width / 2 - tileSize / 2);
    const offsetY = Math.floor(height / 2 - tileSize / 2);

    const compositeArray = [];
    for (let y = -tileSize * 2; y < height + tileSize * 2; y += tileSize) {
      for (let x = -tileSize * 2; x < width + tileSize * 2; x += tileSize) {
        compositeArray.push({
          input: patternTile,
          top: y + offsetY,
          left: x + offsetX,
        });
      }
    }

    // 6. Fill nền trắng
    const patternFilled = await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      }
    })
      .composite(compositeArray)
      .png()
      .toBuffer();

    // 7. Tạo mask alpha từ rập
    const rapAlpha = await sharp(rapBuffer)
      .extractChannel('alpha')
      .toColourspace('b-w')
      .toBuffer();

    const masked = await sharp(patternFilled)
      .composite([{ input: rapAlpha, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // 8. Resize rapBuffer để overlay lại viền chuẩn
    const rapResized = await sharp(rapBuffer)
      .resize(width, height, { fit: 'fill' }) // ép kích thước tuyệt đối
      .removeAlpha()
      .ensureAlpha()
      .toBuffer();

    const final = await sharp(masked)
      .composite([{ input: rapResized, blend: 'multiply' }])
      .withMetadata({ density: density || 300 })
      .png()
      .toBuffer();

    // 9. Trả về kết quả
    res.status(200).json({
      image_base64: final.toString('base64'),
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).send('Processing error');
  }
}
