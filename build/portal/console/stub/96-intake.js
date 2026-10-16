// LOCAL PREVIEW ONLY (build-console.js adds stub/*.js only with --preview). Stand-in rows for onboarding_submissions
// (migration 20261015030000): one new setup form from the "Jon" test client, so Needs you shows the block.
(function () {
  'use strict';
  const S = /** @type {any} */ (window).D8STUB;
  if (!S) return;
  S.seeds.push((/** @type {any} */ db) => {
    db.onboarding_submissions = [{
      id: 'obs_preview_jon', sid: 'preview-jon-0001', at: new Date(Date.now() - 6 * 60000).toISOString(),
      first_name: 'Jon', last_name: 'Test', email: 'karanveersingh2425@gmail.com', mobile: null, restaurant: 'TEST Jon’s Kitchen',
      summary: 'Fix first: Google listing, Instagram\nPosts sound: Warm and simple\nWebsite now: None yet\nGoogle Business Profile: Done, I sent the invite\nFacebook and Instagram: Do it on the call\nKickoff call: Monday 19 October at 10:00 a.m., video call',
      answers: null, status: 'new', tenant_id: null, decided_at: null, decided_by: null
    }];
  });
})();
