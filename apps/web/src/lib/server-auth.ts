import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJwtHs256, type Role } from "./edge-jwt.ts";

export interface ServerSession {
  readonly isAuthenticated: boolean;
  readonly role: Role | null;
  readonly userId: string | null;
}

/**
 * Resolves verified authentication session from incoming HTTP-only cookies in Server Components.
 */
export async function getServerSession(): Promise<ServerSession> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  const refreshToken = cookieStore.get("refresh_token")?.value;
  const secret = process.env.JWT_SECRET;

  if (!accessToken || !secret) {
    return { isAuthenticated: false, role: null, userId: null };
  }

  const verified = await verifyJwtHs256(accessToken, secret);
  if (verified) {
    return {
      isAuthenticated: true,
      role: verified.role,
      userId: verified.sub,
    };
  }

  // Silent refresh grace window: allow layout to render if valid refresh token cookie exists
  if (refreshToken) {
    const signatureValid = await verifyJwtHs256(accessToken, secret, {
      ignoreExpiration: true,
    });
    if (signatureValid) {
      return {
        isAuthenticated: true,
        role: signatureValid.role,
        userId: signatureValid.sub,
      };
    }
  }

  return { isAuthenticated: false, role: null, userId: null };
}

/**
 * Enforces authentication and optional role requirement within Next.js Layout / Server Components.
 * Automatically redirects unauthenticated or unauthorized visitors without hardcoding routes in proxy.
 */
export async function enforceAuth(requiredRole?: Role, loginPath = "/auth/login") {
  const session = await getServerSession();

  if (!session.isAuthenticated) {
    redirect(loginPath);
  }

  if (requiredRole && session.role !== requiredRole) {
    redirect(loginPath);
  }

  return session;
}
