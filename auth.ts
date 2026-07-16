import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { DEFAULT_PERMISSIONS, type PermissionMatrix } from '@/lib/permissions';
import { loadPermissionsForUser } from '@/lib/auth-utils';
import type { RoleName } from '@prisma/client';

const PLACEHOLDER_SECRET = 'change-me-in-production-use-openssl-rand-base64-32';

if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.AUTH_SECRET || process.env.AUTH_SECRET === PLACEHOLDER_SECRET)
) {
  throw new Error('AUTH_SECRET must be set to a secure random value in production');
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      roleName: RoleName;
      roleDisplayName: string;
      permissions: PermissionMatrix;
      status: string;
    };
  }
  interface User {
    roleName: RoleName;
    roleDisplayName: string;
    permissions: PermissionMatrix;
    status: string;
    sessionVersion?: number;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string;
    roleName: RoleName;
    roleDisplayName: string;
    permissions: PermissionMatrix;
    status: string;
    sessionVersion: number;
  }
}

async function loadUserWithRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!user || user.deletedAt || user.status !== 'ACTIVE') return null;
  const permissions =
    (user.role.permissions as PermissionMatrix) ?? DEFAULT_PERMISSIONS[user.role.name];
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    roleName: user.role.name,
    roleDisplayName: user.role.displayName,
    permissions,
    status: user.status,
    sessionVersion: user.sessionVersion,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/sign-in',
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = String(credentials.email).toLowerCase().trim();
        const user = await prisma.user.findUnique({
          where: { email },
          include: { role: true },
        });

        if (!user?.passwordHash || user.deletedAt || user.status !== 'ACTIVE') {
          return null;
        }

        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const permissions =
          (user.role.permissions as PermissionMatrix) ?? DEFAULT_PERMISSIONS[user.role.name];

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          roleName: user.role.name,
          roleDisplayName: user.role.displayName,
          permissions,
          status: user.status,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user.email) {
        const email = user.email.toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email } });

        if (!existing) {
          const allowOAuthSignup = process.env.ALLOW_OAUTH_SELF_SIGNUP === 'true';
          if (!allowOAuthSignup) return false;

          const defaultRole = await prisma.role.findFirst({
            where: { name: 'READ_ONLY' },
          });
          if (!defaultRole) return false;

          await prisma.user.create({
            data: {
              email,
              name: user.name ?? email,
              image: user.image,
              roleId: defaultRole.id,
              status: 'ACTIVE',
              emailVerified: new Date(),
              consentAcceptedAt: new Date(),
            },
          });
        } else if (existing.deletedAt || existing.status !== 'ACTIVE') {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        if (user.roleName) {
          token.id = user.id!;
          token.roleName = user.roleName;
          token.roleDisplayName = user.roleDisplayName;
          token.permissions = user.permissions;
          token.status = user.status;
          token.sessionVersion = user.sessionVersion ?? 0;
        } else if (user.email) {
          const dbUser = await loadUserWithRole(
            user.id ??
              (await prisma.user.findUnique({ where: { email: user.email.toLowerCase() } }))?.id ??
              ''
          );
          if (dbUser) {
            token.id = dbUser.id;
            token.roleName = dbUser.roleName;
            token.roleDisplayName = dbUser.roleDisplayName;
            token.permissions = dbUser.permissions;
            token.status = dbUser.status;
            token.sessionVersion = dbUser.sessionVersion;
          }
        }
      } else if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { role: true },
        });
        if (!dbUser || dbUser.deletedAt || dbUser.status !== 'ACTIVE') {
          return token;
        }
        if (dbUser.sessionVersion !== token.sessionVersion) {
          return {} as typeof token;
        }
        if (trigger === 'update' || !token.roleName) {
          token.roleName = dbUser.role.name;
          token.roleDisplayName = dbUser.role.displayName;
          token.permissions =
            (dbUser.role.permissions as PermissionMatrix) ??
            DEFAULT_PERMISSIONS[dbUser.role.name];
          token.status = dbUser.status;
          token.sessionVersion = dbUser.sessionVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (!token.id) return session;
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roleName = token.roleName as RoleName;
        session.user.roleDisplayName = token.roleDisplayName as string;
        session.user.permissions = token.permissions as PermissionMatrix;
        session.user.status = token.status as string;
      }
      return session;
    },
  },
});

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Unauthorized');
  return session;
}

export async function requirePermission(
  domain: keyof PermissionMatrix,
  action: keyof PermissionMatrix['customer']
) {
  const session = await requireAuth();
  const perms = await loadPermissionsForUser(session.user.id);
  if (!perms?.[domain]?.[action as keyof typeof perms.customer]) {
    throw new Error('Forbidden');
  }
  session.user.permissions = perms;
  return session;
}
