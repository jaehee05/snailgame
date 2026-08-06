import { ApiError, errorResponse, requireUser } from "@/lib/api-auth";
import { clearedSessionCookie, createSessionToken, sessionCookie } from "@/lib/auth-session";
import { changePassword, loginUser, publicUser, registerUser } from "@/lib/db";

export const dynamic = "force-dynamic";

type Body = {
  action?: "register" | "login" | "logout" | "changePassword";
  nick?: string;
  password?: string;
  newPassword?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (body.action === "logout") {
      return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie() } });
    }

    if (body.action === "changePassword") {
      const me = await requireUser(req);
      await changePassword(me.uid, body.password ?? "", body.newPassword ?? "");
      return Response.json({ ok: true });
    }

    const nick = (body.nick ?? "").trim();
    const password = body.password ?? "";
    if (!nick || !password) throw new ApiError("아이디와 비밀번호를 입력해 주세요.", 400);

    const user =
      body.action === "register"
        ? await registerUser(nick, password)
        : await loginUser(nick, password);

    return Response.json(
      { user: publicUser(user) },
      { headers: { "set-cookie": sessionCookie(createSessionToken(user.uid)) } }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
