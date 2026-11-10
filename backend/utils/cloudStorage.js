/**
 * Permanent file storage on Cloudinary (free plan: videos up to 100 MB, PDFs up to 10 MB).
 *
 * Why: Render's free plan wipes its disk whenever the server sleeps or redeploys,
 * so uploaded videos/PDFs vanish. Files stored in Cloudinary stay forever.
 *
 * Turn it on by setting EITHER
 *   CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
 * OR the three variables
 *   CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 * If none are set, the app keeps saving files on the server disk (as before).
 *
 * No extra npm package is needed — this talks to Cloudinary's REST API with fetch.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FOLDER = 'hse-induction';

function getConfig() {
  const url = (process.env.CLOUDINARY_URL || '').trim();
  if (url) {
    const m = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
    if (m) return { apiKey: m[1], apiSecret: m[2], cloudName: m[3] };
  }
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env;
  if (cloudName && apiKey && apiSecret) {
    return { cloudName: cloudName.trim(), apiKey: apiKey.trim(), apiSecret: apiSecret.trim() };
  }
  return null;
}

const isEnabled = () => !!getConfig();

/** Cloudinary signature: sha1 of the sorted "k=v&k=v" string with the secret appended. */
function sign(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

async function fileToBlob(filePath) {
  if (typeof fs.openAsBlob === 'function') return fs.openAsBlob(filePath); // streams from disk (Node 20+)
  return new Blob([await fs.promises.readFile(filePath)]);
}

/**
 * Upload a local file. resourceType: 'video' for videos, 'raw' for PDFs.
 * Returns { url, publicId, resourceType, bytes }.
 */
async function uploadFile({ filePath, resourceType, fileName }) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Cloud storage is not configured');

  const unique = `induction-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  // Raw files (PDF) keep their extension in the public id so the URL ends in .pdf
  const publicId = resourceType === 'raw' ? `${unique}${path.extname(fileName || '.pdf') || '.pdf'}` : unique;
  const timestamp = Math.floor(Date.now() / 1000);

  const signed = { folder: FOLDER, public_id: publicId, timestamp };
  const form = new FormData();
  form.append('file', await fileToBlob(filePath), fileName || publicId);
  form.append('api_key', cfg.apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', FOLDER);
  form.append('public_id', publicId);
  form.append('signature', sign(signed, cfg.apiSecret));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType}/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Cloudinary upload failed (HTTP ${res.status})`);

  return { url: data.secure_url, publicId: data.public_id, resourceType, bytes: data.bytes };
}

/** Delete a file from Cloudinary. Never throws (best effort). */
async function deleteFile(publicId, resourceType) {
  try {
    const cfg = getConfig();
    if (!cfg || !publicId) return false;
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: cfg.apiKey,
      signature: sign({ public_id: publicId, timestamp }, cfg.apiSecret),
    });
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/${resourceType || 'raw'}/destroy`, {
      method: 'POST', body, signal: AbortSignal.timeout(30000),
    });
    return res.ok;
  } catch (err) {
    console.warn('Cloud delete failed:', err.message);
    return false;
  }
}

module.exports = { isEnabled, uploadFile, deleteFile, sign };
