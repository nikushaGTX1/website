const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the actual component access predicates without bootstrapping Angular.
function loadMembers(path, names) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const component = source.statements.find(ts.isClassDeclaration);
  const members = component.members.filter(member => names.includes(member.name?.getText(source)));
  assert.equal(members.length, names.length);
  const code = ts.transpile(`class Access { ${members.map(m => m.getText(source)).join('\n')} }`,
    { target: ts.ScriptTarget.ES2022 });
  return new (new Function(`${code}; return Access;`)())();
}
const dashboard = loadMembers('src/app/crm/crm-dashboard/crm-dashboard.ts', ['scopeLeads']);
const detail = loadMembers('src/app/crm/lead-detail/lead-detail.ts', ['canAccessLead', 'canWorkLead', 'canDeleteLead']);
const ownedLead = { id: 1, createdByUserId: 'UPLOADER', originalOwnerUserId: 'UPLOADER', assignedAgentId: 'agent-b' };
const propertyLead = { id: 2, uploaderUserId: 'uploader', assignedAgentId: 'agent-b' };
const unrelatedLead = { id: 3, createdByUserId: 'other', assignedAgentId: 'agent-b' };
for (const isCrmAgent of [false, true]) {
  for (const component of [dashboard, detail]) {
    component.isManager = false;
    component.authService = { currentUser: { id: 'uploader' }, isCrmAgent, isCrmUploader: true };
  }
  assert.deepEqual(dashboard.scopeLeads([ownedLead, propertyLead, unrelatedLead]), [ownedLead, propertyLead]);
  for (const lead of [ownedLead, propertyLead]) {
    detail.lead = lead;
    assert.equal(detail.canAccessLead(lead), true);
    assert.equal(detail.canWorkLead, false);
    assert.equal(detail.canDeleteLead, false);
  }
  assert.equal(detail.canAccessLead(unrelatedLead), false);
}
detail.authService = { currentUser: { id: 'agent-b' }, isCrmAgent: true };
detail.lead = ownedLead;
assert.equal(detail.canAccessLead(ownedLead), true);
assert.equal(detail.canWorkLead, true);
detail.authService = { currentUser: null, isCrmAgent: true };
assert.equal(detail.canAccessLead(ownedLead), false);
assert.equal(detail.canWorkLead, false);
detail.isManager = true;
assert.equal(detail.canAccessLead(unrelatedLead), true);
assert.equal(detail.canWorkLead, true);
console.log('CRM access regression checks passed.');
