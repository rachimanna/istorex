import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Вход" };

export default function LoginPage() {
  return (
    <main className="page">
      <h1 className="large-title">Вход</h1>
      <p className="subhead">Аккаунт нужен для избранного, истории загрузок и проверки UDID. Каталог доступен без регистрации.</p>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </main>
  );
}
