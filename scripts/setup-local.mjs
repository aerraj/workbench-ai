import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
if(!existsSync('.dev.vars'))writeFileSync('.dev.vars',`VAULT_MASTER_KEY=${randomBytes(32).toString('base64')}\n`,{mode:0o600});
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','workbench-accounts','--local','--config','wrangler.db.json'],{stdio:'inherit'});
process.exit(result.status??1);
