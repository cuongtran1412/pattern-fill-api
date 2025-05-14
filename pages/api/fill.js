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

    // Resize ảnh rập để không bị quá tải
    const MAX_WIDTH = 2000;
    const rapBuffer = await sharp(rapRes.data)
      .ensureAlpha()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .toBuffer();

    const metadata = await sharp(rapBuffer).metadata();

    // Resize tile pattern
    const tileSize = 400;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // Tạo nền pattern
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

    // ⚠️ Convert ảnh rập thành ảnh line art trong suốt (đen giữ lại, trắng loại)
    const rapLineArt = await sharp(rapBuffer)
      .removeAlpha()
      .threshold(180)            // giữ line
      .toColourspace('b-w')
      .toBuffer();

    const rapAlpha = await sharp(rapLineArt)
      .ensureAlpha()
      .png()
      .toBuffer();

    // ✅ Overlay line art lên pattern
    const finalOutput = await sharp(patternFilled)
      .composite([{ input: rapAlpha, blend: 'over' }])
      .png()
      .toBuffer();

    res.status(200).json({
      image_base64: finalOutput.toString('base64')
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send('Processing error');
  }
}
