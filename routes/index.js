const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater'); // Pastikan ini tidak dikomentari jika fitur export Word masih diinginkan
const multer = require('multer');

let pesertaData = [];
let stickerTitle = "PERINGKAT";
let stickerBackground = "bg.png";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/bg'));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (!file.originalname.toLowerCase().endsWith('.png')) {
      return cb(new Error('Only PNG files are allowed'));
    }
    cb(null, true);
  }
});

router.get('/', (req, res) => {
  res.render('index', { peserta: pesertaData, stickerTitle, stickerBackground });
});

router.post('/set-title', (req, res) => {
  const { title } = req.body;
  if (title && title.trim() !== '') {
    stickerTitle = title.trim();
  }
  res.redirect('/');
});

router.post('/set-background', upload.single('backgroundFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No background file uploaded.');
  }
  stickerBackground = req.file.originalname;
  res.redirect('/');
});

router.post('/clear-background', (req, res) => {
  stickerBackground = "";
  res.redirect('/');
});

router.post('/reset-background', (req, res) => {
  stickerBackground = "bg.png";
  res.redirect('/');
});

router.post('/preview', (req, res) => {
  const { nama, lomba, kegiatan, peringkat } = req.body;
  pesertaData = nama.map((_, i) => ({
    nama: nama[i],
    lomba: lomba[i],
    kegiatan: kegiatan[i],
    peringkat: peringkat[i]
  }));
  console.log('Peserta data updated:', pesertaData);
  res.redirect('/');
});

const importExcel = (req, res) => {
  if (!req.file) {
    return res.status(400).send('No Excel file uploaded.');
  }
  const wb = XLSX.readFile(req.file.path);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  pesertaData = data.map(row => ({
    nama: row['Nama Peserta'] || '',
    lomba: row['Jenis Lomba'] || '',
    kegiatan: row['Kegiatan'] || '',
    peringkat: row['Peringkat'] || ''
  }));
  fs.unlink(req.file.path, (err) => { // Gunakan fs.unlink asinkron
    if (err) console.error('Error deleting uploaded Excel file:', err);
  });
  console.log('Peserta data imported from Excel:', pesertaData);
  res.redirect('/');
};

const uploadBackgrounds = (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No background files uploaded.');
  }
  if (req.files.length > 3) {
    return res.status(400).send('Maksimal 3 file yang dapat diunggah.');
  }
  for (const file of req.files) {
    if (!file.originalname.toLowerCase().endsWith('.png')) {
      return res.status(400).send('Hanya file PNG yang diperbolehkan.');
    }
  }
  console.log('Background files uploaded successfully:', req.files.map(f => f.originalname));
  res.redirect('/');
});

// ---- FUNGSI UNTUK DOWNLOAD ZIP LANGSUNG ----
router.get('/download-zip', (req, res) => {
  if (pesertaData.length === 0) {
    return res.status(400).send('Tidak ada data peserta untuk dibuatkan ZIP.');
  }

  const zip = new PizZip();
  const folderName = "stiker-data"; // Nama folder utama di dalam ZIP

  // Tambahkan setiap peserta sebagai file teks sederhana dalam folder di ZIP
  pesertaData.forEach((p, index) => {
    const fileContent = `Nama: ${p.nama}\nLomba: ${p.lomba}\nKegiatan: ${p.kegiatan}\nPeringkat: ${p.peringkat}`;
    zip.file(`${folderName}/peserta_${index + 1}.txt`, fileContent);
  });

  try {
    const zipBuffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="stiker-data.zip"');
    res.send(zipBuffer);
    console.log('ZIP file sent for download.');
  } catch (error) {
    console.error('Error generating ZIP file:', error);
    res.status(500).send('Error generating ZIP file.');
  }
});

// ---- FUNGSI EXPORT WORD (sudah dengan perbaikan error handling) ----
router.post('/export', (req, res) => {
  const templatePath = path.resolve(__dirname, '../template.docx');
  console.log('Attempting to load template from:', templatePath);

  if (!fs.existsSync(templatePath)) {
    console.error('Template file not found at:', templatePath);
    return res.status(500).send('Error: template.docx not found. Please ensure it exists in the root directory of the app.');
  }

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.setData({ peserta: pesertaData });
  console.log('Data sent to docxtemplater:', { peserta: pesertaData });

  try {
    doc.render();
  } catch (err) {
    // Tangani berbagai jenis error docxtemplater secara spesifik jika memungkinkan
    console.error('Error generating Word file:', err);
    // Jika err adalah objek docxtemplater.DocxtemplaterError
    if (err.properties && err.properties.errors && err.properties.errors.length > 0) {
      err.properties.errors.forEach(e => {
        console.error(`Docxtemplater Sub-error: ${e.message} (Part: ${e.properties.part})`);
      });
      return res.status(500).send('Error generating Word file. Check server logs for detailed Docxtemplater errors. Message: ' + err.message);
    }
    // Jika error umum
    const errorString = JSON.stringify(err, Object.getOwnPropertyNames(err));
    console.error('Detailed Error Object:', errorString);
    return res.status(500).send('Error generating Word file. Check server logs for details. Message: ' + err.message);
  }

  const buffer = doc.getZip().generate({ type: 'nodebuffer' });
  const outputFilePath = path.resolve(__dirname, '../output.docx');

  fs.writeFileSync(outputFilePath, buffer);
  console.log('Word file generated successfully at:', outputFilePath);

  res.download(outputFilePath, 'stiker-piala.docx', (err) => {
    if (err) {
      console.error('Error during file download:', err);
      // Kirim status error jika unduhan gagal
      if (!res.headersSent) { // Pastikan header belum dikirim untuk menghindari 'Error: Can't set headers after they are sent to the client'
        res.status(500).send('Error downloading file.');
      }
    }
    // Hapus file setelah berhasil diunduh atau terjadi error unduh
    fs.unlink(outputFilePath, (unlinkErr) => {
      if (unlinkErr) console.error('Error deleting output file:', unlinkErr);
    });
  });
});

router.get('/reset-data', (req, res) => {
  pesertaData = [];
  // Delete all user-uploaded background images except the default bg.png
  const bgDir = path.join(__dirname, '../public/bg');
  fs.readdir(bgDir, (err, files) => {
    if (err) {
      console.error('Error reading background directory:', err);
      return res.status(500).send('Internal Server Error');
    }
    files.forEach(file => {
      if (file !== 'bg.png') {
        const filePath = path.join(bgDir, file);
        fs.unlink(filePath, err => {
          if (err) console.error('Error deleting file:', filePath, err);
        });
      }
    });
  });
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.redirect('/');
});

module.exports = { router, importExcel, uploadBackgrounds };
=======
  }));
  console.log('Peserta data updated:', pesertaData);
  res.redirect('/');
});
