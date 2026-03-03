import { MorphTitle } from "@/components/MorphTitle";
import { RandomVariableViz } from "@/components/RandomVariableViz";

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-[1440px] px-4 py-4 sm:px-6 sm:py-8">
      <header className="mb-10">
        <MorphTitle />
      </header>
      <section>
        <RandomVariableViz />
      </section>
    </main>
  );
}
