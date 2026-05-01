import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { setupMenu } from "./lib/setupMenu";

export function App() {
  useEffect(() => {
    setupMenu();
  }, []);

  return <AppShell />;
}
