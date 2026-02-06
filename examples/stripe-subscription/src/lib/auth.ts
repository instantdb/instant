import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/adminDb";

type AuthResult =
  | { user: { id: string; email?: string | null }; error?: never }
  | { user?: never; error: NextResponse };

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: NextResponse.json(
        { error: "Authorization required" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "Token required" },
        { status: 401 }
      ),
    };
  }

  try {
    const user = await adminDb.auth.verifyToken(token);
    if (!user) {
      return {
        error: NextResponse.json(
          { error: "Invalid token" },
          { status: 401 }
        ),
      };
    }
    return { user };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      ),
    };
  }
}
