import { useState, useEffect } from "react";
import { mockAuth, User } from "../auth/mockAuth";

export interface UserAccount {
  name: string;
  email: string;
  avatarInitial: string;
  role?: string;
  id?: string;
}

export const useCurrentUser = () => {
  const [userAccount, setUserAccount] = useState<UserAccount>(() => {
    const user = mockAuth.getCurrentUser();
    return formatUserData(user);
  });

  useEffect(() => {
    // Sync state if user changes in storage
    const syncUser = () => {
      const user = mockAuth.getCurrentUser();
      setUserAccount(formatUserData(user));
    };

    window.addEventListener("storage", syncUser);
    return () => window.removeEventListener("storage", syncUser);
  }, []);

  const logout = () => {
    mockAuth.logout();
  };

  return {
    user: userAccount,
    logout,
  };
};

function formatUserData(user: User | null): UserAccount {
  const defaultName = "Amrit Kumar Biswas";
  const defaultEmail = "amrit@gmail.com";

  const name = user?.name && user.name.trim().length > 0 ? user.name : defaultName;
  const email = user?.email && user.email.trim().length > 0 ? user.email : defaultEmail;
  const avatarInitial = (name.trim().charAt(0) || "A").toUpperCase();

  return {
    name,
    email,
    avatarInitial,
    role: user?.role,
    id: user?.id,
  };
}
