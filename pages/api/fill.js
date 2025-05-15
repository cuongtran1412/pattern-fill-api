import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) return res.status(400).send('Missing URLs');

  try {
    // 1. Tải ảnh rập & pattern
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // 2. GIỮ NGUYÊN kích thước rập gốc (KHÔNG resize)
    const rapBuffer = await sharp(rapRes.data)
      .ensureAlpha()
      .toBuffer();

    const metadata = await sharp(rapBuffer).metadata();
    const { width, height } = metadata;

    // 3. Resize pattern thành tile 400x400 (tùy chỉnh được)
    const tileSize = 400;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // 4. Tạo nền trắng, fill pattern bằng lặp tile
    const base = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    });

    const compositeArray = [];
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        compositeArray.push({ input: patternTile, top: y, left: x });
      }
    }

    const patternFilled = await base
      .composite(compositeArray)
      .png()
      .toBuffer();

    // 5. Tạo MASK: giữ vùng bên trong rập (màu trắng), loại vùng ngoài (đen)
    const rapGray = await sharp(rapBuffer)
      .removeAlpha()
      .greyscale()
      .toBuffer();

    const masked = await sharp(patternFilled)
      .composite([
        {
          input: rapGray,
          blend: 'dest-in'
        }
      ])
      .png()
      .toBuffer();

    // 6. Overlay lại viền rập (line art đen) lên trên
    const final = await sharp(masked)
      .composite([{ input: rapBuffer, blend: 'multiply' }])
      .png()
      .toBuffer();

    // 7. Trả về base64
    res.status(200).json({
      image_base64: final.toString('base64')
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).send('Processing error');
  }
}
