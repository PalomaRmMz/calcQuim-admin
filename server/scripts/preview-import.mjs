import { readFile } from 'node:fs/promises';
import { previewOriginal } from '../src/services/importPreview.mjs';
try {
  if(process.argv.length!==3)throw new Error();
  const {report}=previewOriginal(await readFile(process.argv[2],'utf8'));
  console.log(JSON.stringify(report,null,2));
  if(!report.canTransfer)process.exitCode=1;
} catch {console.error('No se pudo prevalidar el archivo indicado; no se modificó ningún origen o destino.');process.exitCode=1;}
