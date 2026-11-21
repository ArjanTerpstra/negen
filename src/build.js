const fs=require('fs');let h=fs.readFileSync('index.src.html','utf8');
h=h.replace('/*ENGINE*/',()=>fs.readFileSync('engine.js','utf8')).replace('/*BANK*/',()=>fs.readFileSync('bank.js','utf8'));
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync(process.argv[2]||'dist/index.html',h);console.log('built',h.length);
