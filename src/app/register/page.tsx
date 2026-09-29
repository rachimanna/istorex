import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Регистрация" };

export default function RegisterPage() {
  return (
    <main className="page">
      <h1 className="large-title">Регистрация</h1>
      <p className="subhead">
        Регистрируясь, вы принимаете <Link href="/terms">условия использования</Link> и <Link href="/privacy">политику конфиденциальности</Link>.
      </p>
      <Suspense>
        <AuthForm mode="register" />
      </Suspense>
    </main>
  );
}
