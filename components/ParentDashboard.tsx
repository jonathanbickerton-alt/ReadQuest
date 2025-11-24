import React from 'react';
import { ReadingSession } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Activity, BookOpen, Clock, AlertCircle, TrendingUp, CheckCircle, Info } from 'lucide-react';

interface Props {
  history: ReadingSession[];
}

const ParentDashboard: React.FC<Props> = ({ history }) => {
  // Prep data for charts
  const accuracyData = history.map(s => ({ date: new Date(s.date).toLocaleDateString(), accuracy: s.stats.accuracy }));
  const speedData = history.map(s => ({ date: new Date(s.date).toLocaleDateString(), speed: s.stats.speed }));

  const totalWords = history.reduce((acc, curr) => acc + curr.wordCount, 0);
  const totalSessions = history.length;
  const avgAccuracy = totalSessions > 0 ? (history.reduce((acc, curr) => acc + curr.stats.accuracy, 0) / totalSessions).toFixed(1) : 0;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-indigo-900 mb-6 flex items-center gap-3">
        <Activity className="w-8 h-8" /> Parent Dashboard
      </h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-blue-500">
          <div className="flex items-center gap-2 text-gray-500 mb-1"><BookOpen className="w-4 h-4"/> Words Read</div>
          <div className="text-3xl font-bold">{totalWords}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-green-500">
          <div className="flex items-center gap-2 text-gray-500 mb-1"><Activity className="w-4 h-4"/> Avg Accuracy</div>
          <div className="text-3xl font-bold">{avgAccuracy}%</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-purple-500">
          <div className="flex items-center gap-2 text-gray-500 mb-1"><BookOpen className="w-4 h-4"/> Total Sessions</div>
          <div className="text-3xl font-bold">{totalSessions}</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow border-l-4 border-orange-500">
          <div className="flex items-center gap-2 text-gray-500 mb-1"><AlertCircle className="w-4 h-4"/> Recent Misses</div>
          <div className="text-sm text-gray-600 line-clamp-2">
            {history.length > 0 && history[history.length - 1].stats.missedWords.length > 0 
                ? history[history.length - 1].stats.missedWords.slice(0, 3).join(", ") + (history[history.length - 1].stats.missedWords.length > 3 ? "..." : "")
                : "None"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Accuracy Trend */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Accuracy Trend (%)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accuracyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="accuracy" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Speed Trend */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Reading Speed (WPM)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={speedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="speed" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-8 bg-white p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-4 text-gray-700">Detailed Session History</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 font-semibold text-gray-600 w-32 rounded-tl-lg">Date</th>
                <th className="py-3 px-4 font-semibold text-gray-600 w-48">Chapter</th>
                <th className="py-3 px-4 font-semibold text-gray-600">Performance & Feedback</th>
                <th className="py-3 px-4 font-semibold text-gray-600 w-24 rounded-tr-lg">Speed</th>
              </tr>
            </thead>
            <tbody>
              {history.slice().reverse().map((session) => (
                <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50 align-top transition-colors">
                  <td className="py-4 px-4 whitespace-nowrap text-sm text-gray-600">
                    <div className="font-medium">{new Date(session.date).toLocaleDateString()}</div>
                    <div className="text-xs text-gray-400">{new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div className="mt-1 text-xs text-gray-500 font-mono">{Math.round(session.durationSeconds / 60)}m {Math.floor(session.durationSeconds % 60)}s</div>
                  </td>
                  <td className="py-4 px-4 font-medium text-indigo-900">{session.chapterTitle}</td>
                  
                  {/* Scores & Feedback Combined Column */}
                  <td className="py-4 px-4">
                    <div className="flex flex-col md:flex-row md:items-start gap-6">
                        {/* Metrics */}
                        <div className="flex-shrink-0 w-24 space-y-2">
                             <div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Accuracy</div>
                                <div className={`text-lg font-bold ${session.stats.accuracy > 85 ? 'text-green-600' : 'text-orange-600'}`}>
                                    {session.stats.accuracy}%
                                </div>
                             </div>
                             <div>
                                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Pronunciation</div>
                                <div className="text-md font-bold text-blue-600">{session.stats.pronunciation || '-'}%</div>
                             </div>
                        </div>

                        {/* Missed Words Visual */}
                        <div className="flex-grow">
                            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                                Missed / Struggled Words <Info className="w-3 h-3"/>
                            </div>
                            {session.stats.missedWords && session.stats.missedWords.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {session.stats.missedWords.map((word, i) => (
                                        <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-100 hover:bg-red-100 transition-colors cursor-help" title={`Struggled with "${word}"`}>
                                            {word}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center text-green-600 gap-1 text-sm bg-green-50 px-3 py-1.5 rounded-lg w-fit border border-green-100">
                                    <CheckCircle className="w-4 h-4" />
                                    <span className="font-medium">Perfect Reading!</span>
                                </div>
                            )}
                        </div>
                    </div>
                  </td>

                  {/* Speed Column */}
                  <td className="py-4 px-4 text-right">
                     <div className="font-bold text-gray-700 text-lg">{session.stats.speed}</div>
                     <div className="text-xs text-gray-400">WPM</div>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-gray-500 bg-gray-50 rounded-b-lg">
                    <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p>No reading sessions yet. Start a story to see detailed feedback here.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ParentDashboard;