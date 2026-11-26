import {preview} from 'vite';

export function startPreparedFrontend(root,apiPort,port=5173) {
  if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw new Error('Puerto API inválido.');
  return preview({root,configFile:false,logLevel:'silent',preview:{
    host:'127.0.0.1',port,strictPort:true,
    proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}},
  }});
}
