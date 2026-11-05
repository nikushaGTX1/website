import '@angular/compiler';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { Login } from './login';
import { AuthService } from '../services/auth.service';

function setup(returnUrl: string | null = null) {
  const sent: unknown[] = [];
  const destinations: unknown[] = [];
  const auth = { isPersonalAccount: true, register: (body: unknown) => { sent.push(body); return of({emailSent:true}); },
    verifyEmail: () => of({}), login: () => of({}) };
  const router = { navigate: (...args: unknown[]) => { destinations.push(args); }, navigateByUrl: (url: string) => { destinations.push(url); } };
  const route = { snapshot: { data: {register:true}, queryParamMap: {get: (key: string) => key === 'returnUrl' ? returnUrl : null} } };
  const page = new Login(auth as any, router as any, route as any, {hasPendingSearch:()=>false} as any);
  return {page,sent,destinations,auth};
}

test('the same registration continues to Discover or the requested listing form', () => {
  for (const returnUrl of [null, '/upload-apartment?district=Vake']) {
    const { page, sent, destinations } = setup(returnUrl);
    page.registerData = { fullName: 'Test User', email: 'user@example.invalid', phoneNumber: '', password: 'Test123!', confirmPassword: 'Test123!' };
    page.register();
    assert.equal(Object.hasOwn(sent[0] as object, 'accountType'), false);
    page.submitVerify('123456');
    assert.equal(destinations.at(-1), returnUrl ?? '/discover');
  }
});

test('ordinary and legacy accounts get personal tools while staff keep CRM access', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let roles: string[] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable:true, value:{ getItem(key:string) {
    return key === 'token' ? 'fixture' : key === 'user' ? JSON.stringify({ roles }) : null;
  } } });
  try {
    for (roles of [[], ['User'], ['User', 'Owner'], ['User', 'Client']]) {
      const auth = new AuthService({} as any);
      assert.equal(auth.isPersonalAccount, true);
      assert.equal(auth.canOpenCrm, false);
    }
    roles = ['User', 'Manager'];
    const staff = new AuthService({} as any);
    assert.equal(staff.isPersonalAccount, false);
    assert.equal(staff.canOpenCrm, true);
  } finally {
    if(previous) Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
