import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { describeSheet, recordsFromGrid, parseRecords, deserializeProject, serializeProject } from '../src/core/parser';
import { buildSvg } from '../src/core/export';
import type { Cell } from '../src/core/types';
const started=performance.now();
const bytes=await readFile(process.argv[2] || 'work/实际BOM.xls');
const wb=XLSX.read(bytes,{type:'buffer',dense:true});
const grid=XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,blankrows:true,range:0});
const info=describeSheet(wb.SheetNames[0],grid);
const p=parseRecords(recordsFromGrid(grid,info.headerRow,info.mapping),{id:'real-check',fileName:'实际BOM.xls',sheetName:info.name,importedAt:'2026-10-24T00:00:00Z'});
assert.equal(p.stats.products,3134);assert.equal(p.stats.records,46763);assert.equal(p.stats.maxDepth,6);assert.equal(p.stats.materials,3614);assert.equal(p.stats.missingQty,80);assert.equal(p.stats.rejected,0);
assert.equal(p.nodes['real-check:r:6'].parentId,'real-check:r:2');
assert.equal(p.nodes['real-check:r:7'].parentId,p.products[0].id);
assert.notEqual(p.nodes['real-check:r:4'].parentId,p.nodes['real-check:r:9'].parentId);
assert.equal(p.nodes['real-check:r:21'].quantity,null);
let checked=0;
for(const product of p.products){
  const rows=Object.values(p.nodes).filter(n=>n.productId===product.id&&n.level>0);
  for(let i=0;i<rows.length;i++){
    const r=rows[i]; const expected=rows.slice(0,i).reverse().find(n=>n.level<r.level)?.id||product.id;
    assert.equal(r.parentId,expected);checked++;
  }
}
const restored=deserializeProject(serializeProject(p));assert.deepEqual(restored.stats,p.stats);
for(const id of Object.keys(p.nodes))assert.deepEqual(restored.nodes[id],p.nodes[id]);
const largest=p.products.reduce((a,b)=>a.count>b.count?a:b);assert.equal(largest.count,149);
await mkdir('work/qa',{recursive:true});
const image=buildSvg(p,largest.id,new Set(),true);await writeFile('work/qa/largest-product.svg',image.svg);
const report={stats:p.stats,verifiedParentRelations:checked,roundTrip:'passed',elapsedMs:Math.round(performance.now()-started),largest:{code:largest.code,records:largest.count,exportWidth:image.width,exportHeight:image.height},workbookSheets:wb.SheetNames};
await writeFile('work/qa/real-data-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
