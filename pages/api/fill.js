import sharp from 'sharp';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { pattern_url, rap_url } = req.body;
  if (!pattern_url || !rap_url) return res.status(400).send('Missing URLs');

  try {
    // 1. Load pattern và rập
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    const rapBuffer = await sharp(rapRes.data).ensureAlpha().toBuffer();
    const rapMeta = await sharp(rapBuffer).metadata();
    const { width, height, density } = rapMeta;

    // 2. Tăng tileSize để pattern to ra
    let tileSize = 1024;
    if (width < 600 || height < 600) tileSize = 800;
    if (width < 400 || height < 400) tileSize = 600;
    tileSize = tileSize * 2;

    const patternTileFull = await sharp(patternRes.data)
      .resize(tileSize, tileSize)
      .ensureAlpha()
      .toBuffer();

    // 3. Fill pattern theo tile có cắt nếu tràn viền
    const compositeArray = [];

    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        // Tính phần còn lại nếu tile bị tràn ra ngoài
        const remainingWidth = Math.min(tileSize, width - x);
        const remainingHeight = Math.min(tileSize, height - y);

        // Cắt tile vừa vặn nếu cần
        const tileCropped = await sharp(patternTileFull)
          .extract({ left: 0, top: 0, width: remainingWidth, height: remainingHeight })
          .toBuffer();

        compositeArray.push({
          input: tileCropped,
          top: y,
          left: x,
        });
      }
    }

    // 4. Tạo nền trắng và fill pattern
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

    // 5. Mask theo hình rập
    const rapAlpha = await sharp(rapBuffer)
      .extractChannel('alpha')
      .toColourspace('b-w')
      .toBuffer();

    const masked = await sharp(patternFilled)
      .composite([{ input: rapAlpha, blend: 'dest-in' }])
      .png()
      .toBuffer();

    // 6. Overlay outline rập
    const final = await sharp(masked)
      .composite([{ input: rapBuffer, blend: 'multiply' }])
      .withMetadata({ density: density || 300 })
      .png()
      .toBuffer();

    res.status(200).json({
      image_base64: final.toString('base64'),
    });

  } catch (err) {
    console.error('❌ ERROR:', err);
    res.status(500).send('Processing error');
  }
}
