// The admin dashboard is loaded lazily (see Root.jsx), so the first test in
// a file that opens it would also pay for loading and transforming the
// whole dashboard, inside its own waits. On a busy machine that took most of
// the 1 second findBy* waits and made those first tests fail now and then.
// Admin test files call this in beforeAll, so that cost comes before any test.
export const preloadAdmin = () => import('../admin/AdminApp.jsx')
