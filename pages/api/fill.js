import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) {
    return res.status(400).send('Missing pattern_url or rap_url');
  }

  try {
    // Tải pattern và rập (mask)
    const [patternRes, maskRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // Lấy kích thước từ ảnh rập
    const maskImage = await sharp(maskRes.data).ensureAlpha();
    const metadata = await maskImage.metadata();

    // Resize pattern tile
    const tileSize = 400;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // Lặp pattern thành nền đầy đủ
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

    // Áp mask (ảnh rập đen nền, trắng áo) lên pattern
    const masked = await sharp(patternFilled)
      .composite([
        { input: maskRes.data, blend: 'dest-in' }
      ])
      .png()
      .toBuffer();

    res.status(200).json({
      image_base64: masked.toString('base64')
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send('Server error');
  }
}
