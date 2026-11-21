const fs=require('fs');let h=fs.readFileSync('index.src.html','utf8');
h=h.replace('/*ENGINE*/',()=>fs.readFileSync('engine.js','utf8')).replace('/*BANK*/',()=>fs.readFileSync('bank.js','utf8'));
const st=new Date().toLocaleString('sv-SE',{timeZone:'Europe/Amsterdam'}).slice(0,16).replace(/[-: ]/g,(c)=>c===' '?'-':c===':'?'':'.');h=h.split('__BUILD__').join(st);
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync(process.argv[2]||'dist/index.html',h);console.log('built',h.length);
