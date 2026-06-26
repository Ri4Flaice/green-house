import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function getAllowedEmails() {
  return (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.metadata.readonly",
            "https://www.googleapis.com/auth/spreadsheets.readonly"
          ].join(" "),
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  callbacks: {
    async signIn({ profile }) {
      const allowedEmails = getAllowedEmails();
      const email = profile?.email?.toLowerCase();

      if (!allowedEmails.length && process.env.NODE_ENV !== "production") {
        return true;
      }

      return Boolean(email && allowedEmails.includes(email));
    },
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    }
  }
});
