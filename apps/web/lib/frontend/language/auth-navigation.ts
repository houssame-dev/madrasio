/** Fixed post-Auth destinations: a new document establishes a new presentation. */
export function navigateAfterAuth(destination: '/login' | '/dashboard') {
  window.location.replace(destination);
}
