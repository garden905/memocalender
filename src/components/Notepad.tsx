"use client";

import { useState, useEffect } from 'react';
import * as chrono from 'chrono-node';
import * as ics from 'ics';
import { Plus, ArrowRight, X, Calendar, Bell, Clock, Sparkles, LogIn, LogOut, Pencil, Smartphone } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { format, addHours } from 'date-fns';
import { ja } from 'date-fns/locale';

type EventItem = {
  id: string;
  title: string;
  date: Date;
  reminds: string[];
  rawDate: string;
  googleEventId?: string;
  syncTarget: 'google' | 'apple';
};

const REMIND_OPTIONS = [
  '30分前', '1時間', '3時間', '12時間',
  '1日', '3日', '1週間', 'カスタム'
];

export default function Notepad() {
  const { data: session } = useSession();
  const [view, setView] = useState<'list' | 'add'>('list');
  const [events, setEvents] = useState<EventItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [dateInput, setDateInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [selectedReminds, setSelectedReminds] = useState<string[]>([]);
  const [parsedDate, setParsedDate] = useState<Date | null>(null);
  const [syncTarget, setSyncTarget] = useState<'google' | 'apple'>('google');

  const [isFetching, setIsFetching] = useState(false);

  // 下書きの復元 (初回マウント時のみ)
  useEffect(() => {
    const draftDate = localStorage.getItem('draftDateInput');
    const draftContent = localStorage.getItem('draftContentInput');

    if (draftDate) {
      setDateInput(draftDate);
      const results = chrono.ja.parse(draftDate);
      if (results.length > 0) {
        setParsedDate(results[0].start.date());
      }
    }
    if (draftContent) setContentInput(draftContent);
  }, []);

  // Googleカレンダーイベント取得
  const fetchGoogleEvents = async () => {
    if (!session) return;
    setIsFetching(true);
    try {
      const res = await fetch('/api/calendar');
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fetchedEvents: EventItem[] = data.events.map((e: any) => ({
          id: e.id,
          title: e.summary || '予定なし',
          date: new Date(e.start.dateTime || e.start.date),
          reminds: [], // 取得したRemindも必要であればマッピングするが、今回は一旦空
          rawDate: format(new Date(e.start.dateTime || e.start.date), 'M月d日 HH:mm', { locale: ja }),
          googleEventId: e.id,
          syncTarget: 'google',
        }));

        setEvents(prev => {
          // 既存イベント(Appleカレンダー分や、すでに作成した分)とのマージ処理。ID重複は除く
          const MapEvents = new Map(prev.map(ev => [ev.id, ev]));
          fetchedEvents.forEach(ev => MapEvents.set(ev.id, ev));
          return Array.from(MapEvents.values());
        });
      }
    } catch (e) {
      console.error("Failed to fetch events", e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (session) {
      fetchGoogleEvents();
    }
  }, [session]);

  // 下書きの自動保存
  useEffect(() => {
    // 編集モード(editingIdがある)の場合は下書きとして保存しない（既存の予定を汚染しないため）
    if (!editingId) {
      localStorage.setItem('draftDateInput', dateInput);
      localStorage.setItem('draftContentInput', contentInput);
    }
  }, [dateInput, contentInput, editingId]);

  // Date Suggestions
  const [dateSuggestions, setDateSuggestions] = useState<{ label: string, value: string, isAi: boolean }[]>([
    { label: '今日 19:00', value: '今日 19:00', isAi: false },
    { label: '明日 10:00', value: '明日 10:00', isAi: false },
    { label: '今週末', value: '今週末', isAi: false },
  ]);

  const handleDateInputChange = (rawVal: string) => {
    setDateInput(rawVal);

    if (!rawVal.trim()) {
      setDateSuggestions([
        { label: '今日 19:00', value: '今日 19:00', isAi: false },
        { label: '明日 10:00', value: '明日 10:00', isAi: false },
        { label: '今週末', value: '今週末', isAi: false },
      ]);
      setParsedDate(null);
      return;
    }

    // パース・サジェスト用に全角数字を半角数字に変換
    let val = rawVal.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
    // 「4月3時」のような入力を「4月3日」のタイポとみなして補正
    val = val.replace(/(\d{1,2})月(\d{1,2})時$/, "$1月$2日");

    // AI Suggestions (realtime parse)
    const newSuggestions: typeof dateSuggestions = [];

    // 1. chrono-node による完全な日時パース
    const results = chrono.ja.parse(val);
    if (results.length > 0) {
      const d = results[0].start.date();
      setParsedDate(d);
      const formatted = format(d, 'M月d日 HH:mm', { locale: ja });
      newSuggestions.push({ label: `💡 ${formatted} に設定`, value: rawVal, isAi: true });
    } else {
      setParsedDate(null);
    }

    // 2. 末尾に数字が入力された場合、入力を引き継いだ候補を出す (例: "3月12" -> "3月12日")
    const numMatch = val.match(/^(.*?)(\d{1,2})$/);
    if (numMatch) {
      const prefix = val.substring(0, val.length - numMatch[2].length);
      const num = numMatch[2];

      if (!prefix.endsWith('日')) {
        newSuggestions.push({ label: `${rawVal}日`, value: `${rawVal}日`, isAi: false });
      }

      const hasMonthButNoDay = prefix.includes('月') && !prefix.includes('日');
      if (!prefix.endsWith('時') && !hasMonthButNoDay) {
        newSuggestions.push({ label: `${rawVal}時`, value: `${rawVal}時`, isAi: false });
      }
      if (!prefix.includes('月')) {
        newSuggestions.push({ label: `${rawVal}月`, value: `${rawVal}月`, isAi: false });
      }
      if (prefix.includes('時') && !prefix.includes('分')) {
        newSuggestions.push({ label: `${rawVal}分`, value: `${rawVal}分`, isAi: false });
      }
    }

    // 3. よく使う日本語のサジェスト（部分一致や推測）
    if (val === 'あ' || val === 'あした' || val === '明日') {
      if (!newSuggestions.some(s => s.value === '明日')) {
        newSuggestions.push({ label: '明日', value: '明日', isAi: false });
      }
    }
    if (val === 'あさ' || val === 'あさって' || val === '明後日') {
      if (!newSuggestions.some(s => s.value === '明後日')) {
        newSuggestions.push({ label: '明後日', value: '明後日', isAi: false });
      }
    }
    if (val === 'し' || val === 'しあさって' || val === '明々後日') {
      if (!newSuggestions.some(s => s.value === '明々後日')) {
        newSuggestions.push({ label: '明々後日', value: '明々後日', isAi: false });
      }
    }

    // 重複などを防ぐため、何もなければ空としてセット
    setDateSuggestions(newSuggestions);
  };

  const selectDateSuggestion = (val: string) => {
    // もし isAi で value: val のままだったら（既にparse済みで確定させるだけの場合）、
    // またはプリセットの場合はテキストを置き換える。
    handleDateInputChange(val);
    // これ以上サジェストを出さないためにクリア
    setDateSuggestions([]);

    // 内容入力欄にFocusさせたい場合はRefを使うが、今回はシンプルにテキスト更新のみとする
  };

  const handleEdit = (ev: EventItem) => {
    setEditingId(ev.id);
    setContentInput(ev.title);
    setDateInput(ev.rawDate);
    setParsedDate(ev.date);
    setSelectedReminds(ev.reminds);
    setSyncTarget(ev.syncTarget);
    setView('add');
  };

  const toggleRemind = (r: string) => {
    setSelectedReminds(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  };

  const handleSave = async () => {
    if (!dateInput.trim() || !contentInput.trim()) {
      alert('日付と内容を入力してください。');
      return;
    }

    // 全角数字を半角数字に変換し、一般的な入力ミス（例: 4月3時 -> 4月3日）を補正
    let normalizedDateInput = dateInput.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
    normalizedDateInput = normalizedDateInput.replace(/(\d{1,2})月(\d{1,2})時$/, "$1月$2日");

    // Parse date using chrono-node ja
    const results = chrono.ja.parse(normalizedDateInput);
    let startDate: Date;

    if (results.length > 0) {
      startDate = results[0].start.date();
    } else {
      alert('日付を認識できませんでした。「明日10時」のように入力してください。');
      return;
    }

    // eslint-disable-next-line react-hooks/purity
    const newEventId = editingId || Date.now().toString();

    const newEvent: EventItem = {
      id: newEventId,
      title: contentInput,
      date: startDate,
      reminds: selectedReminds,
      rawDate: dateInput,
      syncTarget: syncTarget,
      googleEventId: editingId ? (events.find(e => e.id === editingId)?.googleEventId) : undefined
    };

    if (syncTarget === 'google' && session) {
      const endDate = addHours(startDate, 1);
      const reqBody = {
        title: contentInput,
        description: `MemoCalendarから追加された予定\n入力日付: ${dateInput}`,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        reminds: selectedReminds.map(r => {
          if (r === '30分前') return { method: 'popup', minutes: 30 };
          if (r === '1時間') return { method: 'popup', minutes: 60 };
          if (r === '3時間') return { method: 'popup', minutes: 180 };
          if (r === '12時間') return { method: 'popup', minutes: 12 * 60 };
          if (r === '1日') return { method: 'popup', minutes: 24 * 60 };
          if (r === '3日') return { method: 'popup', minutes: 3 * 24 * 60 };
          if (r === '1週間') return { method: 'popup', minutes: 7 * 24 * 60 };
          return null;
        }).filter(Boolean)
      };

      if (editingId && newEvent.googleEventId) {
        // 更新 (PUT)
        const res = await fetch('/api/calendar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: newEvent.googleEventId, ...reqBody })
        });
        if (!res.ok) alert('Googleカレンダーへの更新に失敗しました。');
      } else {
        // 新規作成 (POST)
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        });
        if (res.ok) {
          const data = await res.json();
          newEvent.googleEventId = data.eventId;
        } else {
          alert('Googleカレンダーへの追加に失敗しました。');
        }
      }
    } else {
      // Appleカレンダーまたは未ログイン時 (Google同期不可)
      // 既存の予定編集時はICS再ダウンロードを省略（Appleカレンダー側の手動変更運用とする）
      if (!editingId && syncTarget === 'apple') {
        downloadIcs(newEvent);
      } else if (!editingId && syncTarget === 'google') {
        // 未設定のままGoogleを選んでいたが未ログインの場合も、フォールバックでICSを出す
        downloadIcs(newEvent);
        newEvent.syncTarget = 'apple';
      }
    }

    if (editingId) {
      setEvents(prev => prev.map(e => e.id === editingId ? newEvent : e));
    } else {
      setEvents(prev => [...prev, newEvent]);
    }

    // Reset form and go back to list
    setDateInput('');
    setContentInput('');
    setSelectedReminds([]);
    setParsedDate(null);
    setEditingId(null);
    setView('list');

    // 保存完了時に下書きもクリア
    localStorage.removeItem('draftDateInput');
    localStorage.removeItem('draftContentInput');
  };

  const removeEvent = async (id: string) => {
    const target = events.find(e => e.id === id);
    if (!target) return;

    // 削除前の確認ダイアログ
    if (window.confirm(`「${target.title}」の予定を本当に削除しますか？`)) {
      if (target.syncTarget === 'google' && target.googleEventId && session) {
        try {
          await fetch(`/api/calendar?eventId=${target.googleEventId}`, { method: 'DELETE' });
        } catch (e) {
          console.error("Failed to delete event in Google Calendar", e);
        }
      } else if (target.syncTarget === 'apple') {
        alert('アプリ上からは削除されましたが、Appleカレンダー本体の予定はご自身で手動削除をお願いします。');
      }
      setEvents(prev => prev.filter(e => e.id !== id));
    }
  };

  const downloadIcs = (item: EventItem) => {
    const endDate = addHours(item.date, 1);

    const alarms: ics.Alarm[] = item.reminds
      .filter(r => r !== 'カスタム') // TODO: カスタム処理は今は無視
      .map(r => {
        let trigger: Record<string, number | boolean> = { minutes: 0 };
        if (r === '30分前') trigger = { minutes: 30, before: true };
        if (r === '1時間') trigger = { hours: 1, before: true };
        if (r === '3時間') trigger = { hours: 3, before: true };
        if (r === '12時間') trigger = { hours: 12, before: true };
        if (r === '1日') trigger = { hours: 24, before: true };
        if (r === '3日') trigger = { hours: 24 * 3, before: true };
        if (r === '1週間') trigger = { hours: 24 * 7, before: true };

        return {
          action: 'display' as const,
          description: `リマインダー: ${item.title}`,
          trigger
        };
      });

    const event: ics.EventAttributes = {
      start: [item.date.getFullYear(), item.date.getMonth() + 1, item.date.getDate(), item.date.getHours(), item.date.getMinutes()],
      end: [endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(), endDate.getHours(), endDate.getMinutes()],
      title: item.title,
      description: `MemoCalendarから追加された予定\n入力日付: ${item.rawDate}`,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      alarms: alarms.length > 0 ? alarms : undefined,
    };

    ics.createEvent(event, (error, value) => {
      if (error) {
        console.error("Error creating ics:", error);
        alert("カレンダーファイルの作成に失敗しました。");
        return;
      }
      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${item.title || 'event'}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="w-full max-w-[400px] h-[720px] bg-white rounded-[2.5rem] shadow-2xl border-[6px] border-zinc-100 flex flex-col relative overflow-hidden ring-1 ring-zinc-200 shadow-zinc-200/50">
      {/* List View */}
      {view === 'list' && (
        <div className="flex flex-col h-full bg-slate-50/50 animate-in fade-in duration-300">
          <div className="px-6 pt-8 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-zinc-800 tracking-tight">予定</h2>
              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-100 p-1 rounded-full">
                  <button
                    onClick={() => setSyncTarget('google')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${syncTarget === 'google' ? 'bg-white shadow-sm text-blue-600' : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Google
                  </button>
                  <button
                    onClick={() => setSyncTarget('apple')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${syncTarget === 'apple' ? 'bg-white shadow-sm text-rose-600' : 'text-zinc-500 hover:text-zinc-700'
                      }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Apple
                  </button>
                </div>
                {session ? (
                  <button onClick={() => signOut()} className="p-2 bg-zinc-100 rounded-full text-zinc-600 hover:bg-zinc-200 shrink-0" title="ログアウト">
                    <LogOut className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={() => signIn('google')} className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 shrink-0" title="Googleでログインして予定を同期">
                    <LogIn className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3 scrollbar-hide">
            {isFetching && events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
                <div className="w-8 h-8 rounded-full border-4 border-zinc-200 border-t-indigo-500 animate-spin"></div>
                <p className="text-sm font-medium animate-pulse">読み込み中...</p>
              </div>
            ) : events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-4">
                <Calendar className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">予定はありません</p>
              </div>
            ) : (
              [...events].sort((a, b) => a.date.getTime() - b.date.getTime()).map(ev => (
                <div key={ev.id} className="bg-white p-4 rounded-xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] border border-zinc-100/80 relative group flex gap-3 transition-opacity">
                  <div className="w-1.5 h-full absolute left-0 top-0 bg-indigo-500 rounded-l-xl" />
                  <div className="flex-1 min-w-0 pl-1">
                    <h3 className="font-bold text-zinc-800 text-[17px] truncate leading-tight">{ev.title}</h3>
                    <div className="flex items-center gap-2 mt-2 text-indigo-600 font-semibold text-[13px]">
                      <Clock className="w-4 h-4" />
                      <span>{format(ev.date, 'M月d日(E) HH:mm', { locale: ja })}</span>
                      <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${ev.syncTarget === 'google' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                        {ev.syncTarget === 'google' ? '📅 Google' : '🍎 Apple'}
                      </span>
                    </div>
                    {ev.reminds.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2.5">
                        {ev.reminds.map(r => (
                          <span key={r} className="inline-flex items-center gap-1 bg-zinc-100/80 text-zinc-500 px-2.5 py-1 rounded-md text-[11px] font-bold">
                            <Bell className="w-3 h-3" />
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 self-start shrink-0">
                    <button
                      onClick={() => handleEdit(ev)}
                      className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-colors"
                      title="編集"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      className="w-8 h-8 flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                      title="削除"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* List View FAB (+) */}
          <button
            onClick={() => setView('add')}
            className="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/30 text-white hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus className="w-7 h-7" />
          </button>
        </div>
      )}

      {/* Add View Form */}
      {view === 'add' && (
        <div className="flex flex-col h-full bg-white animate-in slide-in-from-right-8 fade-in-50 duration-300">
          <div className="px-5 py-6 flex flex-col justify-center border-b border-zinc-100 mb-2 relative">
            <button
              onClick={() => {
                setView('list');
                // 新規作成用の下書きは消さずに保持する。
                // ただし、既存の予定を編集中にキャンセルした場合は、編集前の状態をクリアして新規作成用に戻す
                if (editingId) {
                  setEditingId(null);
                  setDateInput(localStorage.getItem('draftDateInput') || '');
                  setContentInput(localStorage.getItem('draftContentInput') || '');
                  const draftDate = localStorage.getItem('draftDateInput');
                  if (draftDate) {
                    const results = chrono.ja.parse(draftDate);
                    setParsedDate(results.length > 0 ? results[0].start.date() : null);
                  } else {
                    setParsedDate(null);
                  }
                  setSelectedReminds([]);
                }
              }}
              className="absolute left-5 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[11px] font-bold text-zinc-400 tracking-wider">予定日時</span>
              <div className={`mt-0.5 flex items-center gap-1.5 font-bold transition-all ${parsedDate ? 'text-indigo-600' : 'text-zinc-300'}`}>
                {parsedDate ? (
                  <>
                    <Calendar className="w-4 h-4" />
                    <span className="text-[15px]">{format(parsedDate, 'M月d日(E) HH:mm', { locale: ja })}</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 opacity-50" />
                    <span className="text-[15px] italic font-medium">未確定</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-7 pb-32 space-y-8 scrollbar-hide">
            {/* Date Input */}
            <div className="space-y-3">
              <label className="text-[17px] font-bold text-zinc-800 tracking-tight flex items-center gap-2">
                日付は？
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={dateInput}
                  onChange={e => handleDateInputChange(e.target.value)}
                  placeholder="例：明日 10時"
                  className="w-full text-lg px-4 py-3.5 bg-zinc-50 hover:bg-zinc-100 focus:bg-white border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all placeholder:text-zinc-400 font-bold text-zinc-800"
                />

                {/* Suggestions */}
                {dateSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {dateSuggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => selectDateSuggestion(sug.value)}
                        className={`
                          px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all shadow-sm active:scale-95 border
                          ${sug.isAi
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                          }
                        `}
                      >
                        {sug.isAi && <Sparkles className="w-3.5 h-3.5 inline-block mr-1 text-indigo-500" />}
                        {sug.label.replace('💡 ', '')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Content Input */}
            <div className="space-y-3">
              <label className="text-[17px] font-bold text-zinc-800 tracking-tight">
                内容は？
              </label>
              <textarea
                value={contentInput}
                onChange={e => setContentInput(e.target.value)}
                placeholder="例：チームミーティング"
                rows={3}
                className="w-full text-lg px-4 py-3.5 bg-zinc-50 hover:bg-zinc-100 focus:bg-white border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none transition-all placeholder:text-zinc-400 resize-none font-bold text-zinc-800 leading-relaxed"
              />
            </div>

            {/* Reminders Grid */}
            <div className="space-y-3">
              <label className="text-[17px] font-bold text-zinc-800 tracking-tight">
                リマインド？
              </label>
              <div className="grid grid-cols-4 gap-2">
                {REMIND_OPTIONS.map((r, i) => {
                  const isSelected = selectedReminds.includes(r);
                  return (
                    <button
                      key={r}
                      onClick={() => toggleRemind(r)}
                      className={`
                        py-3 flex flex-col items-center justify-center gap-1 rounded-xl text-[12px] font-bold border-2 transition-all select-none
                        ${isSelected
                          ? 'bg-indigo-50 border-indigo-500 text-indigo-700'
                          : 'bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        }
                      `}
                    >
                      <span>{r.replace(/(前|間)/, '')}</span>
                      <span className="text-[10px] opacity-60">
                        {i === 7 ? '' : r.includes('間') ? '時間' : r.includes('前') ? '前' : ''}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Add Form FAB (→) */}
          <button
            onClick={handleSave}
            title="保存して次へ"
            className="absolute bottom-6 right-6 w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center shadow-xl shadow-zinc-900/20 text-white hover:bg-black hover:scale-105 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-zinc-900/20"
          >
            <ArrowRight className="w-8 h-8" />
          </button>
        </div>
      )}
    </div>
  );
}
