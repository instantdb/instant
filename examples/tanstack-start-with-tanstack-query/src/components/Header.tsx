import { db } from "@/lib/db";
import { useNavigate } from "@tanstack/react-router";

export default function Header() {
  const auth = db.useAuth();
  const navigate = useNavigate();
  const signOut = () => {
    db.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <>
      <header className="p-4 flex justify-between items-center bg-gray-800 text-white shadow-lg">
        Full Todo Example With Auth
        {auth.user && <button onClick={signOut}>Sign Out</button>}
      </header>
    </>
  );
}
