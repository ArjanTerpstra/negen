const E = require('./engine.js');
const N = +process.argv[2] || 200;
const seed = +process.argv[3] || 1;
const rnd = E.mulberry32(seed);
const buckets = {easy:[],medium:[],hard:[],expert:[],master:[]};
const t0=Date.now();
for (let n=0;n<N;n++){
  const want = n%5===0 ? 'easy' : n%5===1 ? 'medium' : null;
  const min = want==='easy'? 36 : want==='medium'? 28 : 17;
  const {puzzle,solution,givens} = E.generate(rnd,{minGivens:min});
  const g = E.grade(puzzle);
  let b;
  if (g.maxLevel===0 && givens>=36) b='easy';
  else if (g.maxLevel<=1 && givens>=26 && givens<36) b='medium';
  else if (g.maxLevel<=1) b= givens>=36?'easy':'medium';
  else if (g.maxLevel===2) b='hard';
  else if (g.maxLevel===3) b='expert';
  else b='master';
  buckets[b].push({p:puzzle.join(''),s:solution.join(''),g:givens,h:g.hardest,sc:g.score});
}
console.error('time',Date.now()-t0, Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length])));
require('fs').writeFileSync(`bank_${seed}.json`,JSON.stringify(buckets));
