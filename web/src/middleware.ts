import { withAuth } from 'next-auth/middleware'

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
})

export const config = {
  matcher: [
    // Protect all app routes except auth, agent API, email-reply API, and static
    '/((?!api/agent|api/email-reply|api/auth|auth|_next/static|_next/image|favicon.ico).*)',
  ],
}
