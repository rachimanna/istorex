import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Контакты" };

export default function ContactPage() {
  return (
    <main className="page legal">
      <h1 className="large-title">Контакты</h1>
      <div className="glass card stack">
        <div>
          <div className="eyebrow">Поддержка</div>
          <a href={`mailto:${env.contactEmail}`} className="headline">{env.contactEmail}</a>
        </div>
        <div>
          <div className="eyebrow">Жалобы и правообладатели</div>
          <a href={`mailto:${env.abuseEmail}`} className="headline">{env.abuseEmail}</a>
          <p className="footnote">Быстрее всего — кнопка «Пожаловаться» на странице приложения: жалоба сразу попадает в админ-панель.</p>
        </div>
        <div>
          <div className="eyebrow">Оператор</div>
          <div className="headline">{env.operatorName}</div>
        </div>
      </div>
    </main>
  );
}
