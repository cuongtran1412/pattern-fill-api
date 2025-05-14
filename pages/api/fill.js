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
    // Tải ảnh pattern và rập
    const [patternRes, rapRes] = await Promise.all([
      axios.get(pattern_url, { responseType: 'arraybuffer' }),
      axios.get(rap_url, { responseType: 'arraybuffer' })
    ]);

    // Lấy metadata từ ảnh rập
    const rapImage = sharp(rapRes.data).ensureAlpha();
    const metadata = await rapImage.metadata();

    // Resize pattern thành tile nhỏ 200x200
    const patternTile = await sharp(patternRes.data)
      .resize(200, 200)
      .ensureAlpha()
      .toBuffer();

    // Tạo nền trắng để lát pattern
    const base = sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    });

    // Lặp tile để phủ kín ảnh rập
    const compositeArray = [];
    for (let y = 0; y < metadata.height; y += 200) {
      for (let x = 0; x < metadata.width; x += 200) {
        compositeArray.push({ input: patternTile, top: y, left: x });
      }
    }

    // Lát pattern
    const patternFilled = await base
      .composite(compositeArray)
      .png()
      .toBuffer();

    // ⚠️ FIX lỗi VipsImage: file has been truncated bằng cách convert buffer ảnh rập trước
    const rapBuffer = await sharp(rapRes.data)
      .ensureAlpha()
      .toBuffer();

    // Overlay ảnh rập lên pattern
    const output = await sharp(patternFilled)
      .composite([{ input: rapBuffer, blend: 'over' }])
      .png()
      .toBuffer();

    // Trả về base64
    res.status(200).json({
      image_base64: output.toString('base64')
    });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).send('Processing error');
  }
}
