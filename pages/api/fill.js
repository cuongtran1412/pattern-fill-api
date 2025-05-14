import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) return res.status(400).send('Missing URLs');

  try {
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // Resize ảnh rập
    const MAX_WIDTH = 2000;
    const rapResized = await sharp(rapRes.data)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .ensureAlpha()
      .toBuffer();

    const metadata = await sharp(rapResized).metadata();

    // Resize tile pattern
    const tileSize = 800;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // Fill pattern background
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

    // ⚠️ Blend rập lên pattern dùng multiply (giữ viền đen, loại nền trắng)
    const final = await sharp(patternFilled)
      .composite([
        {
          input: rapResized,
          blend: 'multiply'
        }
      ])
      .png()
      .toBuffer();

    res.status(200).json({
      image_base64: final.toString('base64')
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send('Processing error');
  }
}
