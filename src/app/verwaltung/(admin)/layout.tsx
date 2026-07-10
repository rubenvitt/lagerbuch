import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { SideNav } from "@/components/SideNav";

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
        <SideNav />
        <div className="brandsub" style={{ padding: "0 8px 10px" }}>
          Angemeldet als {session.user.name ?? session.user.email ?? "?"}
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="sitem" type="submit">
            <LogOut size={17} />
            <span className="logout-label">Abmelden</span>
          </button>
        </form>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
