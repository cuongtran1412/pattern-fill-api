import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) return res.status(400).send('Missing URLs');

  try {
    // Tải ảnh
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    const rapSharp = sharp(rapRes.data);
    const metadata = await rapSharp.metadata();

    const patternTile = await sharp(patternRes.data)
      .resize(200, 200)
      .toBuffer();

    // Tạo nền trắng để ghép tile vào
    const base = sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    });

    // Lặp tile để fill hết vùng rập
    const compositeArray = [];
    for (let y = 0; y < metadata.height; y += 200) {
      for (let x = 0; x < metadata.width; x += 200) {
        compositeArray.push({ input: patternTile, top: y, left: x });
      }
    }

    const filledPatternBuffer = await base
      .composite(compositeArray)
      .png()
      .toBuffer();

    // Overlay rập lên trên
    const output = await sharp(filledPatternBuffer)
      .composite([{ input: rapRes.data, blend: 'over' }])
      .png()
      .toBuffer();

    res.status(200).json({
      image_base64: output.toString('base64')
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Processing error');
  }
}
