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

    const rapImg = sharp(rapRes.data);
    const metadata = await rapImg.metadata();

    // Resize pattern khớp với kích thước ảnh rập
    const patternBuffer = await sharp(patternRes.data)
      .resize(metadata.width, metadata.height, { fit: 'repeat' })
      .toBuffer();

    // Blend pattern và ảnh rập bằng overlay
    const output = await sharp(patternBuffer)
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
