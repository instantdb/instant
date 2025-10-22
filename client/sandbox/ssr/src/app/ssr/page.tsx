import { adminDb } from "@/lib/adminDb";
import { getTriples } from "@/lib/framework";
import { cookies } from "next/headers";

export default async function () {
  const cookieStore = await cookies();
  const instantToken = cookieStore.get("instant_refresh_token");

  if (!instantToken || !instantToken.value) {
    return <div>No user found</div>;
  }
  const user = await adminDb.auth.verifyToken(instantToken.value);

  const result = await getTriples(
    {
      todos: {},
    },
    instantToken.value,
  );

  console.log(result);

  return <div>This is server page, user: {user.email}</div>;
}
