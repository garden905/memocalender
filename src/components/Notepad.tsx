"use client";

import { useState, useEffect, useCallback } from 'react';
import * as chrono from 'chrono-node';
import * as ics from 'ics';
import { CalendarPlus, Sparkles, X } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function Notepad() {
  const [text, setText] = useState('');
  const [detectedDates, setDetectedDates] = useState<chrono.ParsedResult[]>([]);
  // Store ambiguous numbers grouped if they appear close to each other
  const [ambiguousGroups, setAmbiguousGroups] = useState<{ id: string, numbers: { text: string, index: number }[], sourceContext: string }[]>([]);
  const [addedEvents, setAddedEvents] = useState<{ id: string, title: string, text: string, date: Date }[]>([]);

  // Function to detect dates in text
  const detectDates = useCallback((currentText: string) => {
    if (!currentText.trim()) {
      setDetectedDates([]);
      setAmbiguousGroups([]);
      return;
    }

    // Parse using Japanese locale for terms like "明日", "来週の金曜日", etc.
    const results = chrono.ja.parse(currentText);

    // Filter out dates that have already been converted to events for this specific text segment
    const newDates = results.filter(result => {
      const matchId = `date-${result.text}-${result.index}`;
      return !addedEvents.some(event => event.id === matchId);
    });

    setDetectedDates(newDates);

    // Detect ambiguous numbers like "5", "12" that aren't parsed by chrono
    // Using a Safari-compatible Regex without look-behinds `(?<!...)`
    const numberMatches = Array.from(currentText.matchAll(/(?:^|[^\d])(\d{1,2})(?=[^\d]|$)/g));
    const validAmbiguous = numberMatches.filter(match => {
      const numText = match[1]; // Capture group 1 has the digits
      const matchFullText = match[0];
      const index = match.index! + matchFullText.lastIndexOf(numText);
      const matchId = `ambiguous-${numText}-${index}`;

      if (addedEvents.some(event => event.id === matchId)) return false;
      if (addedEvents.some(event => event.id.startsWith('group') && event.id.includes(matchId))) return false;

      const overlaps = results.some(r => {
        const rStart = r.index;
        const rEnd = r.index + r.text.length;
        const mStart = index;
        const mEnd = index + numText.length;
        return mStart < rEnd && mEnd > rStart;
      });
      return !overlaps;
    }).map(match => {
      const numText = match[1];
      const matchFullText = match[0];
      const index = match.index! + matchFullText.lastIndexOf(numText);
      return {
        text: numText,
        index: index
      };
    });

    // Group close numbers (e.g. "15, 16 遠足")
    const groups: { id: string, numbers: { text: string, index: number }[], sourceContext: string }[] = [];
    let currentGroup: { text: string, index: number }[] = [];

    for (let i = 0; i < validAmbiguous.length; i++) {
      const curr = validAmbiguous[i];
      if (currentGroup.length === 0) {
        currentGroup.push(curr);
      } else {
        const prev = currentGroup[currentGroup.length - 1];
        const textBetween = currentText.substring(prev.index + prev.text.length, curr.index);
        // If the text between the numbers is just spaces, commas, dots, or basic connectors, group them
        if (/^[\s,、と・&.]+$/.test(textBetween)) {
          currentGroup.push(curr);
        } else {
          // Find minimal context string to display for the previous group
          const firstInPrevGroup = currentGroup[0];
          const lastInPrevGroup = currentGroup[currentGroup.length - 1];
          const contextStr = currentText.substring(firstInPrevGroup.index, lastInPrevGroup.index + lastInPrevGroup.text.length);

          groups.push({
            id: `group-${currentGroup.map(n => n.index).join('-')}`,
            numbers: [...currentGroup],
            sourceContext: contextStr
          });
          currentGroup = [curr];
        }
      }
    }
    if (currentGroup.length > 0) {
      // Find minimal context string to display for the last group
      const first = currentGroup[0];
      const last = currentGroup[currentGroup.length - 1];
      const contextStr = currentText.substring(first.index, last.index + last.text.length);

      groups.push({
        id: `group-${currentGroup.map(n => n.index).join('-')}`,
        numbers: [...currentGroup],
        sourceContext: contextStr
      });
    }

    setAmbiguousGroups(groups);
  }, [addedEvents]);

  // Debounce the text detection slightly
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      detectDates(text);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [text, detectDates]);

  const extractTitleAndAddEvent = (matchId: string, startDate: Date, sourceText: string) => {
    const lines = text.split('\n');
    let title = "予定";
    for (const line of lines) {
      if (line.includes(sourceText)) {
        title = line.replace(sourceText, '').trim();
        // Remove trailing or leading particles
        title = title.replace(/^(に|から|まで|の|は|が|へ|で|と|、|。|\s)+/, '');
        title = title.replace(/(に|から|まで|の|は|が|へ|で|と|、|。|\s)+$/, '');
        title = title || "新しい予定";
        break;
      }
    }

    const endDate = addHours(startDate, 1); // Default to 1 hour event

    const newEvent = {
      id: matchId,
      title,
      text: sourceText,
      date: startDate
    };

    setAddedEvents(prev => [...prev, newEvent]);

    // Generate .ics file for iOS/Apple Calendar and Google Calendar
    const event: ics.EventAttributes = {
      start: [startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate(), startDate.getHours(), startDate.getMinutes()],
      end: [endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate(), endDate.getHours(), endDate.getMinutes()],
      title: title,
      description: `MemoCalendarから追加された予定\n\n検出元テキスト: ${sourceText}`,
      status: 'CONFIRMED',
      busyStatus: 'BUSY'
    };

    ics.createEvent(event, (error, value) => {
      if (error) {
        console.error("Error creating ics:", error);
        alert("カレンダーファイルの作成に失敗しました。");
        return;
      }

      // Create a blob and trigger download
      const blob = new Blob([value], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${title || 'event'}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  };

  const handleAddEvent = (result: chrono.ParsedResult) => {
    const matchId = `date-${result.text}-${result.index}`;
    extractTitleAndAddEvent(matchId, result.start.date(), result.text);
    setDetectedDates(prev => prev.filter(d => d.index !== result.index));
  };

  const handleResolveAmbiguousGroup = (group: { id: string, numbers: { text: string, index: number }[], sourceContext: string }, type: 'month' | 'day' | 'hour') => {

    group.numbers.forEach(item => {
      let startDate = new Date();
      const val = parseInt(item.text, 10);
      // let dateText = item.text; // This was for individual display, not needed for event creation

      if (type === 'month') {
        startDate.setMonth(val - 1);
        // dateText += '月';
      } else if (type === 'day') {
        startDate.setDate(val);
        // dateText += '日';
      } else if (type === 'hour') {
        startDate.setHours(val, 0, 0, 0);
        // dateText += '時';
      }

      // We use the whole group context to find the relevant line/title,
      // but store the specific date text in the event.
      const eventMatchId = `${group.id}-ambiguous-${item.text}-${item.index}`;
      extractTitleAndAddEvent(eventMatchId, startDate, group.sourceContext); // Pass group.sourceContext for title extraction
    });

    setAmbiguousGroups(prev => prev.filter(g => g.id !== group.id));
  };

  const removeEvent = (id: string) => {
    setAddedEvents(prev => prev.filter(e => e.id !== id));
    // Trigger re-detection in case the text is still there
    detectDates(text);
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-8 p-4">

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full relative shadow-lg rounded-2xl overflow-hidden bg-white/50 backdrop-blur-xl border border-white/40 ring-1 ring-black/5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:shadow-xl">
          <div className="px-6 py-4 border-b border-zinc-200/50 bg-white/40 flex justify-between items-center">
            <h2 className="text-lg font-medium text-zinc-700 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              メモ帳
            </h2>
            <span className="text-xs text-zinc-400 font-mono">{text.length} chars</span>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="ここにメモを入力してください... 日付（例：明日の15時、来週の金曜日）を入力すると自動で予定を提案します。"
            className="w-full h-[60vh] min-h-[400px] p-6 text-zinc-700 leading-relaxed resize-none focus:outline-none bg-transparent"
            style={{ fontSize: '1.05rem' }}
          />

          {/* Suggestions Popover for detected dates */}
          {(detectedDates.length > 0 || ambiguousGroups.length > 0) && (
            <div className="absolute bottom-4 left-0 right-0 px-6 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">

              {/* Normal detected dates */}
              {detectedDates.map((result, idx) => (
                <div
                  key={idx}
                  className="bg-indigo-600 shadow-xl shadow-indigo-500/20 text-white p-4 rounded-xl flex items-center justify-between gap-4 border border-indigo-400/30"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-indigo-200 font-medium">予定を検出しました</span>
                    <span className="text-base font-semibold">
                      「{result.text}」 → {format(result.start.date(), 'yyyy年M月d日(EEE) HH:mm', { locale: ja })}
                    </span>
                  </div>
                  <button
                    onClick={() => handleAddEvent(result)}
                    className="shrink-0 bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors active:scale-95"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    カレンダーに追加
                  </button>
                </div>
              ))}

              {/* Ambiguous Number Suggestions (Groups) */}
              {ambiguousGroups.map((group) => (
                <div
                  key={group.id}
                  className="bg-indigo-600 shadow-xl shadow-indigo-500/20 text-white p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-indigo-400/30"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-indigo-200 font-medium">
                      「{group.sourceContext}」はいつの予定ですか？
                    </span>
                    {group.numbers.length > 1 && (
                      <span className="text-xs text-indigo-300">※複数まとめて追加されます</span>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => handleResolveAmbiguousGroup(group, 'day')} className="bg-white text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                      {group.numbers.length > 1 ? '日' : `${group.sourceContext}日`}
                    </button>
                    <button onClick={() => handleResolveAmbiguousGroup(group, 'hour')} className="bg-white text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                      {group.numbers.length > 1 ? '時' : `${group.sourceContext}時`}
                    </button>
                    <button onClick={() => handleResolveAmbiguousGroup(group, 'month')} className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors">
                      {group.numbers.length > 1 ? '月' : `${group.sourceContext}月`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side Panel (Upcoming Events) */}
      <div className="w-full md:w-80 flex flex-col gap-4">
        <h3 className="text-lg font-semibold text-zinc-800 px-1">追加された予定</h3>

        {addedEvents.length === 0 ? (
          <div className="bg-zinc-100 border border-dashed border-zinc-300 rounded-xl p-8 text-center text-zinc-500 text-sm">
            カレンダーに追加された予定はありません。
            <br /><br />
            メモに「明日10時に会議」のように書くと、ここに予定が追加されます。
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {addedEvents.map((ev) => (
              <div key={ev.id} className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm relative group overflow-hidden hover:shadow-md transition-shadow">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                <button
                  onClick={() => removeEvent(ev.id)}
                  className="absolute top-2 right-2 p-1 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="削除"
                >
                  <X className="w-4 h-4" />
                </button>
                <h4 className="font-medium text-zinc-800 pr-6 truncate">{ev.title}</h4>
                <p className="text-sm text-indigo-600 mt-1 font-medium">
                  {format(ev.date, 'yyyy/MM/dd HH:mm')}
                </p>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-1 bg-zinc-50 rounded p-1.5 border border-zinc-100">
                  検出元: "{ev.text}"
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
