const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const routes = require('./routes');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Pastikan direktori uploads ada
const uploadsDir = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadsDir)){
    require('fs').mkdirSync(uploadsDir);
}

const uploadExcel = multer({ dest: uploadsDir + '/' });
const uploadBg = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const bgDir = path.join(__dirname, 'public/bg');
      if (!require('fs').existsSync(bgDir)){
          require('fs').mkdirSync(bgDir);
      }
      cb(null, bgDir);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
  })
});

app.post('/import-excel', uploadExcel.single('excel'), routes.importExcel);
app.post('/upload-backgrounds', uploadBg.array('backgrounds', 3), routes.uploadBackgrounds);
app.use('/', routes.router);

app.listen(3000, () => console.log('Running at http://localhost:3000'));
