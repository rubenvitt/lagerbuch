import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

export default async function VerwaltungLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/verwaltung/kein-zugriff");
  return (
    <div className="adm">
      <aside className="side">
        <div>
          <div className="brand">
            LAGER<span>BUCH</span>
          </div>
          <div className="brandsub">Verwaltung</div>
        </div>
        <div style={{ flex: 1 }} />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="sitem" type="submit">
            Abmelden
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
