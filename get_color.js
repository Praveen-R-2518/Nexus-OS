const sharp = require('sharp');
sharp('public/logo.png')
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    const colors = {};
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      const a = info.channels === 4 ? data[i+3] : 255;
      if (a > 100 && g > r + 20 && g > b + 20) {
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        colors[hex] = (colors[hex] || 0) + 1;
      }
    }
    const sorted = Object.entries(colors).sort((a, b) => b[1] - a[1]);
    console.log(sorted.slice(0, 10));
  });
