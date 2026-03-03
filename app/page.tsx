import { MorphTitle } from "@/components/MorphTitle";
import { RandomVariableViz } from "@/components/RandomVariableViz";

export default function Page() {
  return (
    <main className="app-main">
      <header className="app-header">
        <MorphTitle />
      </header>
      <section className="app-content">
        <RandomVariableViz />
      </section>
    </main>
  );
}