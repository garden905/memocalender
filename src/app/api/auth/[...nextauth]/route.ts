import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/calendar.events"
                }
            }
        }),
    ],
    callbacks: {
        async jwt({ token, account }) {
            // 初期ログイン時にアクセストークンを保存
            if (account) {
                token.accessToken = account.access_token;
            }
            return token;
        },
        async session({ session, token }) {
            // セッションにアクセストークンを含めてAPIルートなどで使えるようにする
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (session as any).accessToken = token.accessToken;
            return session;
        },
    },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
