// js/features/subj-pdf.js — turn phone photos (and/or a PDF) into ONE PDF
// the backend will accept. Used by both the QOTD upload and the exam upload.

const PDFLIB_URL = 'vendor/pdf-lib/pdf-lib.min.js';
let _pdfLibPromise = null;

function _loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (_pdfLibPromise) return _pdfLibPromise;
  _pdfLibPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = PDFLIB_URL;
    s.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('The PDF tools did not load.'));
    s.onerror = () => { _pdfLibPromise = null; rej(new Error('Could not load the PDF tools. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return _pdfLibPromise;
}

function _readAsDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

function _imageToJpeg(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const sc = Math.min(1, maxSide / Math.max(w, h));
      w = Math.round(w * sc);
      h = Math.round(h * sc);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
      cx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      c.toBlob(b => b
        ? b.arrayBuffer().then(buf => resolve({ bytes: new Uint8Array(buf), w, h }))
        : reject(new Error('Could not process one of the photos.')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One of the photos could not be opened. Use JPG or PNG.')); };
    img.src = url;
  });
}

async function _prepareUpload(files) {
  const isPdf = f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
  const isImg = f => /^image\//i.test(f.type || '');
  if (files.length === 1 && isPdf(files[0])) {
    const f = files[0];
    if (f.size > MAX_PDF_BYTES) {
      throw new Error('PDF too large. Max ' + Math.round(MAX_PDF_BYTES / 1024 / 1024) + ' MB.');
    }
    return { dataUrl: await _readAsDataUrl(f), filename: f.name, size: f.size };
  }
  if (!files.every(isImg)) throw new Error('Choose one PDF, or one or more photos of your pages.');
  if (files.length > 20) throw new Error('Up to 20 photos at a time.');
  const lib = await _loadPdfLib();
  const doc = await lib.PDFDocument.create();
  for (const f of files) {
    const j = await _imageToJpeg(f, 1800, 0.78);
    const emb = await doc.embedJpg(j.bytes);
    const page = doc.addPage([j.w, j.h]);
    page.drawImage(emb, { x: 0, y: 0, width: j.w, height: j.h });
  }
  const out = await doc.save();
  if (out.length > MAX_PDF_BYTES) throw new Error('Those photos are too large together. Take fewer, or lower-resolution photos.');
  let bin = '';
  for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return { dataUrl: 'data:application/pdf;base64,' + btoa(bin), filename: 'answer-' + Date.now() + '.pdf', size: out.length };
}