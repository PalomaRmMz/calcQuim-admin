import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
let server,closing=false;
async function close(){if(closing)return;closing=true;await server?.close();if(process.connected)process.disconnect();}
process.on('message',message=>{if(message==='stop')close().catch(()=>{process.exitCode=1;});});
process.on('disconnect',()=>close());
process.on('SIGTERM',()=>close());
process.on('SIGINT',()=>close());
try{
    server=await createServer({root,configFile:fileURLToPath(new URL('../vite.config.js',import.meta.url)),logLevel:'silent'});
    await server.listen();
    process.send?.({ready:true});
}catch{
    process.send?.({ready:false});await close();process.exitCode=1;
}
