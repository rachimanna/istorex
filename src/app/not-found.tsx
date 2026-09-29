import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="empty glass" style={{ marginTop: 40 }}>
        <div className="emoji">🧭</div>
        <p className="headline">Страница не найдена</p>
        <p className="footnote">Возможно, приложение снято с публикации.</p>
        <Link href="/" className="btn btn-primary">На главную</Link>
      </div>
    </main>
  );
}
