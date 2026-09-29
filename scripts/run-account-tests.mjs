import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vinext/dist/cli.js','dev','--port','5184'],{stdio:['ignore','pipe','pipe']});let output='';
server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
try{
 let ready=false;for(let i=0;i<60;i++){if(server.exitCode!==null)throw new Error('Test server stopped.');try{const response=await fetch('http://localhost:5184/api/account');if(response.status===401){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw new Error('Test server did not become ready.');
 for(const script of ['scripts/test-accounts.mjs','scripts/test-workspace.mjs']){const test=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,TEST_BASE_URL:'http://localhost:5184'}});const code=await new Promise(resolve=>test.on('exit',resolve));if(code!==0)throw new Error(`${script} failed.`);}
}catch(e){console.error(e.message,output);process.exitCode=1;}finally{server.kill('SIGTERM');}
