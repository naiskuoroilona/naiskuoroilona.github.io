const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, 'site')));

app.listen(PORT, () => {
  console.log(`Naiskuoro Ilona @ http://localhost:${PORT}`);
});
