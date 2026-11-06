const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { db } = require('../database/schema');

// GET /api/qr/generate
router.get('/generate', async (req, res) => {
  try {
    const config = await db('system_config').where({ key: 'qr_base_url' }).first();
    const baseUrl = config ? config.value : 'http://localhost:5173';
    const url = `${baseUrl}/visitor`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      quality: 0.95,
      margin: 2,
      color: { dark: '#1a365d', light: '#ffffff' },
      width: 400,
    });

    res.json({ success: true, qrCode: qrDataUrl, url });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate QR code', error: err.message });
  }
});

// GET /api/qr/image
router.get('/image', async (req, res) => {
  try {
    const config = await db('system_config').where({ key: 'qr_base_url' }).first();
    const baseUrl = config ? config.value : 'http://localhost:5173';
    const url = `${baseUrl}/visitor`;

    // Log every QR scan to the database
    await db('qr_scans').insert({
      ip_address: req.ip || req.connection?.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null,
      scanned_at: new Date().toISOString(),
    });

    const buffer = await QRCode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      width: 400,
      margin: 2,
      color: { dark: '#1a365d', light: '#ffffff' },
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store'); // don't cache — we want each scan logged
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate QR image' });
  }
});

module.exports = router;
