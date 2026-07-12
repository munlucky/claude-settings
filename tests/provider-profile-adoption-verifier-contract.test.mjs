import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdoptionEvidence } from '../tools/evals/provider-profile-adoption.mjs';

test('adoption verifier accepts complete no-approval terminal state', () => {
  const result = verifyAdoptionEvidence({
    status: 'not_authorized',
    approvalStatus: 'not_authorized',
    mutationPerformed: false,
    liveInstallerInvoked: false,
    rollbackReady: true,
  });
  assert.equal(result.status, 'pass');
});

test('adoption verifier rejects partial approved-install evidence', () => {
  const result = verifyAdoptionEvidence({ status: 'managed_profile_installed', installId: 'install-1' });
  assert.equal(result.status, 'fail');
  assert.ok(result.findings.includes('approved_install_requires_profile_parity'));
  assert.ok(result.findings.includes('approved_install_requires_installed_doctor'));
});
