import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, mask_url, outline_url } = req.body;
  if (!pattern_url || !mask_url) {
    return res.status(400).send('Missing pattern_url or mask_url');
  }

  try {
    const [patternRes, maskRes, outlineRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(mask_url, { responseType: 'arraybuffer' }),
      outline_url
        ? axios.get(outline_url, { responseType: 'arraybuffer' })
        : Promise.resolve(null)
    ]);

    // Lấy metadata từ mask
    const maskImage = await sharp(maskRes.data).ensureAlpha();
    const metadata = await maskImage.metadata();

    // Tạo pattern tiled theo kích thước mask
    const tileSize = 400;
    const patternTile = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

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

    // Áp mask trắng-đen
    const masked = await sharp(patternFilled)
      .composite([
        { input: maskRes.data, blend: 'dest-in' }
      ])
      .png()
      .toBuffer();

    let final = masked;

    // Nếu có outline → overlay thêm viền rập
    if (outlineRes) {
      final = await sharp(masked)
        .composite([
          { input: outlineRes.data, blend: 'multiply' }
        ])
        .png()
        .toBuffer();
    }

    res.status(200).json({
      image_base64: final.toString('base64')
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).send('Processing error');
  }
}
