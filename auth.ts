import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_BUFFER_SECONDS = 60;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

function getAllowedEmails() {
  return (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getGoogleTokenExpiry(accountExpiresAt?: number, accountExpiresIn?: number) {
  if (accountExpiresAt) {
    return accountExpiresAt;
  }

  if (accountExpiresIn) {
    return Math.floor(Date.now() / 1000 + accountExpiresIn);
  }

  return Math.floor(Date.now() / 1000 + 3600);
}

function isAccessTokenValid(token: JWT) {
  if (!token.accessToken || !token.expiresAt) {
    return false;
  }

  return Date.now() < (token.expiresAt - TOKEN_REFRESH_BUFFER_SECONDS) * 1000;
}

async function refreshGoogleAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return {
      ...token,
      error: "RefreshTokenError"
    };
  }

  try {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID ?? "",
        client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: token.refreshToken
      })
    });
    const data = (await response.json()) as GoogleTokenResponse | { error?: string; error_description?: string };

    if (!response.ok || !("access_token" in data)) {
      throw new Error(
        "error_description" in data && data.error_description
          ? data.error_description
          : "Не удалось обновить токен доступа Google"
      );
    }

    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + data.expires_in),
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined
    };
  } catch (error) {
    console.error("Не удалось обновить токен доступа Google", error);

    return {
      ...token,
      error: "RefreshTokenError"
    };
  }
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
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          expiresAt: getGoogleTokenExpiry(account.expires_at, account.expires_in),
          refreshToken: account.refresh_token ?? token.refreshToken,
          error: undefined
        };
      }

      if (isAccessTokenValid(token)) {
        return token;
      }

      return refreshGoogleAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    }
  }
});
