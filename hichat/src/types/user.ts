export interface User {
  id: string;
  username: string;
  email: string;
  publicKey: string | null;
  avatarUrl: string | null;
  status: string;
}
