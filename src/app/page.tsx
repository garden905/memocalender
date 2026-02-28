import Notepad from "@/components/Notepad";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FDFDFD] py-8 text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900 font-sans flex flex-col items-center">
      <div className="w-full max-w-md px-4 flex flex-col items-center">
        <header className="text-center mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">
            メモンダー<span className="text-lg text-zinc-400 font-medium ml-1">(仮称)</span>
          </h1>
        </header>

        <Notepad />
      </div>
    </main>
  );
}
