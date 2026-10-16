const test = require('node:test');
const assert = require('node:assert/strict');

const { mapCloudinaryFileToAttachment } = require('../src/upload');

test('mapCloudinaryFileToAttachment convierte archivos de Cloudinary a formato interno', () => {
  const file = {
    originalname: 'informe.pdf',
    path: 'https://res.cloudinary.com/demo/raw/upload/sample.pdf',
    mimetype: 'application/pdf',
    public_id: 'agenda_clinica_adjuntos/sample',
    format: 'pdf'
  };

  const attachment = mapCloudinaryFileToAttachment(file);

  assert.equal(attachment.name, 'informe.pdf');
  assert.equal(attachment.url, 'https://res.cloudinary.com/demo/raw/upload/sample.pdf');
  assert.equal(attachment.mimeType, 'application/pdf');
  assert.ok(attachment.id);
});
