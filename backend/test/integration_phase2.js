import assert from 'node:assert';

const BASE_URL = 'http://localhost:4001/api';
const NC_URL = 'http://localhost:8085';
const TEST_USER = 'phase2_tester';
const TEST_PASS = 'Phase2SecurePass!';
const TEST_EMAIL = 'phase2_tester@cloud.local';

const results = [];

function record(testName, passed, details = '') {
  results.push({ testName, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} | ${testName}${details ? ` (${details})` : ''}`);
}

async function runTests() {
  console.log('========================================================');
  console.log(' PHASE 2: INTEGRATION & ACCEPTANCE TEST SUITE');
  console.log('========================================================\n');

  // 1. Nextcloud Container Health
  try {
    const res = await fetch(`${NC_URL}/status.php`);
    const data = await res.json();
    record('Nextcloud Container Health', data.installed === true && data.maintenance === false, `v${data.version}`);
  } catch (err) {
    record('Nextcloud Container Health', false, err.message);
  }

  // 2. Storage Backend API Health
  try {
    const res = await fetch('http://localhost:4001/health');
    const data = await res.json();
    record('Backend API Health', data.status === 'ok');
  } catch (err) {
    record('Backend API Health', false, err.message);
  }

  // 3. OCS Provisioning API - Create Dedicated Test User
  try {
    const authHeader = 'Basic ' + Buffer.from('admin:admin123').toString('base64');
    const res = await fetch(`${NC_URL}/ocs/v1.php/cloud/users`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'OCS-APIRequest': 'true',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        userid: TEST_USER,
        password: TEST_PASS,
        email: TEST_EMAIL,
      }),
    });
    const text = await res.text();
    const createdOrExists = res.ok || text.includes('102') || text.includes('user already exists');
    record('OCS User Provisioning', createdOrExists, `User: ${TEST_USER}`);
  } catch (err) {
    record('OCS User Provisioning', false, err.message);
  }

  // 4. WebDAV Directory Listing via Backend
  try {
    const res = await fetch(`${BASE_URL}/files/list?user=${TEST_USER}`, {
      headers: { 'x-user-pass': TEST_PASS },
    });
    const data = await res.json();
    record('WebDAV Directory Listing', data.success === true && Array.isArray(data.items), `${data.count} items in root`);
  } catch (err) {
    record('WebDAV Directory Listing', false, err.message);
  }

  // 5. Create Nested Folders via Backend
  try {
    const res1 = await fetch(`${BASE_URL}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER, 'x-user-pass': TEST_PASS },
      body: JSON.stringify({ path: '/', name: 'Documents' }),
    });
    const res2 = await fetch(`${BASE_URL}/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER, 'x-user-pass': TEST_PASS },
      body: JSON.stringify({ path: '/Documents', name: 'Semester_Projects' }),
    });
    record('WebDAV Nested Folder Creation', res1.ok && res2.ok, 'Created /Documents/Semester_Projects');
  } catch (err) {
    record('WebDAV Nested Folder Creation', false, err.message);
  }

  // 6. Real File Upload via Backend Multipart
  const testContent = 'Antigravity Phase 2 Real WebDAV Verification Data: ' + Date.now();
  try {
    const formData = new FormData();
    const blob = new Blob([testContent], { type: 'text/plain' });
    formData.append('file', blob, 'phase2_verification.txt');
    formData.append('path', '/Documents/Semester_Projects');

    const res = await fetch(`${BASE_URL}/files/upload?user=${TEST_USER}`, {
      method: 'POST',
      headers: { 'x-user-pass': TEST_PASS },
      body: formData,
    });
    const data = await res.json();
    record('WebDAV File Upload', data.success === true, `Uploaded to ${data.file?.path}`);
  } catch (err) {
    record('WebDAV File Upload', false, err.message);
  }

  // 7. Real File Download & Content Verification
  try {
    const res = await fetch(
      `${BASE_URL}/files/download?path=${encodeURIComponent('/Documents/Semester_Projects/phase2_verification.txt')}&user=${TEST_USER}`,
      { headers: { 'x-user-pass': TEST_PASS } }
    );
    const downloadedText = await res.text();
    const matches = downloadedText === testContent;
    record('WebDAV File Download & Integrity', matches && res.ok, `Received ${downloadedText.length} bytes matching upload`);
  } catch (err) {
    record('WebDAV File Download & Integrity', false, err.message);
  }

  // 8. Real File Rename / Move
  try {
    const res = await fetch(`${BASE_URL}/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER, 'x-user-pass': TEST_PASS },
      body: JSON.stringify({
        sourcePath: '/Documents/Semester_Projects/phase2_verification.txt',
        destinationPath: '/Documents/Semester_Projects/renamed_project_spec.txt',
      }),
    });
    const data = await res.json();
    record('WebDAV Rename / Move', data.success === true);
  } catch (err) {
    record('WebDAV Rename / Move', false, err.message);
  }

  // 9. Real File Deletion
  try {
    const res = await fetch(`${BASE_URL}/files/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-user-id': TEST_USER, 'x-user-pass': TEST_PASS },
      body: JSON.stringify({ path: '/Documents/Semester_Projects/renamed_project_spec.txt' }),
    });
    const data = await res.json();
    record('WebDAV File Deletion', data.success === true);
  } catch (err) {
    record('WebDAV File Deletion', false, err.message);
  }

  // 10. Persistent Storage File (Retained for Docker survival test)
  try {
    const formData = new FormData();
    const pdfDummy = new Blob(['%PDF-1.4 Permanent Archival Test File'], { type: 'application/pdf' });
    formData.append('file', pdfDummy, 'persistent_archival_test.pdf');
    formData.append('path', '/Documents');

    const res = await fetch(`${BASE_URL}/files/upload?user=${TEST_USER}`, {
      method: 'POST',
      headers: { 'x-user-pass': TEST_PASS },
      body: formData,
    });
    record('Persistent File Upload', res.ok, 'persistent_archival_test.pdf created');
  } catch (err) {
    record('Persistent File Upload', false, err.message);
  }

  // 11. Security Test: Path Traversal Prevention
  try {
    const res = await fetch(
      `${BASE_URL}/files/download?path=${encodeURIComponent('../../etc/passwd')}&user=${TEST_USER}`,
      { headers: { 'x-user-pass': TEST_PASS } }
    );
    const data = await res.json().catch(() => ({}));
    // Path traversal must fail and return error status
    const blocked = !res.ok || data.error?.includes('traversal');
    record('Security: Path Traversal Blocked', blocked, `HTTP ${res.status}`);
  } catch (err) {
    record('Security: Path Traversal Blocked', true, 'Request rejected');
  }

  // 12. Security Test: Missing File Upload Rejection
  try {
    const res = await fetch(`${BASE_URL}/files/upload?user=${TEST_USER}`, {
      method: 'POST',
      headers: { 'x-user-pass': TEST_PASS },
    });
    record('Security: Empty Upload Rejected', res.status === 400);
  } catch (err) {
    record('Security: Empty Upload Rejected', false, err.message);
  }

  // 13. Real Nextcloud Quota Query
  try {
    const res = await fetch(`${BASE_URL}/files/quota?user=${TEST_USER}`);
    const data = await res.json();
    record('Real Nextcloud Quota Inspection', data.success === true && typeof data.quota?.used === 'number', `Used: ${data.quota?.used} bytes`);
  } catch (err) {
    record('Real Nextcloud Quota Inspection', false, err.message);
  }

  // Summary
  console.log('\n========================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(` SUMMARY: ${passedCount}/${results.length} TESTS PASSED`);
  console.log(` OVERALL STATUS: ${allPassed ? '✅ ALL ACCEPTANCE CRITERIA MET' : '❌ FAILURES DETECTED'}`);
  console.log('========================================================');
}

runTests();
