import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const express=require('express');
const {hashPassword,verifyPassword,makeAdminRouter}=require('../admin-auth.cjs');

test('admin password is verified from a salted hash',()=>{
  const encoded=hashPassword('secret-password-123');
  assert.ok(encoded.startsWith('scrypt$'));
  assert.equal(verifyPassword('secret-password-123',encoded),true);
  assert.equal(verifyPassword('wrong-password',encoded),false);
  assert.equal(verifyPassword('secret-password-123','invalid'),false);
});

test('admin session requires login and logout revokes it',async()=>{
  const app=express();app.use(express.json());
  app.use('/api/admin',makeAdminRouter({email:'admin@example.test',passwordHash:hashPassword('secret-password-123')}));
  const server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
  const url=`http://127.0.0.1:${server.address().port}/api/admin`;
  try{
    const before=await fetch(`${url}/session`);assert.equal(before.status,401);
    const wrong=await fetch(`${url}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:'wrong'})});
    assert.equal(wrong.status,401);
    const login=await fetch(`${url}/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:'secret-password-123'})});
    assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'),/HttpOnly/);
    assert.equal((await fetch(`${url}/session`,{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(`${url}/logout`,{method:'POST',headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(`${url}/session`,{headers:{Cookie:cookie}})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
