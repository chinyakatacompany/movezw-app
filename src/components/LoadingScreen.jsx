// The post-login redirect chain passes through several components that each
// wait on their own async check (auth, role, driver profile) before handing
// off to the next — App.jsx -> ProtectedRoute -> RoleHome -> RoleGuard. They
// used to each render their own slightly different spinner (different size,
// some with a hardcoded grey ring that ignored the active theme), so moving
// through that chain read as a rapid flash/flicker even though nothing was
// actually wrong. One shared, theme-aware spinner makes the handoff between
// them invisible.
export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );
}
