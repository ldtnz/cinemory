import AuthLayout from "@/components/AuthLayout";
import LoginForm from "@/components/LoginForm";
import LoginPosterWall from "@/components/LoginPosterWall";
import LoginTerminal from "@/components/LoginTerminal";

/**
 * Sign-in screen, shown when there is no valid session.
 *
 * Behind the card, the catalog: columns of its own posters drifting slowly in
 * alternate directions — so the app is recognisably itself before anyone
 * signs in, while everything it can actually do stays behind the code. A
 * catalog with too few posters to fill those columns gets the terminal
 * animation instead; Settings can force either (src/lib/login-background.ts).
 *
 * Dark, subtle glass keeps the code readable over either background.
 */
export default function LoginGate({
  posterUrl,
  background,
  name,
  error,
}: {
  posterUrl: string[];
  background: "posters" | "terminal";
  name?: string;
  error?: string;
}) {
  const errorMessage =
    error === "locked"
      ? "Too many attempts. Try again in a few seconds."
      : error === "code"
        ? "Invalid code."
        : null;

  return (
    <AuthLayout background={background === "posters" ? <LoginPosterWall posterUrl={posterUrl} /> : <LoginTerminal />}>
      <LoginForm errorMessage={errorMessage} name={name} />
    </AuthLayout>
  );
}
