import { UserRole } from "@prisma/client";

// что кладём в JWT
export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: UserRole;
}

// что получают резолверы через @CurrentUser
export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
}
