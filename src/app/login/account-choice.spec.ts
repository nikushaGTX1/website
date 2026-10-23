import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { Login } from './login';
import { AuthService } from '../services/auth.service';

function setup(returnUrl: string | null = null) {
  const sent: unknown[] = [];
  const destinations: unknown[] = [];
  const auth = { isClient: false, isOwner: true, register: (body: unknown) => { sent.push(body); return of({emailSent:true}); },
    verifyEmail: () => of({}), login: () => of({}) };
  const router = { navigate: (...args: unknown[]) => { destinations.push(args); }, navigateByUrl: (url: string) => { destinations.push(url); } };
  const route = { snapshot: { data: {register:true}, queryParamMap: {get: (key: string) => key === 'returnUrl' ? returnUrl : null} } };
  const page = new Login(auth as any, router as any, route as any, {hasPendingSearch:()=>false} as any);
  return {page,sent,destinations,auth};
}

test('owner entry defaults to owner, explicit buttons change the selected experience without losing answers', () => {
  const {page} = setup('/upload-apartment');
  assert.equal(page.accountType,'Owner');
  page.registerData.fullName='Test';
  page.selectAccount('Client');
  assert.equal(page.accountType,'Client');
  assert.equal(page.isOwnerFlow,false);
  assert.equal(page.registerData.fullName,'Test');
});

test('registration sends the selected account type and new owners continue to their listing form', () => {
  const {page,sent,destinations} = setup();
  page.selectAccount('Owner');
  page.registerData = {fullName:'Owner',email:'owner@example.invalid',phoneNumber:'',password:'Test123!',confirmPassword:'Test123!'};
  page.register();
  assert.equal((sent[0] as any).accountType,'Owner');
  page.submitVerify('123456');
  assert.equal(destinations.at(-1),'/upload-apartment');
});

test('client registration retains the client destination', () => {
  const {page,auth,destinations} = setup();
  auth.isOwner=false; auth.isClient=true;
  page.registerData = {fullName:'Client',email:'client@example.invalid',phoneNumber:'',password:'Test123!',confirmPassword:'Test123!'};
  page.register(); page.submitVerify('123456');
  assert.equal(destinations.at(-1),'/discover');
});

test('owner accounts get owner tools without client or staff access', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{ getItem(key:string) {
    return key === 'token' ? 'fixture' : key === 'user' ? JSON.stringify({roles:['User','Owner']}) : null;
  } } });
  try {
    const auth=new AuthService({} as any);
    assert.equal(auth.isOwner,true);
    assert.equal(auth.isClient,false);
    assert.equal(auth.isStaff,false);
    assert.equal(auth.canOpenCrm,false);
  } finally {
    if(previous) Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
