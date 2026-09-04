export type UserRole = 'ADMIN' | 'OPERATOR';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
}
