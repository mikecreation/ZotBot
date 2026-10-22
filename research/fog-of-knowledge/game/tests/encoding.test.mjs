// Fails if any game source contains UTF-8 mojibake (UTF-8 bytes decoded as cp1252 and re-saved), e.g. the
// sequences U+00C3, U+00C2 or U+00E2 U+20AC that garbled the HUD clock, era, hotbar and tooltip labels.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),"..");
const bad=/\u00c3|\u00c2|\u00e2\u20ac|\ufffd/;let fails=0,n=0;
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(/^(node_modules|vendor|assets)$/.test(e.name)?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
for(const f of walk(dir).filter(f=>/\.(js|mjs|html|css)$/.test(f))){n++;const lines=fs.readFileSync(f,"utf8").split("\n");
  lines.forEach((l,i)=>{if(bad.test(l)){fails++;if(fails<20)console.log(`FAIL mojibake ${path.relative(dir,f)}:${i+1}: ${l.trim().slice(0,90)}`)}})}
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
if(!/<meta\s+charset=["']?utf-8/i.test(html)){fails++;console.log("FAIL index.html lacks <meta charset=utf-8>")}
console.log(`encoding: ${n} files scanned, ${fails} failures`);if(fails)process.exit(1);
