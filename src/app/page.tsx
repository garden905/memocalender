import Notepad from "@/components/Notepad";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 py-12 px-4 selection:bg-indigo-100 selection:text-indigo-900 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="text-center space-y-4 pt-10 pb-6">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-100 rounded-2xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></svg>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl">
            MemoCalendar
          </h1>
          <p className="text-lg text-zinc-500 max-w-2xl mx-auto">
            ただメモを書くだけ。日付や時間を検知して、カレンダーへの追加を自動で提案します。
          </p>
        </header>

        <Notepad />
      </div>
    </main>
  );
}
