import { Flower2 } from "lucide-react";
import { auth } from "@/auth";
import { signInWithGoogle, signOutUser } from "@/app/actions";
import { Dashboard } from "@/components/dashboard";

export default async function Home() {
  const session = await auth();

  return (
    <main>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <Flower2 aria-hidden="true" size={19} />
            <span>GreenHouse Orders</span>
          </div>
          {session?.user?.email ? (
            <div className="user-menu">
              <span>{session.user.email}</span>
              <form action={signOutUser}>
                <button className="link-button" type="submit">
                  Выйти
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>

      <section className="page-shell">
        {session?.user ? (
          <Dashboard userEmail={session.user.email ?? ""} />
        ) : (
          <article className="panel welcome-panel">
            <h1>Добро пожаловать 🌺</h1>
            <p>Войдите через Google, чтобы подключить ваши таблицы заказов и автоматизировать рассылку счетов клиентам.</p>
            <form action={signInWithGoogle}>
              <button className="primary-button" type="submit">
                Войти через Google
              </button>
            </form>
          </article>
        )}
      </section>
    </main>
  );
}
