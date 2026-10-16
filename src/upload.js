const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const uploadsDir = path.resolve(process.env.HOSPI_UPLOADS_DIR || path.join(__dirname, '..', 'uploads'));
fs.mkdirSync(uploadsDir, { recursive: true });

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET &&
  !process.env.CLOUDINARY_CLOUD_NAME.includes('your_cloud_name') &&
  !process.env.CLOUDINARY_API_KEY.includes('your_cloudinary') &&
  !process.env.CLOUDINARY_API_SECRET.includes('your_cloudinary')
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

function mapCloudinaryFileToAttachment(file = {}) {
  const name = file.originalname || file.original_name || 'adjunto';
  const rawUrl = file.path || file.secure_url || file.url || '';
  const finalUrl = rawUrl && rawUrl.startsWith('http')
    ? rawUrl
    : rawUrl && file.filename
      ? `/uploads/${file.filename}`
      : rawUrl;
  const mimeType = file.mimetype || file.type || 'application/octet-stream';
  const id = file.public_id || `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  return {
    id,
    name,
    path: file.filename || file.public_id || finalUrl,
    mimeType,
    url: finalUrl
  };
}

const cloudinaryStorage = hasCloudinaryConfig
  ? new CloudinaryStorage({
      cloudinary,
      params: async (req, file) => {
        const fileName = file.originalname || 'archivo';
        const lowerName = fileName.toLowerCase();
        const isDocument = ['.pdf', '.doc', '.docx'].some((extension) => lowerName.endsWith(extension));
        const baseName = fileName
          .replace(/\.[^/.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .toLowerCase()
          .slice(0, 80) || 'archivo';

        return {
          folder: 'agenda_clinica_adjuntos',
          public_id: `${Date.now()}-${baseName}`,
          allowed_formats: isDocument ? ['pdf', 'doc', 'docx'] : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
          resource_type: isDocument ? 'raw' : 'image'
        };
      }
    })
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => {
        const safeName = String(file.originalname || 'archivo').replace(/\s+/g, '_');
        cb(null, `${Date.now()}-${randomUUID()}-${safeName}`);
      }
    });

const upload = multer({
  storage: cloudinaryStorage,
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

module.exports = {
  upload,
  cloudinary,
  mapCloudinaryFileToAttachment
};
